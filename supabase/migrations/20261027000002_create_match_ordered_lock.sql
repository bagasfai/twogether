-- Two hosts confirming overlapping suggestions can name the same players in
-- different order. guard_match_player locks each participant row as its
-- match_players row is inserted, so crossing orders (P1,P4 vs P4,P1) form a
-- lock cycle and Postgres aborts one caller with a deadlock. Lock every
-- participant up front in id order instead: the second caller waits, then sees
-- the first one's match and gets JB017 from the guard.
create or replace function public.create_match(
  p_session_id uuid,
  p_court_id uuid,
  p_team1 uuid[],
  p_team2 uuid[]
)
returns public.matches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match public.matches;
  v_participant_id uuid;
begin
  if not public.is_session_host(p_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  -- Defense in depth: the zod schema is the primary gate, but this RPC is
  -- independently callable by any authenticated user via PostgREST.
  if array_length(p_team1, 1) is null or array_length(p_team2, 1) is null
     or array_length(p_team1, 1) <> array_length(p_team2, 1) then
    raise exception 'teams must be the same non-zero size' using errcode = 'JB005';
  end if;

  perform 1 from public.participants
   where id = any (p_team1 || p_team2)
   order by id
   for update;

  begin
    insert into public.matches (session_id, court_id, status)
    values (p_session_id, p_court_id, 'scheduled')
    returning * into v_match;
  exception
    when unique_violation then
      raise exception 'court is not available' using errcode = 'JB009';
  end;

  foreach v_participant_id in array p_team1 loop
    insert into public.match_players (match_id, participant_id, team)
    values (v_match.id, v_participant_id, 1);
  end loop;

  foreach v_participant_id in array p_team2 loop
    insert into public.match_players (match_id, participant_id, team)
    values (v_match.id, v_participant_id, 2);
  end loop;

  return v_match;
end;
$$;
