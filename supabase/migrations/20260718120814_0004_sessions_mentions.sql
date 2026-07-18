-- Magpie initial migration 0004: sessions + mentions + keyword_sightings
-- All three are read-only for clients (own rows); every write happens server-side.
-- sessions.last_two_voice_at is the *paying* gate (freshness <=3min, checked in credit_mention);
-- voice_confirmed stays "ever confirmed" for streak/summary.
-- mentions idempotency is per-user (user_id, client_mention_id), NOT globally unique.
-- keyword_sightings stores only the *event* of a server-observed keyword hit -- never any text.

create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  status            text not null default 'active' check (status in ('active','ended')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  client_day        date,
  voice_confirmed   boolean not null default false,
  last_two_voice_at timestamptz,
  mention_count     int    not null default 0,
  earnings_cents    bigint not null default 0,
  stt_provider      text check (stt_provider in ('elevenlabs','openai')),
  data_deleted_at   timestamptz,
  created_at        timestamptz not null default now()
);
create index sessions_user_started_idx on public.sessions (user_id, started_at desc);
create unique index sessions_one_active_idx on public.sessions (user_id) where status = 'active';

create table public.mentions (
  id                   uuid primary key default gen_random_uuid(),
  client_mention_id    uuid not null,
  session_id           uuid not null references public.sessions(id) on delete cascade,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  campaign_id          uuid not null references public.campaigns(id) on delete restrict,
  keyword              text not null,
  occurred_at          timestamptz not null,
  status               text not null default 'pending' check (status in ('pending','paid','flagged')),
  flag_reason          text check (flag_reason in
    ('forced','duplicate','rate','cap_reached','cooldown','voice_gate','verify_failed','budget_exhausted')),
  redacted_snippet     text,
  amount_cents         int  not null default 0,
  base_rate_cents      int  not null,
  multiplier_applied   numeric(3,1) not null default 1.0,
  streak_bonus_applied boolean not null default false,
  verify_attempts      int  not null default 0,
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  unique (user_id, client_mention_id)
);
create index mentions_session_idx on public.mentions (session_id, occurred_at);
-- cooldown lookup: last PAID mention for (user, campaign) by SERVER time (verified_at)
create index mentions_cooldown_idx on public.mentions (user_id, campaign_id, verified_at desc)
  where status = 'paid';
-- pending-retry sweep (housekeeping)
create index mentions_pending_idx on public.mentions (created_at)
  where status = 'pending';

create table public.keyword_sightings (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  seen_at     timestamptz not null default now()
);
create index keyword_sightings_session_campaign_idx on public.keyword_sightings (session_id, campaign_id);

-- RLS: SELECT own only; all writes are server-side (service role).
alter table public.sessions enable row level security;
alter table public.mentions enable row level security;
alter table public.keyword_sightings enable row level security;

create policy sessions_select_own on public.sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy mentions_select_own on public.mentions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy keyword_sightings_select_own on public.keyword_sightings
  for select to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- Privileges: read-only for clients.
revoke all on public.sessions from anon, authenticated;
grant select on public.sessions to authenticated;

revoke all on public.mentions from anon, authenticated;
grant select on public.mentions to authenticated;

revoke all on public.keyword_sightings from anon, authenticated;
grant select on public.keyword_sightings to authenticated;
