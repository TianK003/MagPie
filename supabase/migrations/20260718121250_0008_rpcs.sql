-- Magpie initial migration 0008: transactional RPCs (the only places cents are minted/moved)
-- Every function: SECURITY DEFINER, set search_path='', EXECUTE revoked from PUBLIC + anon +
-- authenticated, granted only to service_role. Clients reach these strictly via edge functions.

-- ---------------------------------------------------------------------------
-- credit_mention: the single mention-credit mint. One transaction, decision order:
--   lock -> pending check -> forced -> voice gate -> cooldown -> cap -> amount ->
--   budget -> soft anti-fabrication (sightings) -> writes.
-- ---------------------------------------------------------------------------
create function public.credit_mention(
  p_mention_id uuid,
  p_verdict    text,
  p_reason     text,
  p_redacted   text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid;
  v_campaign uuid;
  v_session  uuid;
  v_status   text;
  v_amount   int;
  v_flag     text;
  v_rate     int;
  v_cap      int;
  v_cooldown int;
  v_weekend_mult numeric(3,1);
  v_last_voice timestamptz;
  v_streak   int;
  v_tz       int;
  v_utc_ts   timestamp;
  v_local_ts timestamp;
  v_local_day date;
  v_dow_local int;
  v_utc_dow  int;
  v_utc_time time;
  v_local_weekend boolean;
  v_in_weekend_window boolean;
  v_last_paid timestamptz;
  v_count    int;
  v_v        int;
  v_mult_applied numeric(3,1);
  v_streak_bonus boolean;
  v_new_spent bigint;
  v_paid_in_session int;
  v_has_sighting boolean;
  v_session_paid_count int;
  v_lifetime_earned bigint;
  v_week     date;
begin
  -- 0) resolve owning (user, campaign) via cheap PK read so we can lock BEFORE FOR UPDATE.
  select user_id, campaign_id into v_user, v_campaign
  from public.mentions where id = p_mention_id;
  if not found then
    raise exception 'mention_not_found: %', p_mention_id using errcode = 'P0002';
  end if;

  -- 1) advisory xact lock: serialize cap/cooldown/budget per (user, campaign).
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_campaign::text, 0));

  -- 2) lock the mention row; idempotent re-entry returns current state if already finalized.
  select m.status, m.session_id, c.rate_cents, c.cap_per_day, c.cooldown_seconds,
         c.weekend_multiplier, s.last_two_voice_at, pr.streak_current, pp.tz_offset_minutes,
         m.amount_cents, m.flag_reason
    into v_status, v_session, v_rate, v_cap, v_cooldown,
         v_weekend_mult, v_last_voice, v_streak, v_tz,
         v_amount, v_flag
  from public.mentions m
  join public.campaigns c        on c.id  = m.campaign_id
  join public.sessions  s        on s.id  = m.session_id
  join public.profiles  pr       on pr.id = m.user_id
  left join public.profile_private pp on pp.id = m.user_id
  where m.id = p_mention_id
  for update of m;

  if not found then
    raise exception 'mention_context_missing: %', p_mention_id using errcode = 'P0002';
  end if;

  if v_status <> 'pending' then
    return jsonb_build_object('status', v_status, 'amount_cents', v_amount,
      'flag_reason', v_flag, 'paid_count', null, 'cap_per_day', v_cap);
  end if;

  v_utc_ts    := now() at time zone 'utc';
  v_local_ts  := v_utc_ts + make_interval(mins => coalesce(v_tz, 0));
  v_local_day := v_local_ts::date;
  v_week      := (date_trunc('week', v_utc_ts))::date;

  -- 3) forced verdict (pay only on explicit 'natural').
  if p_verdict is distinct from 'natural' then
    update public.mentions set status='flagged', flag_reason='forced', amount_cents=0,
      redacted_snippet=p_redacted, verified_at=now() where id = p_mention_id;
    return jsonb_build_object('status','flagged','amount_cents',0,'flag_reason','forced',
      'paid_count', null, 'cap_per_day', v_cap);
  end if;

  -- 4) voice gate: a >=2-voice audit must have landed within the last 3 minutes.
  if v_last_voice is null or now() - v_last_voice > interval '3 minutes' then
    update public.mentions set status='flagged', flag_reason='voice_gate', amount_cents=0,
      redacted_snippet=p_redacted, verified_at=now() where id = p_mention_id;
    return jsonb_build_object('status','flagged','amount_cents',0,'flag_reason','voice_gate',
      'paid_count', null, 'cap_per_day', v_cap);
  end if;

  -- 5) cooldown on SERVER time (last paid mention's verified_at), never occurred_at.
  select max(verified_at) into v_last_paid
  from public.mentions
  where user_id = v_user and campaign_id = v_campaign and status = 'paid';
  if v_last_paid is not null and now() - v_last_paid < make_interval(secs => v_cooldown) then
    update public.mentions set status='flagged', flag_reason='cooldown', amount_cents=0,
      redacted_snippet=p_redacted, verified_at=now() where id = p_mention_id;
    return jsonb_build_object('status','flagged','amount_cents',0,'flag_reason','cooldown',
      'paid_count', null, 'cap_per_day', v_cap);
  end if;

  -- 6) daily cap on the USER-LOCAL day (race-free upsert).
  insert into public.daily_counters (user_id, campaign_id, day, paid_count)
  values (v_user, v_campaign, v_local_day, 1)
  on conflict (user_id, campaign_id, day) do update
    set paid_count = public.daily_counters.paid_count + 1
    where public.daily_counters.paid_count < v_cap
  returning paid_count into v_count;

  if v_count is null then
    update public.mentions set status='flagged', flag_reason='cap_reached', amount_cents=0,
      redacted_snippet=p_redacted, verified_at=now() where id = p_mention_id;
    return jsonb_build_object('status','flagged','amount_cents',0,'flag_reason','cap_reached',
      'paid_count', v_cap, 'cap_per_day', v_cap);
  end if;

  -- 7) amount: rate x weekend multiplier (user-local weekend AND now() in [Fri 12:00, Mon 12:00] UTC),
  --    then +5% (integer round-half-up) if streak >= 3.
  v_dow_local := extract(dow from v_local_ts)::int;   -- 0=Sun .. 6=Sat
  v_local_weekend := v_dow_local in (0, 6);
  v_utc_dow  := extract(dow from v_utc_ts)::int;
  v_utc_time := v_utc_ts::time;
  v_in_weekend_window :=
       (v_utc_dow = 5 and v_utc_time >= time '12:00')
    or (v_utc_dow in (6, 0))
    or (v_utc_dow = 1 and v_utc_time < time '12:00');

  v_v := v_rate;
  v_mult_applied := 1.0;
  v_streak_bonus := false;

  if v_local_weekend and v_in_weekend_window and v_weekend_mult <> 1.0 then
    v_v := round(v_v::numeric * v_weekend_mult)::int;
    v_mult_applied := v_weekend_mult;
  end if;

  if coalesce(v_streak, 0) >= 3 then
    v_v := (v_v * 105 + 50) / 100;   -- integer round-half-up of x1.05
    v_streak_bonus := true;
  end if;

  -- 8) budget: atomic decrement; zero rows updated -> exhausted.
  update public.campaigns
    set spent_cents = spent_cents + v_v
    where id = v_campaign and spent_cents + v_v <= budget_cents
  returning spent_cents into v_new_spent;

  if v_new_spent is null then
    update public.mentions set status='flagged', flag_reason='budget_exhausted', amount_cents=0,
      redacted_snippet=p_redacted, verified_at=now() where id = p_mention_id;
    return jsonb_build_object('status','flagged','amount_cents',0,'flag_reason','budget_exhausted',
      'paid_count', v_count, 'cap_per_day', v_cap);
  end if;

  -- 9) soft anti-fabrication: >=3 PAID mentions this session for this campaign AND the server
  --    never independently heard it (zero keyword_sightings) -> flag. Reverse the budget
  --    reservation from step 8 so spent_cents stays truthful (only PAID mentions net-consume it).
  select count(*) into v_paid_in_session
  from public.mentions
  where session_id = v_session and campaign_id = v_campaign and status = 'paid';

  select exists (
    select 1 from public.keyword_sightings ks
    where ks.session_id = v_session and ks.campaign_id = v_campaign
  ) into v_has_sighting;

  if v_paid_in_session >= 3 and not v_has_sighting then
    update public.campaigns set spent_cents = spent_cents - v_v where id = v_campaign;
    update public.mentions set status='flagged', flag_reason='verify_failed', amount_cents=0,
      redacted_snippet=p_redacted, verified_at=now() where id = p_mention_id;
    return jsonb_build_object('status','flagged','amount_cents',0,'flag_reason','verify_failed',
      'paid_count', v_count, 'cap_per_day', v_cap);
  end if;

  -- 10) PAID: finalize mention + ledger + session counters + weekly_stats + lifetime + badges.
  update public.mentions
    set status='paid', amount_cents=v_v, redacted_snippet=p_redacted, verified_at=now(),
        base_rate_cents=v_rate, multiplier_applied=v_mult_applied, streak_bonus_applied=v_streak_bonus
    where id = p_mention_id;

  insert into public.ledger (user_id, amount_cents, kind, mention_id)
  values (v_user, v_v, 'mention', p_mention_id);

  update public.sessions
    set mention_count = mention_count + 1, earnings_cents = earnings_cents + v_v
    where id = v_session
  returning mention_count into v_session_paid_count;

  insert into public.weekly_stats (user_id, week_start, earned_cents, paid_mentions, updated_at)
  values (v_user, v_week, v_v, 1, now())
  on conflict (user_id, week_start) do update
    set earned_cents  = public.weekly_stats.earned_cents + excluded.earned_cents,
        paid_mentions = public.weekly_stats.paid_mentions + 1,
        updated_at    = now();

  update public.profiles
    set lifetime_paid_mentions = lifetime_paid_mentions + 1,
        lifetime_earned_cents  = lifetime_earned_cents + v_v
    where id = v_user
  returning lifetime_earned_cents into v_lifetime_earned;

  if v_lifetime_earned >= 500 then
    insert into public.user_badges (user_id, badge_code) values (v_user, 'first_fiver')
    on conflict do nothing;
  end if;
  if v_session_paid_count >= 5 then
    insert into public.user_badges (user_id, badge_code) values (v_user, 'chatterbox')
    on conflict do nothing;
  end if;

  return jsonb_build_object('status','paid','amount_cents',v_v,'flag_reason',null,
    'paid_count', v_count, 'cap_per_day', v_cap);
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_session_end: end session (idempotent) + streak + invite bonus.
-- ---------------------------------------------------------------------------
create function public.apply_session_end(
  p_session_id uuid,
  p_client_day date
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid;
  v_started    timestamptz;
  v_ended      timestamptz;
  v_voice      boolean;
  v_mentions   int;
  v_earnings   bigint;
  v_server_day date;
  v_day        date;
  v_streak_cur int;
  v_streak_best int;
  v_last_active date;
  v_last_counted date;
  v_counted    boolean := false;
  v_new_streak int;
  v_new_best   int;
  v_redemption record;
  v_inviter    uuid;
  v_lifetime_granted int;
  v_today_granted int;
  v_invite_bonus int := 0;
  v_week       date;
begin
  -- 1) end the active session (idempotent).
  update public.sessions
    set status='ended', ended_at=now(), client_day=p_client_day
    where id = p_session_id and status='active'
  returning user_id, started_at, ended_at, voice_confirmed, mention_count, earnings_cents
    into v_user, v_started, v_ended, v_voice, v_mentions, v_earnings;

  if not found then
    -- already ended (or never active): report current state, no side effects.
    select s.user_id, s.started_at, s.ended_at, s.voice_confirmed, s.mention_count, s.earnings_cents,
           p.streak_current, p.streak_best
      into v_user, v_started, v_ended, v_voice, v_mentions, v_earnings, v_streak_cur, v_streak_best
    from public.sessions s
    join public.profiles p on p.id = s.user_id
    where s.id = p_session_id;
    if not found then
      raise exception 'session_not_found: %', p_session_id using errcode='P0002';
    end if;
    return jsonb_build_object(
      'session', jsonb_build_object('id', p_session_id,
        'duration_seconds', greatest(0, extract(epoch from (coalesce(v_ended, now()) - v_started)))::int,
        'mention_count', v_mentions, 'earnings_cents', v_earnings, 'voice_confirmed', v_voice),
      'streak', jsonb_build_object('current', v_streak_cur, 'best', v_streak_best, 'today_counted', false),
      'invite_bonus_cents', 0);
  end if;

  v_server_day := (now() at time zone 'utc')::date;
  v_week       := (date_trunc('week', now() at time zone 'utc'))::date;

  select streak_current, streak_best into v_streak_cur, v_streak_best
  from public.profiles where id = v_user;
  select last_active_date, last_counted_server_day into v_last_active, v_last_counted
  from public.profile_private where id = v_user;

  v_new_streak := v_streak_cur;
  v_new_best   := v_streak_best;

  if v_voice then
    -- 2a) streak: clamp client day to server UTC date +-1; monotonic; <=1 increment per server day.
    v_day := greatest(v_server_day - 1, least(coalesce(p_client_day, v_server_day), v_server_day + 1));

    if (v_last_counted is distinct from v_server_day)
       and (v_last_active is null or v_day > v_last_active) then
      if v_last_active is not null and v_day = v_last_active + 1 then
        v_new_streak := v_streak_cur + 1;
      else
        v_new_streak := 1;
      end if;
      v_new_best := greatest(v_streak_best, v_new_streak);

      update public.profiles set streak_current=v_new_streak, streak_best=v_new_best where id=v_user;
      update public.profile_private
        set last_active_date=v_day, last_counted_server_day=v_server_day where id=v_user;
      v_counted := true;
    end if;

    -- 2b) invite bonus: grant invitee's first-session $1/$1 if the inviter is under caps.
    select * into v_redemption
    from public.invite_redemptions
    where invitee_id = v_user and bonus_granted_at is null
    for update;

    if found then
      v_inviter := v_redemption.inviter_id;
      -- serialize per-inviter so caps can't be raced by concurrent invitees.
      perform pg_advisory_xact_lock(hashtextextended('invite:' || v_inviter::text, 0));

      select count(*) into v_lifetime_granted
      from public.invite_redemptions
      where inviter_id = v_inviter and bonus_granted_at is not null;

      select count(*) into v_today_granted
      from public.invite_redemptions
      where inviter_id = v_inviter and bonus_granted_at is not null
        and (bonus_granted_at at time zone 'utc')::date = v_server_day;

      if v_lifetime_granted < 10 and v_today_granted < 3 then
        update public.invite_redemptions set bonus_granted_at = now() where invitee_id = v_user;

        insert into public.ledger (user_id, amount_cents, kind, description)
        values (v_user,    100, 'invite_bonus', 'invite bonus (joined)'),
               (v_inviter, 100, 'invite_bonus', 'invite bonus (referral)');

        insert into public.weekly_stats (user_id, week_start, earned_cents, paid_mentions, updated_at)
        values (v_user, v_week, 100, 0, now()), (v_inviter, v_week, 100, 0, now())
        on conflict (user_id, week_start) do update
          set earned_cents = public.weekly_stats.earned_cents + excluded.earned_cents,
              updated_at = now();

        v_invite_bonus := 100;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object('id', p_session_id,
      'duration_seconds', greatest(0, extract(epoch from (v_ended - v_started)))::int,
      'mention_count', v_mentions, 'earnings_cents', v_earnings, 'voice_confirmed', v_voice),
    'streak', jsonb_build_object('current', v_new_streak, 'best', v_new_best, 'today_counted', v_counted),
    'invite_bonus_cents', v_invite_bonus);
end;
$$;

-- ---------------------------------------------------------------------------
-- request_cashout: advisory lock per user; balance >= 500 and >= amount; payout row + debit.
-- ---------------------------------------------------------------------------
create function public.request_cashout(
  p_user   uuid,
  p_amount bigint,
  p_method text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_payout  uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('cashout:' || p_user::text, 0));

  select coalesce(sum(amount_cents), 0) into v_balance
  from public.ledger where user_id = p_user;

  if v_balance < 500 then
    raise exception 'below_threshold' using errcode = 'P0001';
  end if;
  if p_amount < 500 or p_amount > v_balance then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  insert into public.payout_requests (user_id, amount_cents, method)
  values (p_user, p_amount, p_method) returning id into v_payout;

  insert into public.ledger (user_id, amount_cents, kind, payout_request_id)
  values (p_user, -p_amount, 'payout', v_payout);

  return jsonb_build_object('payout_request_id', v_payout, 'amount_cents', p_amount,
    'new_balance_cents', v_balance - p_amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- redeem_invite_tx: resolve inviter by code; reject invalid/self/already/tombstoned;
-- insert redemption + friendship + tombstone. Returns inviter {id, display_name}.
-- ---------------------------------------------------------------------------
create function public.redeem_invite_tx(
  p_invitee    uuid,
  p_code       text,
  p_email_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter uuid;
  v_name    text;
begin
  select pp.id into v_inviter from public.profile_private pp where pp.invite_code = p_code;
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  if v_inviter = p_invitee then
    raise exception 'self_invite' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.invite_redemptions where invitee_id = p_invitee) then
    raise exception 'already_redeemed' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.invite_tombstones where email_hash = p_email_hash) then
    raise exception 'tombstoned' using errcode = 'P0001';
  end if;

  begin
    insert into public.invite_redemptions (invitee_id, inviter_id) values (p_invitee, v_inviter);
  exception when unique_violation then
    raise exception 'already_redeemed' using errcode = 'P0001';
  end;

  insert into public.friendships (user_low, user_high)
  values (least(p_invitee, v_inviter), greatest(p_invitee, v_inviter))
  on conflict do nothing;

  insert into public.invite_tombstones (email_hash) values (p_email_hash) on conflict do nothing;

  select display_name into v_name from public.profiles where id = v_inviter;

  return jsonb_build_object('inviter', jsonb_build_object('id', v_inviter, 'display_name', v_name));
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_user: flips the ledger append-only escape hatch, deletes the user's rows in
-- FK-safe order. invite_tombstones SURVIVE (anti-farming). Called by delete-account
-- before auth.admin.deleteUser.
-- ---------------------------------------------------------------------------
create function public.purge_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.allow_ledger_mutation', 'on', true);

  delete from public.ledger where user_id = p_user;
  delete from public.keyword_sightings
    where session_id in (select id from public.sessions where user_id = p_user);
  delete from public.mentions where user_id = p_user;
  delete from public.daily_counters where user_id = p_user;
  delete from public.weekly_stats where user_id = p_user;
  delete from public.payout_requests where user_id = p_user;
  delete from public.opt_ins where user_id = p_user;
  delete from public.sessions where user_id = p_user;
  delete from public.user_badges where user_id = p_user;
  delete from public.friendships where user_low = p_user or user_high = p_user;
  delete from public.invite_redemptions where invitee_id = p_user or inviter_id = p_user;
  delete from public.profile_private where id = p_user;
  delete from public.profiles where id = p_user;
  -- invite_tombstones deliberately NOT deleted.
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: lock every money/social RPC to service_role only.
-- ---------------------------------------------------------------------------
revoke execute on function public.credit_mention(uuid, text, text, text) from public;
revoke execute on function public.credit_mention(uuid, text, text, text) from anon, authenticated;
grant  execute on function public.credit_mention(uuid, text, text, text) to service_role;

revoke execute on function public.apply_session_end(uuid, date) from public;
revoke execute on function public.apply_session_end(uuid, date) from anon, authenticated;
grant  execute on function public.apply_session_end(uuid, date) to service_role;

revoke execute on function public.request_cashout(uuid, bigint, text) from public;
revoke execute on function public.request_cashout(uuid, bigint, text) from anon, authenticated;
grant  execute on function public.request_cashout(uuid, bigint, text) to service_role;

revoke execute on function public.redeem_invite_tx(uuid, text, text) from public;
revoke execute on function public.redeem_invite_tx(uuid, text, text) from anon, authenticated;
grant  execute on function public.redeem_invite_tx(uuid, text, text) to service_role;

revoke execute on function public.purge_user(uuid) from public;
revoke execute on function public.purge_user(uuid) from anon, authenticated;
grant  execute on function public.purge_user(uuid) to service_role;
