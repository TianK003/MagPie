-- Magpie initial migration 0003: campaigns + opt_ins
-- campaigns carry the anti-gaming knobs (rate, cap, cooldown, weekend multiplier) plus a
-- hard budget (budget_cents / spent_cents, atomically decremented in credit_mention).
-- opt_ins is one of only two client-writable surfaces; insert is gated on active + level.

create table public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  category           text not null,
  rate_cents         int  not null check (rate_cents > 0),
  cap_per_day        int  not null check (cap_per_day > 0),
  weekend_multiplier numeric(3,1) not null default 1.0,
  min_level          int  not null default 1,
  cooldown_seconds   int  not null default 60,
  keywords           text[] not null,
  logo_url           text,
  active             boolean not null default true,
  budget_cents       bigint not null,
  spent_cents        bigint not null default 0,
  created_at         timestamptz not null default now(),
  check (spent_cents <= budget_cents)
);

create table public.opt_ins (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (user_id, campaign_id)
);
create index opt_ins_campaign_idx on public.opt_ins (campaign_id);

-- RLS
alter table public.campaigns enable row level security;
alter table public.opt_ins enable row level security;

-- campaigns: any authenticated user can read active campaigns.
create policy campaigns_select_active on public.campaigns
  for select to authenticated
  using (active);

-- opt_ins: own rows only; insert gated on (campaign active AND user level >= min_level).
create policy opt_ins_select_own on public.opt_ins
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy opt_ins_insert_own on public.opt_ins
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.campaigns c
      join public.profiles p on p.id = (select auth.uid())
      where c.id = campaign_id
        and c.active
        and p.level >= c.min_level
    )
  );

create policy opt_ins_delete_own on public.opt_ins
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Privileges: read campaigns; read/insert/delete own opt_ins.
revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to authenticated;

revoke all on public.opt_ins from anon, authenticated;
grant select, insert, delete on public.opt_ins to authenticated;
