-- Magpie initial migration 0007: friends_leaderboard view
-- security_invoker=true so the caller's RLS on profiles (self-or-friend) decides which rows
-- appear. LEFT JOIN weekly_stats for the CURRENT UTC week with COALESCE(...,0) so zero-week
-- users -- including "you" before your first mention -- always render.

create view public.friends_leaderboard
with (security_invoker = true) as
select
  p.id            as user_id,
  p.display_name,
  p.streak_current,
  p.level,
  (date_trunc('week', now() at time zone 'utc'))::date as week_start,
  coalesce(ws.earned_cents, 0)  as earned_cents,
  coalesce(ws.paid_mentions, 0) as paid_mentions
from public.profiles p
left join public.weekly_stats ws
  on ws.user_id = p.id
 and ws.week_start = (date_trunc('week', now() at time zone 'utc'))::date;

revoke all on public.friends_leaderboard from anon, authenticated;
grant select on public.friends_leaderboard to authenticated;
