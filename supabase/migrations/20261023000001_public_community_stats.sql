-- Four site-wide counts for the landing page stats strip. security definer
-- because participants is readable by anon only for non-cancelled rosters of
-- public sessions and profiles not at all; counting across the whole table
-- needs the owner's rights. It returns counts only, never an identifier, so
-- nothing about an individual member leaves the database.
--
-- A check-in counts whatever the row's status is afterwards: a player who
-- checked in was physically present. An active member is a distinct member
-- with a check-in in the last 90 days.
create function public.public_community_stats()
returns table (
  sessions_held bigint,
  matches_played bigint,
  total_checkins bigint,
  active_members bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.sessions where status = 'completed'),
    (select count(*) from public.matches where status = 'completed'),
    (select count(*) from public.participants where checked_in_at is not null),
    (select count(distinct user_id) from public.participants
       where checked_in_at >= now() - interval '90 days')
$$;

revoke execute on function public.public_community_stats() from public;

-- Supabase grants EXECUTE on new public-schema functions to anon/authenticated
-- by default, and `revoke ... from public` above does not strip that. Here
-- anon access is the point (the landing page is public), so the explicit grant
-- adds nothing new; it documents intent.
grant execute on function public.public_community_stats() to anon, authenticated;
