-- Magpie initial migration 0006: social graph + badges
-- friendships: ordered pair (user_low < user_high) so each edge is stored once.
-- invite_redemptions: one row per invitee (PK), bonus paid later in apply_session_end.
-- invite_tombstones: sha256(lower(email)) written at redemption; SURVIVES account deletion
--   (blocks delete->re-signup invite-bonus farming). No client access at all.
-- badges seed data lands in 0010; brand_loyalist ships inactive (locked).

create table public.friendships (
  user_low   uuid not null references public.profiles(id) on delete cascade,
  user_high  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);
create index friendships_high_idx on public.friendships (user_high);

create table public.invite_redemptions (
  invitee_id       uuid primary key references public.profiles(id) on delete cascade,
  inviter_id       uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  bonus_granted_at timestamptz,
  check (invitee_id <> inviter_id)
);
create index invite_redemptions_inviter_idx on public.invite_redemptions (inviter_id);

create table public.invite_tombstones (
  email_hash text primary key,
  created_at timestamptz not null default now()
);

create table public.badges (
  code        text primary key,
  name        text not null,
  description text not null,
  active      boolean not null default true,
  sort        int not null default 0
);

create table public.user_badges (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge_code text not null references public.badges(code),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

-- RLS
alter table public.friendships        enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.invite_tombstones  enable row level security;
alter table public.badges             enable row level security;
alter table public.user_badges        enable row level security;

-- friendships / invite_redemptions: members only (both writes are server-side).
create policy friendships_select_member on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create policy invite_redemptions_select_member on public.invite_redemptions
  for select to authenticated
  using ((select auth.uid()) in (invitee_id, inviter_id));

-- badges: catalog is readable by everyone signed in.
create policy badges_select_all on public.badges
  for select to authenticated
  using (true);

-- user_badges: own only.
create policy user_badges_select_own on public.user_badges
  for select to authenticated
  using (user_id = (select auth.uid()));

-- invite_tombstones: NO policy on purpose -> RLS denies all client access.

-- Privileges
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

revoke all on public.invite_redemptions from anon, authenticated;
grant select on public.invite_redemptions to authenticated;

-- invite_tombstones: revoke everything from clients (server/service-role only).
revoke all on public.invite_tombstones from anon, authenticated;

revoke all on public.badges from anon, authenticated;
grant select on public.badges to authenticated;

revoke all on public.user_badges from anon, authenticated;
grant select on public.user_badges to authenticated;
