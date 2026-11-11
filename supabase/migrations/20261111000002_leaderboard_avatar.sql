-- Adds avatar_url to the all-time board so the leaderboard can show member
-- photos. The return type changes, so the function is dropped and recreated;
-- body and grants are otherwise as in 20261026000004_match_stats.sql.
--
-- Note: avatar_url contains the member's user id in its storage path
-- ({uid}/avatar.{ext}), so this RPC now exposes an identifier despite the
-- header of 20261026000004. Accepted: profiles_select_authenticated
-- (using true) already lets every signed-in user read every profile id and
-- name, so the URL grants no new read access. The RPC still returns no level
-- or gender. Guests have no profile and stay excluded.
drop function public.all_time_leaderboard(int);

create function public.all_time_leaderboard(p_limit int default 50)
returns table (
  full_name text,
  avatar_url text,
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
    pr.avatar_url,
    count(*),
    p.user_id = auth.uid()
  from public.match_players mp
  join public.matches m on m.id = mp.match_id and m.status = 'completed'
  join public.participants p on p.id = mp.participant_id and p.user_id is not null
  join public.profiles pr on pr.id = p.user_id
  group by p.user_id, pr.full_name, pr.avatar_url
  order by 3 desc, 1
  limit p_limit
$$;

revoke execute on function public.all_time_leaderboard(int) from public, anon;
grant execute on function public.all_time_leaderboard(int) to authenticated;
