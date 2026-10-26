-- Games played per participant. security_invoker so the caller's RLS on
-- participants/match_players/matches applies: a member sees counts only where
-- they could already read the underlying matches. Only completed matches
-- count; scheduled, in_progress and cancelled never do.
--
-- A cancelled participant stays listed only if they played a completed game
-- before cancelling. No level or gender column is selected or joined here.
create view public.session_games_played
with (security_invoker = true) as
select
  p.id as participant_id,
  p.session_id,
  count(m.id) as games_played
from public.participants p
left join public.match_players mp on mp.participant_id = p.id
left join public.matches m on m.id = mp.match_id and m.status = 'completed'
group by p.id
having p.status <> 'cancelled' or count(m.id) > 0;

revoke all on public.session_games_played from anon, authenticated;
grant select on public.session_games_played to authenticated;

-- All-time board for registered members. security definer because aggregating
-- across sessions needs rows the caller's RLS hides (other members'
-- participants rows, private sessions). It returns a display name, a count and
-- whether the row is the caller's own -- never an identifier, level or gender.
-- Guests (user_id is null) have no profile and are excluded.
create function public.all_time_leaderboard(p_limit int default 50)
returns table (
  full_name text,
  games_played bigint,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(nullif(btrim(pr.full_name), ''), 'Member'),
    count(*),
    p.user_id = auth.uid()
  from public.match_players mp
  join public.matches m on m.id = mp.match_id and m.status = 'completed'
  join public.participants p on p.id = mp.participant_id and p.user_id is not null
  join public.profiles pr on pr.id = p.user_id
  group by p.user_id, pr.full_name
  order by 2 desc, 1
  limit p_limit
$$;

revoke execute on function public.all_time_leaderboard(int) from public, anon;
grant execute on function public.all_time_leaderboard(int) to authenticated;
