-- A participant may sit in at most one non-terminal (scheduled or in_progress)
-- match at a time. guard_match_player (0005) only checked same-session and
-- checked-in, so nothing stopped a host -- or the auto-match confirm -- from
-- double-booking a player.
--
-- The participant row is locked before the check. Two concurrent create_match
-- calls naming the same player serialise on that lock, so the second one sees
-- the first one's match_players row and raises instead of both passing the
-- check. Same philosophy as matches_reserved_court_idx: contention over one
-- row's claim is settled by the database, not by the caller.
create or replace function public.guard_match_player()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_match_session uuid;
  v_participant_session uuid;
  v_checked_in timestamptz;
begin
  select session_id into v_match_session
    from public.matches where id = new.match_id;

  select session_id, checked_in_at into v_participant_session, v_checked_in
    from public.participants where id = new.participant_id
    for update;

  if v_match_session is distinct from v_participant_session then
    raise exception 'participant belongs to a different session'
      using errcode = 'JB005';
  end if;

  if v_checked_in is null then
    raise exception 'participant is not checked in'
      using errcode = 'JB005';
  end if;

  if exists (
    select 1
      from public.match_players mp
      join public.matches m on m.id = mp.match_id
     where mp.participant_id = new.participant_id
       and mp.match_id <> new.match_id
       and m.status in ('scheduled', 'in_progress')
  ) then
    raise exception 'participant is already in an active match'
      using errcode = 'JB017';
  end if;

  return new;
end;
$$;
