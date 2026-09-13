-- Match scheduling: host creates a match against an idle court and a
-- checked-in team split, starts it, completes it, or cancels it while still
-- scheduled. Rule 4 (checked-in pool only) is already enforced by
-- guard_match_player (0005); this migration adds the pieces specific to the
-- lifecycle: a court-reservation race guard, the delete-gap fix noted in
-- core-schema-follow-ups.md, and three security-definer RPCs.

-- "Reserve at creation": a court can be the target of at most one
-- non-terminal (scheduled or in_progress) match at a time. This is the race
-- guard for two hosts creating a match on the same court concurrently --
-- same philosophy as courts_session_id_court_number_key for court numbers,
-- a unique constraint instead of an advisory lock, because the contention is
-- over a single row's claim, not a capacity count across many rows.
create unique index matches_reserved_court_idx
  on public.matches (court_id)
  where status in ('scheduled', 'in_progress') and court_id is not null;

-- Closes the gap noted in core-schema-follow-ups.md: "Deleting a court under
-- an in_progress match nulls court_id and leaves the match live." Enforced
-- at the DB layer so it holds regardless of caller (host UI, a script, the
-- service role), not just the Server Action.
create or replace function public.guard_court_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.matches
     where court_id = old.id
       and status in ('scheduled', 'in_progress')
  ) then
    raise exception 'court has an active match' using errcode = 'JB010';
  end if;

  return old;
end;
$$;

create trigger courts_guard_delete
before delete on public.courts
for each row execute function public.guard_court_delete();

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

create or replace function public.start_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_court_id uuid;
  v_match public.matches;
  v_court_rows int;
begin
  select session_id, court_id into v_session_id, v_court_id
    from public.matches where id = p_match_id;

  if v_session_id is null then
    raise exception 'match not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  update public.matches
     set status = 'in_progress', started_at = now()
   where id = p_match_id and status = 'scheduled'
  returning * into v_match;

  if not found then
    raise exception 'match is not scheduled' using errcode = 'JB009';
  end if;

  if v_court_id is not null then
    update public.courts
       set status = 'in_use'
     where id = v_court_id and status = 'idle';

    get diagnostics v_court_rows = row_count;

    if v_court_rows = 0 then
      raise exception 'court is not idle' using errcode = 'JB009';
    end if;
  end if;

  return v_match;
end;
$$;

create or replace function public.complete_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_court_id uuid;
  v_match public.matches;
begin
  select session_id, court_id into v_session_id, v_court_id
    from public.matches where id = p_match_id;

  if v_session_id is null then
    raise exception 'match not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  update public.matches
     set status = 'completed', completed_at = now()
   where id = p_match_id and status = 'in_progress'
  returning * into v_match;

  if not found then
    raise exception 'match is not in progress' using errcode = 'JB009';
  end if;

  -- Best-effort: only flip a court that is actually in_use. If a host
  -- manually flagged it unavailable mid-match, completion should not
  -- silently override that.
  if v_court_id is not null then
    update public.courts set status = 'idle' where id = v_court_id and status = 'in_use';
  end if;

  return v_match;
end;
$$;

revoke execute on function
  public.create_match(uuid, uuid, uuid[], uuid[]),
  public.start_match(uuid),
  public.complete_match(uuid)
from public, anon;

grant execute on function
  public.create_match(uuid, uuid, uuid[], uuid[]),
  public.start_match(uuid),
  public.complete_match(uuid)
to authenticated;
