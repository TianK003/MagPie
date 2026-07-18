-- Magpie initial migration 0011: advisor hardening (forward-only correction)
-- 1) Replace the are_friends() SECURITY DEFINER helper with the plan's literal inline-EXISTS
--    friend check (now that public.friendships exists), then drop the helper. This removes an
--    advisor warning about a signed-in-executable SECURITY DEFINER function and matches the
--    approved plan's RLS matrix verbatim.
-- 2) Revoke EXECUTE on the trigger-only functions from PUBLIC/anon/authenticated. Triggers fire
--    regardless of EXECUTE grants, so this is pure least-privilege hardening.

alter policy profiles_select_self_or_friend on public.profiles
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where f.user_low  = least(id, (select auth.uid()))
        and f.user_high = greatest(id, (select auth.uid()))
    )
  );

alter policy weekly_stats_select_self_or_friend on public.weekly_stats
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where f.user_low  = least(user_id, (select auth.uid()))
        and f.user_high = greatest(user_id, (select auth.uid()))
    )
  );

drop function public.are_friends(uuid);

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

revoke execute on function public.tg_ledger_append_only() from public;
revoke execute on function public.tg_ledger_append_only() from anon, authenticated;
