I have all the mandatory inputs (briefing, CLAUDE.md, the 7ca4989 design spec). The repo is greenfield, so this design defines everything from scratch. Below is the complete backend architecture deliverable.

# Magpie Backend Architecture (Supabase project `wqxgqqbupmfvmalejnxj`)

## 0. Shape of the system

- **Clients hold only the publishable key.** All reads go through RLS-guarded tables/views. All money-moving and provider-touching writes go through Edge Functions using the service-role client, which call **SECURITY DEFINER RPCs** so every anti-gaming decision (advisory lock + cap + cooldown + ledger insert) happens in **one Postgres transaction**.
- **Money**: `bigint`/`int` cents everywhere. `ledger` is append-only; balance = `SUM(amount_cents)`. Every credit references a `mentions` row or an invite/payout.
- **Realtime**: one private broadcast channel per user (`user:{uuid}`); DB triggers push mention flips, ledger/badge events, and friends-leaderboard updates onto it. Clients never use `postgres_changes`.
- **Text + CHECK constraints instead of Postgres enums** (easier to evolve on a prod-only project). Timestamps `timestamptz`, UTC-server-authoritative; the only client-supplied time facts are `clientDay` (streaks) and `tzOffsetMinutes` (weekend multiplier), both sanity-clamped.

---

## 1. Postgres DDL sketch

All tables in `public`, `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on every one. `gen_random_uuid()` is built in; enable `pg_cron` + `pg_net` in migration 001.

### 1.1 `profiles`

```sql
create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  display_name           text not null default '',
  payout_method          text check (payout_method in ('paypal','venmo','bank')),
  consent_at             timestamptz,
  onboarded_at           timestamptz,          -- set when 3-step onboarding completes
  tz_offset_minutes      int  not null default 0 check (tz_offset_minutes between -840 and 840),
  invite_code            text not null unique, -- 8-char, generated in handle_new_user
  streak_current         int  not null default 0,
  streak_best            int  not null default 0,
  last_active_date       date,                 -- device-local day of last voice-confirmed session
  lifetime_paid_mentions int  not null default 0,
  lifetime_earned_cents  bigint not null default 0,
  level int generated always as (
    case when lifetime_paid_mentions >= 200 then 4
         when lifetime_paid_mentions >= 75  then 3
         when lifetime_paid_mentions >= 25  then 2
         else 1 end) stored,
  created_at             timestamptz not null default now()
);
```

- `handle_new_user` SECURITY DEFINER trigger on `auth.users` INSERT: creates the row, `display_name = split_part(email,'@',1)`, `invite_code = upper(substr(md5(gen_random_uuid()::text),1,8))` (retry loop on unique violation).
- **Column-level grants** protect server-owned fields: `REVOKE UPDATE ON public.profiles FROM authenticated; GRANT UPDATE (display_name, payout_method, consent_at, onboarded_at, tz_offset_minutes) ON public.profiles TO authenticated;` — streaks/lifetime/level/invite_code are edge-function-only.

### 1.2 `campaigns`

```sql
create table public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,           -- 'voltz-energy' — stable seed key
  name               text not null,
  category           text not null,
  rate_cents         int  not null check (rate_cents > 0),
  cap_per_day        int  not null check (cap_per_day > 0),
  weekend_multiplier numeric(3,1) not null default 1.0,
  min_level          int  not null default 1,
  cooldown_seconds   int  not null default 60,
  keywords           text[] not null,                -- canonical spot terms; fuzzy variants client-side
  logo_url           text,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
```

### 1.3 `opt_ins`

```sql
create table public.opt_ins (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (user_id, campaign_id)
);
create index opt_ins_campaign_idx on public.opt_ins (campaign_id);
```

### 1.4 `sessions`

```sql
create table public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  status             text not null default 'active' check (status in ('active','ended')),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  client_day         date,                    -- device-local day, set at session-end
  voice_confirmed    boolean not null default false,
  voice_confirmed_at timestamptz,
  mention_count      int    not null default 0,   -- PAID mentions only
  earnings_cents     bigint not null default 0,   -- denormalized display; ledger is truth
  stt_provider       text check (stt_provider in ('elevenlabs','openai')),
  data_deleted_at    timestamptz,             -- delete-session-data ran
  created_at         timestamptz not null default now()
);
create index sessions_user_started_idx on public.sessions (user_id, started_at desc);
create unique index sessions_one_active_idx on public.sessions (user_id) where status = 'active';
```

### 1.5 `mentions`

```sql
create table public.mentions (
  id                uuid primary key default gen_random_uuid(),
  client_mention_id uuid not null unique,          -- client-generated; idempotency key
  session_id        uuid not null references public.sessions(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  campaign_id       uuid not null references public.campaigns(id) on delete restrict,
  keyword           text not null,
  occurred_at       timestamptz not null,
  status            text not null default 'pending' check (status in ('pending','paid','flagged')),
  flag_reason       text check (flag_reason in
    ('forced','duplicate','rate','cap_reached','cooldown','voice_gate','verify_failed')),
  redacted_snippet  text,          -- regex-redacted at insert; LLM-redacted at verdict; NULL after data delete
  amount_cents      int not null default 0,
  base_rate_cents   int not null,
  multiplier_applied numeric(3,1) not null default 1.0,
  streak_bonus_applied boolean not null default false,
  verify_attempts   int not null default 0,
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index mentions_session_idx on public.mentions (session_id, occurred_at);
create index mentions_cooldown_idx on public.mentions (user_id, campaign_id, occurred_at desc)
  where status = 'paid';                       -- cooldown lookup
create index mentions_pending_idx on public.mentions (created_at) where status = 'pending'; -- retry sweep
```

### 1.6 `ledger` (append-only)

```sql
create table public.ledger (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  amount_cents      bigint not null check (amount_cents <> 0),  -- + credit, − debit
  kind              text not null check (kind in ('mention','invite_bonus','payout','adjustment')),
  mention_id        uuid references public.mentions(id),
  payout_request_id uuid references public.payout_requests(id),
  description       text,
  created_at        timestamptz not null default now(),
  week_start date generated always as
    ((date_trunc('week', created_at at time zone 'utc'))::date) stored,  -- immutable form
  check ((kind = 'mention') = (mention_id is not null)),
  check ((kind = 'payout')  = (payout_request_id is not null))
);
create index ledger_user_idx      on public.ledger (user_id, created_at desc);
create index ledger_user_week_idx on public.ledger (user_id, week_start);

-- Append-only enforcement (applies to service role too; bypass only inside purge_user RPC):
create function public.tg_ledger_append_only() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_ledger_mutation', true), '') <> 'on' then
    raise exception 'ledger is append-only';
  end if;
  return coalesce(new, old);
end $$;
create trigger ledger_append_only before update or delete on public.ledger
  for each row execute function public.tg_ledger_append_only();
```

Balance = `select coalesce(sum(amount_cents),0) from ledger where user_id = ?` (index makes this cheap at v1 scale; cache only if measured).

### 1.7 `daily_counters` (race-free daily cap)

```sql
create table public.daily_counters (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  day         date not null,                  -- UTC day, server-computed
  paid_count  int  not null default 0,
  primary key (user_id, campaign_id, day)
);
```

### 1.8 `weekly_stats` (leaderboard surface — the only cross-user financial read)

```sql
create table public.weekly_stats (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  week_start    date not null,                -- ISO Monday, UTC
  earned_cents  bigint not null default 0,    -- positive earnings only (mention + invite_bonus)
  paid_mentions int    not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);
create index weekly_stats_week_idx on public.weekly_stats (week_start);
```

Rationale: the briefing's `security_invoker` view pattern can't let friends read each other's raw `ledger` (private financial detail). `weekly_stats` is a coarse aggregate maintained in the same transaction as each credit; friends get RLS SELECT on it; the leaderboard view stays plain `security_invoker`.

### 1.9 `payout_requests`

```sql
create table public.payout_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount_cents  bigint not null check (amount_cents >= 500),
  method        text not null check (method in ('paypal','venmo','bank')),
  status        text not null default 'requested' check (status in ('requested','sent','failed')),
  requested_at  timestamptz not null default now(),
  processed_at  timestamptz
);
create index payout_requests_user_idx on public.payout_requests (user_id, requested_at desc);
```

(Note: `payout_requests` must be created before `ledger` or the ledger FK added after — see migration ordering §7.)

### 1.10 `friendships` (ordered pair) + `invite_redemptions`

```sql
create table public.friendships (
  user_low   uuid not null references public.profiles(id) on delete cascade,
  user_high  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);
create index friendships_high_idx on public.friendships (user_high);

create table public.invite_redemptions (
  invitee_id       uuid primary key references public.profiles(id) on delete cascade, -- 1 redemption per user, ever
  inviter_id       uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  bonus_granted_at timestamptz,   -- set when invitee completes first voice-confirmed session
  check (invitee_id <> inviter_id)
);
create index invite_redemptions_inviter_idx on public.invite_redemptions (inviter_id);
```

### 1.11 `badges` + `user_badges`

```sql
create table public.badges (
  code text primary key,            -- 'first_fiver' | 'chatterbox' | 'brand_loyalist'
  name text not null,
  description text not null,
  active boolean not null default true,   -- brand_loyalist seeded inactive/locked
  sort int not null default 0
);
create table public.user_badges (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge_code text not null references public.badges(code),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);
```

### 1.12 Leaderboard view

```sql
create view public.friends_leaderboard
with (security_invoker = true) as
select p.id as user_id, p.display_name, ws.week_start, ws.earned_cents, ws.paid_mentions
from public.weekly_stats ws
join public.profiles p on p.id = ws.user_id
where ws.week_start = (date_trunc('week', now() at time zone 'utc'))::date;
```

Invoker RLS on `weekly_stats`/`profiles` (self-or-friend) filters rows automatically. Client renders "You" row even when `weekly_stats` has no row yet (zero week).

---

## 2. RLS policy matrix

Every policy uses the `(select auth.uid())` initplan form; role `authenticated` only (no `anon` access anywhere). "—" = no policy = denied; those writes happen only via service role (bypasses RLS) inside edge functions/RPCs.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | self **or** friend: `id = (select auth.uid()) or exists(select 1 from friendships f where f.user_low = least(id,(select auth.uid())) and f.user_high = greatest(id,(select auth.uid())))` | — (trigger creates) | `using (id = (select auth.uid()))` + column grants (§1.1) | — |
| `campaigns` | `using (active)` (locked cards render from `min_level`) | — | — | — |
| `opt_ins` | own | `with check (user_id = (select auth.uid()) and exists(select 1 from campaigns c join profiles p on p.id = (select auth.uid()) where c.id = campaign_id and c.active and p.level >= c.min_level))` | — | own: `using (user_id = (select auth.uid()))` |
| `sessions` | own | — (edge only) | — (edge only) | — |
| `mentions` | own | — | — | — |
| `ledger` | own | — | — (trigger blocks all) | — (trigger blocks all) |
| `daily_counters` | own (lets client show "cap reached" proactively) | — | — | — |
| `weekly_stats` | self **or** friend (same pair-EXISTS as profiles) | — | — | — |
| `payout_requests` | own | — (cashout fn only — needs atomic balance check + debit) | — | — |
| `friendships` | `using ((select auth.uid()) in (user_low, user_high))` | — (redeem-invite fn only) | — | — |
| `invite_redemptions` | `using ((select auth.uid()) in (invitee_id, inviter_id))` | — | — | — |
| `badges` | `using (true)` to authenticated | — | — | — |
| `user_badges` | own | — | — | — |
| `realtime.messages` | see §4 | — (clients never send) | — | — |

**Edge-function-only writes**: sessions (start/end/voice_confirmed), mentions (all), ledger (all), daily_counters, weekly_stats, payout_requests, friendships, invite_redemptions, user_badges, profiles server-owned columns. The only direct client writes in the whole app: `opt_ins` insert/delete, `profiles` safe-column update.

---

## 3. Transactional RPCs (SECURITY DEFINER, `set search_path = ''`, EXECUTE revoked from `authenticated`/`anon` — callable only by service role)

### 3.1 `credit_mention(p_mention_id uuid, p_verdict text, p_reason text, p_redacted text) returns jsonb`

The single place money is minted. One transaction:

```
1. perform pg_advisory_xact_lock(hashtextextended(user_id::text || ':' || campaign_id::text, 0));
   -- serializes all cap/cooldown decisions per (user, campaign)
2. select mention row FOR UPDATE; abort if status <> 'pending' (idempotent re-entry returns current state)
3. if p_verdict = 'forced'  -> finalize flagged('forced')
4. cooldown: select max(occurred_at) from mentions where user_id=.. and campaign_id=.. and status='paid';
   if now() - last < campaign.cooldown_seconds -> finalize flagged('cooldown')
5. daily cap (race-free):
     insert into daily_counters (user_id, campaign_id, day, paid_count)
     values (.., .., (now() at time zone 'utc')::date, 1)
     on conflict (user_id, campaign_id, day) do update
       set paid_count = daily_counters.paid_count + 1
       where daily_counters.paid_count < campaign.cap_per_day
     returning paid_count into v_count;
   if v_count is null -> finalize flagged('cap_reached')
6. amount: v = rate_cents;
   if weekend in user-local time (occurred_at + profiles.tz_offset_minutes falls on Sat/Sun)
     -> v = round(v * weekend_multiplier);
   if profiles.streak_current >= 3 -> v = (v * 105 + 50) / 100, streak_bonus_applied = true
7. update mentions set status='paid', amount_cents=v, redacted_snippet=p_redacted, verified_at=now(), ...
8. insert into ledger (user_id, amount_cents, kind, mention_id) values (.., v, 'mention', ..);
9. update sessions set mention_count = mention_count + 1, earnings_cents = earnings_cents + v;
10. insert into weekly_stats .. on conflict (user_id, week_start) do update
      set earned_cents = weekly_stats.earned_cents + v, paid_mentions = weekly_stats.paid_mentions + 1;
11. update profiles set lifetime_paid_mentions = lifetime_paid_mentions + 1,
      lifetime_earned_cents = lifetime_earned_cents + v;
12. badges: if lifetime_earned crossed 500 -> insert user_badges('first_fiver') on conflict do nothing;
    if this session's mention_count reached 5 -> insert 'chatterbox';
13. return jsonb: { status, amount_cents, flag_reason, paid_count, cap_per_day }
```

`finalize flagged(reason)` = update mention `status='flagged', flag_reason=reason, amount_cents=0, redacted_snippet=p_redacted, verified_at=now()`. Flagged mentions are kept and shown ("flagged, not paid") — never silently dropped.

### 3.2 `apply_session_end(p_session_id uuid, p_client_day date) returns jsonb`

```
1. update sessions set status='ended', ended_at=now(), client_day=p_client_day
   where id=.. and status='active' returning *; (no row -> already ended, return current)
2. if voice_confirmed:
   a. streak (p_client_day clamped to server_utc_date ± 1 day):
      if last_active_date is null or p_client_day > last_active_date:
        streak_current = case when p_client_day = last_active_date + 1 then streak_current + 1 else 1 end;
        streak_best = greatest(streak_best, streak_current); last_active_date = p_client_day;
   b. invite bonus: select from invite_redemptions where invitee_id = user and bonus_granted_at is null FOR UPDATE;
      if found -> set bonus_granted_at = now();
        insert ledger (+100, 'invite_bonus') for invitee AND inviter;
        upsert weekly_stats for both (+100 earned);
        (ledger trigger broadcasts to both users' channels)
3. return { session summary, streak: {current, best, today_counted}, invite_bonus_cents }
```

### 3.3 `request_cashout(p_user uuid, p_amount bigint, p_method text) returns jsonb`

```
1. perform pg_advisory_xact_lock(hashtextextended('cashout:' || p_user::text, 0));
2. balance := (select coalesce(sum(amount_cents),0) from ledger where user_id = p_user);
3. require balance >= 500 and p_amount between 500 and balance -> else raise 'below_threshold'/'insufficient';
4. insert payout_requests -> id; insert ledger (-p_amount, 'payout', payout_request_id);
5. return { payout_request_id, amount_cents, new_balance_cents }
```

(Concurrent credits are safe — they only increase balance; the lock only serializes cashouts.)

### 3.4 `redeem_invite_tx(p_invitee uuid, p_code text) returns jsonb`

Resolve `inviter` by `profiles.invite_code`; reject `invalid_code` / `self_invite`; `insert invite_redemptions` (PK violation → `already_redeemed`); `insert friendships (least(a,b), greatest(a,b)) on conflict do nothing`. Returns inviter `{id, display_name}`.

### 3.5 `purge_user(p_user uuid)`

`perform set_config('app.allow_ledger_mutation','on', true);` then delete the user's rows (ledger last), used by `delete-account` before `auth.admin.deleteUser` (whose FK cascade would otherwise trip the append-only trigger).

---

## 4. Realtime design (private broadcast, one channel per user)

**Topic**: `user:{uuid}` — the ONLY channel a client subscribes to. Client flow: `supabase.realtime.setAuth()` after sign-in → `supabase.channel('user:' + uid, { config: { private: true } })` → handle events: `mention_status`, `ledger`, `leaderboard`, `badge`.

**RLS on `realtime.messages`** (receive-only):

```sql
create policy user_channel_receive on realtime.messages
for select to authenticated
using ( realtime.topic() = 'user:' || (select auth.uid())::text
        and extension = 'broadcast' );
-- no INSERT policy: clients cannot send
```

**Triggers** (all SECURITY DEFINER, AFTER, FOR EACH ROW):

| Trigger | Table / event | Mechanism | Topic(s) | Payload |
|---|---|---|---|---|
| `mentions_broadcast` | AFTER UPDATE OF status (when `old.status = 'pending'` and `new.status <> 'pending'`) | `realtime.broadcast_changes('user:'||new.user_id, 'mention_status', 'UPDATE', 'mentions', 'public', new, old)` | owner | full row (own channel, snippet already redacted) — drives the `pending → paid/flagged` receipt flip |
| `weekly_stats_broadcast` | AFTER INSERT OR UPDATE | `realtime.send(payload, 'leaderboard', topic, true)` — once to `'user:'||new.user_id`, then loop over `friendships` rows containing the user and send to each friend's `user:{id}` topic (invite-only friend graphs are small; loop is fine) | owner + each friend | `{user_id, week_start, earned_cents, paid_mentions}` — exactly the data the leaderboard shows, nothing more |
| `ledger_broadcast` | AFTER INSERT | `realtime.send` | owner | `{kind, amount_cents, created_at}` → client refetches balance/history (covers invite-bonus arriving while inviter is elsewhere in app) |
| `user_badges_broadcast` | AFTER INSERT | `realtime.send` | owner | `{badge_code, awarded_at}` |

Client subscriptions per screen: recording/summary screens react to `mention_status`; Rank tab re-sorts on `leaderboard`; Home/Wallet refetch on `ledger`. Everything arrives on the single already-open channel — well within the 200-connection free-tier budget (1 per online user).

---

## 5. Edge functions

Layout: `supabase/functions/{name}/index.ts` + `supabase/functions/_shared/{clients.ts, responses.ts, redact.ts, verifyPrompt.ts}`. Every function: `verify_jwt = true` (except `housekeeping`), user identity from a user-scoped client built off the `Authorization` header, privileged writes via service-role client (auto-injected env). Secrets: `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET` (via `supabase secrets set`). Response envelope everywhere:

```ts
type Ok<T>  = { ok: true } & T;
type Err    = { ok: false; error: { code: string; message: string; retryable?: boolean } };
```

### 5.1 `stt-token` — POST

```ts
type Req = { provider?: 'elevenlabs' | 'openai' };   // default 'elevenlabs'
type Res =
 | Ok<{ provider: 'elevenlabs'; wsUrl: string;      // wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=sutkn_…
        expiresAt: string; audio: { encoding: 'pcm_16000'; sampleRateHz: 16000 } }>
 | Ok<{ provider: 'openai'; wsUrl: 'wss://api.openai.com/v1/realtime?intent=transcription';
        token: string /* ek_… goes in Authorization header */; model: 'gpt-4o-mini-transcribe';
        expiresAt: string; audio: { encoding: 'pcm16'; sampleRateHz: 24000 } }>
 | Err; // codes: 'not_onboarded' | 'provider_unavailable' | 'rate_limited'
```

Logic: require `profiles.onboarded_at`. ElevenLabs: `POST /v1/single-use-token/realtime_scribe` (xi-api-key). **If ElevenLabs fails (non-2xx/network), automatically mint OpenAI ephemeral secret** (`POST /v1/realtime/client_secrets`, `session.type: 'transcription'`) and return `provider: 'openai'` — client's `SttStream` factory switches on `provider`. Soft rate limit: reject if the user requested > 10 tokens in 10 min (in-memory best effort; not security-critical since tokens are single-use/short-lived). No DB writes.

### 5.2 `session-start` — POST

```ts
type Req = { tzOffsetMinutes: number; sttProvider?: 'elevenlabs' | 'openai' };
type Res = Ok<{
  sessionId: string; startedAt: string; streakCurrent: number; streakBonusActive: boolean;
  campaigns: Array<{ id: string; name: string; keywords: string[]; rateCents: number;
                     capPerDay: number; remainingToday: number; cooldownSeconds: number;
                     weekendMultiplier: number }>;   // opted-in only — the client keyword-spotting config
}> | Err; // 'not_onboarded' | 'no_opt_ins'
```

Service role: end any dangling `active` session (`sessions_one_active_idx` guarantees ≤1), insert new session, update `profiles.tz_offset_minutes` (clamped), join `opt_ins × campaigns × daily_counters` for `remainingToday = cap_per_day - coalesce(paid_count,0)`.

### 5.3 `diarize` — POST (two actions)

```ts
type Req =
 | { action: 'upload-url'; sessionId: string }
 | { action: 'analyze';    sessionId: string; path: string };
type Res =
 | Ok<{ action: 'upload-url'; path: string; token: string }>   // for supabase.storage.uploadToSignedUrl
 | Ok<{ action: 'analyze'; speakerCount: number; voiceConfirmed: boolean }>
 | Err; // 'session_invalid' | 'chunk_missing' | 'chunk_too_large' | 'provider_error' (retryable)
```

- `upload-url`: verify session belongs to caller and is `active`; service role `createSignedUploadUrl('diarization', '{userId}/{sessionId}/{epochMs}.wav')`.
- `analyze`: verify path prefix is `{callerId}/{sessionId}/` (path forgery guard); service-role download (reject > 2 MB); `POST https://api.elevenlabs.io/v1/speech-to-text` multipart, `model_id: scribe_v2`, `diarize: true`; count distinct `speaker_id` over words, **a speaker counts only with ≥ 3 words** (noise guard); if ≥ 2 → `update sessions set voice_confirmed = true, voice_confirmed_at = now() where id = .. and voice_confirmed = false`. **Always delete the storage object in `finally`** (cron is only the orphan safety net). Client calls this every ~30 s with the last 10–15 s of ring-buffered PCM wrapped in a WAV header; once confirmed, client stops auditing (v1: confirm once per session).

### 5.4 `verify-mention` — POST (fast-ack + background verdict)

```ts
type Req = {
  sessionId: string; campaignId: string;
  clientMentionId: string;            // client-generated uuid — idempotency
  keyword: string;
  snippet: string;                    // raw ±10s text; NEVER stored raw
  occurredAt: string;                 // ISO
};
type Res = Ok<{ mentionId: string; status: 'pending' }>       // final state arrives via realtime
 | Ok<{ mentionId: string; status: 'paid' | 'flagged'; amountCents: number; flagReason?: string }> // idempotent replay
 | Err; // 'session_invalid' | 'voice_gate' | 'not_opted_in' | 'campaign_inactive'
        //  | 'snippet_too_long' | 'rate_limited'
```

Synchronous phase (fast, no LLM):
1. Session belongs to caller, `status='active'` **or** ended < 2 min ago (in-flight hits during summary); `voice_confirmed = true` else `voice_gate`.
2. Opt-in exists; campaign active; `snippet.length <= 1200`.
3. Cheap heuristics that don't need an LLM: identical snippet hash already seen this session → insert directly as `flagged('duplicate')`; > 6 mentions in the last 60 s in this session → `flagged('rate')`.
4. **Regex-redact** the snippet (§6) and insert the `mentions` row as `pending` with the regex-redacted text (`on conflict (client_mention_id) do nothing` → replay returns the existing row's state).
5. Respond `{ status: 'pending' }` immediately, then `EdgeRuntime.waitUntil(verdict())`.

Background `verdict()`: gpt-4o-mini combined judge+redact call (§6) → `credit_mention(mentionId, verdict, reason, llmRedactedSnippet)` RPC — the advisory lock + cooldown + ON CONFLICT cap + ledger insert all inside that one transaction (§3.1). The mentions UPDATE trigger broadcasts the flip. On LLM failure: bump `verify_attempts`, leave `pending` — the housekeeping sweep retries using the stored regex-redacted snippet; after 3 attempts → `flagged('verify_failed')` (transparent, not silent).

### 5.5 `session-end` — POST

```ts
type Req = { sessionId: string; clientDay: string /* YYYY-MM-DD, device-local */ };
type Res = Ok<{
  session: { id: string; durationSeconds: number; mentionCount: number; earningsCents: number; voiceConfirmed: boolean };
  streak: { current: number; best: number; todayCounted: boolean; bonusActive: boolean };
  inviteBonusCents: 0 | 100;          // invitee's own $1 if this granted it
}> | Err; // 'session_invalid' | 'bad_client_day'
```

Validates ownership + `clientDay` within server UTC date ± 1, then calls `apply_session_end` RPC (§3.2). Note for the summary sheet: pending mentions may still flip after this response — client keeps the channel open on the summary screen.

### 5.6 `redeem-invite` — POST

```ts
type Req = { code: string };
type Res = Ok<{ inviter: { id: string; displayName: string }; friendshipCreated: true;
               bonusPendingCents: 100 }>   // granted after first 2-voice session
 | Err; // 'invalid_code' | 'self_invite' | 'already_redeemed'
```

Calls `redeem_invite_tx` (§3.4). The $1/$1 is deliberately NOT paid here (anti-farming, locked decision) — `apply_session_end` pays it.

### 5.7 `cashout` — POST

```ts
type Req = { amountCents?: number /* default: full balance */; method?: 'paypal'|'venmo'|'bank' /* default: profile */ };
type Res = Ok<{ payoutRequestId: string; amountCents: number; newBalanceCents: number }>
 | Err; // 'below_threshold' | 'insufficient_balance' | 'no_payout_method'
```

Calls `request_cashout` (§3.3). No provider integration (locked decision) — the row is fulfilled manually; client shows "$X.XX sent — lands in 1–2 days".

### 5.8 `delete-session-data` — POST

```ts
type Req = { sessionId: string };
type Res = Ok<{ deleted: true }> | Err; // 'session_invalid'
```

Ownership check, then service role: `update mentions set redacted_snippet = null where session_id = ..` (rows and ledger stay — every cent remains traceable by amount/timestamp; the *content* is what the privacy promise deletes); delete all storage objects under `diarization/{userId}/{sessionId}/`; `update sessions set data_deleted_at = now()`.

### 5.9 `delete-account` — POST

```ts
type Req = { confirm: 'delete my account' };
type Res = Ok<{ deleted: true }> | Err;
```

Service role: delete the user's storage prefix → `purge_user(uid)` RPC (§3.5) → `auth.admin.deleteUser(uid)`.

### 5.10 `housekeeping` — POST, `verify_jwt = false`, requires header `x-cron-secret == CRON_SECRET`

Duties (idempotent): (a) list `diarization` bucket objects older than 60 min and delete via Storage API; (b) retry `pending` mentions older than 3 min (`verify_attempts < 3`) through the same verdict path using the stored regex-redacted snippet; flag `verify_failed` at attempt 3.

**pg_cron** (migration 011): store `CRON_SECRET` in Vault; two jobs:
- every 10 min: `net.http_post('https://wqxgqqbupmfvmalejnxj.supabase.co/functions/v1/housekeeping', headers with x-cron-secret)`;
- every 15 min (pure SQL, no HTTP): `update sessions set status='ended', ended_at=now() where status='active' and started_at < now() - interval '6 hours'`.

---

## 6. Verification & redaction pipeline

**Stage 1 — regex pre-redaction** (in `_shared/redact.ts`, runs before anything is stored or sent to OpenAI; each match → `[redacted]`):

```
email      /[\w.+-]+@[\w-]+\.[\w.-]+/g
phone      /\+?\d[\d\s().-]{6,}\d/g
url        /https?:\/\/\S+|www\.\S+/gi
handle     /@\w{2,}/g
digit runs /\d{5,}/g                      (accounts, SSNs, cards)
```

**Stage 2 — gpt-4o-mini combined judge + redact** (one call, temperature 0, `response_format: json_schema` strict, max_tokens 350):

System prompt (essence):

```
You verify brand mentions for Magpie, an app that pays people for mentioning brands in real
spoken conversations. You are given a transcript snippet (~20s of speech) and the target brand.

TASK 1 — verdict. "natural": the brand comes up inside a genuine exchange — surrounding talk has
its own topic, the mention has conversational context (opinion, story, question, recommendation).
"forced": gaming — the brand (or several brands) repeated with little other content; reading a
list or ad-style script; monologue addressing an app/device; filler words wrapped around the
keyword; the snippet is mostly brand names.
When genuinely ambiguous, lean "natural" — false flags hurt honest users more than a few cents.

TASK 2 — redact. Rewrite the snippet replacing person names, phone numbers, emails, street
addresses, employer/school names, health conditions, and financial details with [redacted].
Keep the brand name "{brand}" and the conversational flavor intact. Do not add content.

Respond only as JSON: {"verdict":"natural"|"forced","reason":"<≤12 words, user-visible>","redacted_snippet":"..."}
```

User message: `brand: {name} · keyword hit: "{keyword}"` + the regex-redacted snippet. Include 2–3 few-shot pairs (one natural, one repetition-spam, one list-read) inline in the system prompt.

**What is stored, ever**: only `mentions.redacted_snippet` — regex-redacted at insert (pending window, minutes), replaced with the LLM-redacted version at verdict. Raw snippet lives only in function memory; never logged. Raw audio exists only as the transient diarization chunk, deleted in `diarize`'s `finally` + cron sweep. Full transcript never leaves the device.

**Verdict → money mapping**: `natural` → paid path (still subject to cooldown → cap → multipliers inside `credit_mention`); `forced` → `flagged('forced')` with the LLM's short reason surfaced in the receipt. Order matters: heuristics (duplicate/rate) run before the LLM to save calls; cooldown and cap run inside the lock so they're race-free.

---

## 7. Migrations (applied to prod in order via `mcp__supabase__apply_migration`; run `get_advisors` after)

| # | Name | Contents |
|---|---|---|
| 001 | `extensions` | `create extension if not exists pg_cron; create extension if not exists pg_net;` |
| 002 | `profiles` | §1.1 table + RLS + column grants + `handle_new_user` trigger |
| 003 | `campaigns_opt_ins` | §1.2–1.3 + RLS |
| 004 | `sessions_mentions` | §1.4–1.5 + RLS |
| 005 | `money` | `payout_requests` → `ledger` (+ append-only trigger, week_start) → `daily_counters` → `weekly_stats` + RLS |
| 006 | `social` | `friendships`, `invite_redemptions`, `badges`, `user_badges` + RLS |
| 007 | `views` | `friends_leaderboard` (security_invoker) |
| 008 | `rpcs` | `credit_mention`, `apply_session_end`, `request_cashout`, `redeem_invite_tx`, `purge_user` (+ revoke EXECUTE from authenticated/anon) |
| 009 | `realtime` | broadcast triggers (§4) + `realtime.messages` policy |
| 010 | `storage` | `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('diarization','diarization', false, 5242880, array['audio/wav','audio/x-wav'])` — no client storage policies (signed upload URLs + service role only) |
| 011 | `cron` | Vault secret + 2 `cron.schedule` jobs (§5.10) — apply after first function deploy |
| 012 | `seed` | campaigns + badges below |

**Seed — campaigns** (keyed by `slug`, idempotent `on conflict (slug) do nothing`):

| slug | name | category | rate¢ | cap/day | weekend× | min_level | keywords |
|---|---|---|---|---|---|---|---|
| `voltz-energy` | Voltz Energy | energy drink | 8 | 20 | 2.0 | 1 | `{voltz, voltz energy}` |
| `strut-sneakers` | Strut Sneakers | footwear | 5 | 30 | 1.0 | 1 | `{strut, strut sneakers, struts}` |
| `nimbus-games` | Nimbus Games | gaming | 8 | 15 | 1.0 | 1 | `{nimbus, nimbus games}` |
| `crisp-soda` | Crisp Soda | beverage | 5 | 25 | 1.0 | 1 | `{crisp soda, crisp}` |
| `lumen-skincare` | Lumen Skincare | skincare | 6 | 10 | 1.0 | 3 | `{lumen, lumen skincare}` |

All `cooldown_seconds = 60`. **Seed — badges**: `first_fiver` ("First Fiver", first $5 earned), `chatterbox` ("Chatterbox", 5 paid mentions in one session), `brand_loyalist` ("Brand Loyalist", `active = false` — stays locked in v1).

**Deploy order overall**: migrations 001–010 → `supabase secrets set ELEVENLABS_API_KEY OPENAI_API_KEY CRON_SECRET` → deploy the 10 functions → migration 011 (cron) → 012 (seed) → `get_advisors` security + performance pass.

**Known risks to verify at build time**: `scribe_v2` batch model id and single-use-token endpoint shape (briefing notes both, re-verify on first call); `EdgeRuntime.waitUntil` availability (fallback: run verdict synchronously before responding — contract unchanged, just slower); `realtime.send`/`broadcast_changes` signatures against current supabase docs.

### Critical Files for Implementation
- C:\Users\admin\Downloads\MagPie\supabase\migrations\0005_money.sql (ledger + append-only trigger + daily_counters + weekly_stats — the anti-gaming substrate)
- C:\Users\admin\Downloads\MagPie\supabase\migrations\0008_rpcs.sql (credit_mention and friends — every locked transaction lives here)
- C:\Users\admin\Downloads\MagPie\supabase\functions\verify-mention\index.ts (fast-ack + background verdict pipeline)
- C:\Users\admin\Downloads\MagPie\supabase\functions\_shared\redact.ts (regex pass + gpt-4o-mini judge/redact prompt)
- C:\Users\admin\Downloads\MagPie\supabase\functions\diarize\index.ts (signed-URL upload + Scribe diarization + voice_confirmed)