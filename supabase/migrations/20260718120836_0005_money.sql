-- Magpie initial migration 0005: money substrate
-- payout_requests must exist before ledger (ledger FKs it).
-- ledger is append-only: a BEFORE UPDATE/DELETE trigger raises unless the transaction-local
-- GUC app.allow_ledger_mutation = 'on' (set only inside purge_user). Balance = SUM(amount_cents).
-- daily_counters.day is the USER-LOCAL day (computed by credit_mention from tz_offset_minutes).
-- weekly_stats is the coarse per-week aggregate friends may read (never raw ledger).

create table public.payout_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 500),
  method       text not null check (method in ('paypal','venmo','bank')),
  status       text not null default 'requested' check (status in ('requested','sent','failed')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);
create index payout_requests_user_idx on public.payout_requests (user_id, requested_at desc);

create table public.ledger (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  amount_cents      bigint not null check (amount_cents <> 0),
  kind              text not null check (kind in ('mention','invite_bonus','payout','adjustment')),
  mention_id        uuid references public.mentions(id),
  payout_request_id uuid references public.payout_requests(id),
  description       text,
  created_at        timestamptz not null default now(),
  week_start        date generated always as ((date_trunc('week', created_at at time zone 'utc'))::date) stored,
  check ((kind = 'mention') = (mention_id is not null)),
  check ((kind = 'payout')  = (payout_request_id is not null))
);
create index ledger_user_idx      on public.ledger (user_id, created_at desc);
create index ledger_user_week_idx on public.ledger (user_id, week_start);
create index ledger_mention_idx   on public.ledger (mention_id) where mention_id is not null;

-- Append-only enforcement. Applies to every role (incl. service role); the only escape hatch
-- is purge_user, which sets app.allow_ledger_mutation='on' for its transaction.
create function public.tg_ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_ledger_mutation', true), '') <> 'on' then
    raise exception 'ledger is append-only';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger ledger_append_only
  before update or delete on public.ledger
  for each row execute function public.tg_ledger_append_only();

create table public.daily_counters (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  day         date not null,
  paid_count  int  not null default 0,
  primary key (user_id, campaign_id, day)
);

create table public.weekly_stats (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  week_start    date not null,
  earned_cents  bigint not null default 0,
  paid_mentions int    not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);
create index weekly_stats_week_idx on public.weekly_stats (week_start);

-- RLS: own rows; weekly_stats also readable by friends (leaderboard surface).
alter table public.payout_requests enable row level security;
alter table public.ledger          enable row level security;
alter table public.daily_counters  enable row level security;
alter table public.weekly_stats    enable row level security;

create policy payout_requests_select_own on public.payout_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ledger_select_own on public.ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy daily_counters_select_own on public.daily_counters
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy weekly_stats_select_self_or_friend on public.weekly_stats
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.are_friends(user_id)
  );

-- Privileges: read-only for clients (all writes server-side; ledger writes only via RPCs).
revoke all on public.payout_requests from anon, authenticated;
grant select on public.payout_requests to authenticated;

revoke all on public.ledger from anon, authenticated;
grant select on public.ledger to authenticated;

revoke all on public.daily_counters from anon, authenticated;
grant select on public.daily_counters to authenticated;

revoke all on public.weekly_stats from anon, authenticated;
grant select on public.weekly_stats to authenticated;
