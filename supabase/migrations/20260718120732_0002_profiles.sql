-- Magpie initial migration 0002: profiles + profile_private
-- profiles = friend-visible, non-sensitive columns only.
-- profile_private = self-only sensitive columns.
-- handle_new_user trigger creates BOTH rows on auth.users insert.
-- Column-level grants restrict client writes to display_name / (payout_method, consent_at, onboarded_at).

create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  display_name           text not null default '',
  streak_current         int not null default 0,
  streak_best            int not null default 0,
  lifetime_paid_mentions int not null default 0,
  lifetime_earned_cents  bigint not null default 0,
  level int generated always as (
    case when lifetime_paid_mentions >= 200 then 4
         when lifetime_paid_mentions >= 75  then 3
         when lifetime_paid_mentions >= 25  then 2
         else 1 end) stored,
  created_at             timestamptz not null default now()
);

create table public.profile_private (
  id                      uuid primary key references public.profiles(id) on delete cascade,
  payout_method           text check (payout_method in ('paypal','venmo','bank')),
  consent_at              timestamptz,
  onboarded_at            timestamptz,
  tz_offset_minutes       int not null default 0 check (tz_offset_minutes between -840 and 840),
  invite_code             text not null unique,
  last_active_date        date,
  last_counted_server_day date,
  created_at              timestamptz not null default now()
);

-- Friend-check helper for RLS. SECURITY DEFINER so it bypasses friendships' own RLS
-- (no recursion); always compares the argument against the CALLER (auth.uid()), so an
-- authenticated user can only probe their own friendships. plpgsql = late binding, so it
-- may reference public.friendships before that table exists (created in 0006_social).
create function public.are_friends(other uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.friendships f
    where f.user_low  = least(other, (select auth.uid()))
      and f.user_high = greatest(other, (select auth.uid()))
  );
end;
$$;

revoke execute on function public.are_friends(uuid) from public;
revoke execute on function public.are_friends(uuid) from anon;
grant execute on function public.are_friends(uuid) to authenticated, service_role;

-- New-user provisioning: create both rows + a unique 8-char invite code.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1));

  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    begin
      insert into public.profile_private (id, invite_code)
      values (new.id, v_code);
      exit;
    exception when unique_violation then
      -- invite_code collision (astronomically rare) -> retry with a fresh code
    end;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;

create policy profiles_select_self_or_friend on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.are_friends(id)
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profile_private_select_self on public.profile_private
  for select to authenticated
  using (id = (select auth.uid()));

create policy profile_private_update_self on public.profile_private
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column-level privileges (defense in depth; PostgREST enforces these).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke all on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;
grant update (payout_method, consent_at, onboarded_at) on public.profile_private to authenticated;
