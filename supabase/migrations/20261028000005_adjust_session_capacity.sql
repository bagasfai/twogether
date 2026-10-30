-- Drilling sessions: change the coach count (spec
-- 2026-10-26-drilling-sessions-design.md section 7). The sessions CHECK
-- sessions_drilling_shape ties max_participants and court_count to coach_count,
-- and a CHECK is evaluated per statement, so all three columns are written in
-- one UPDATE.
--
-- Raising: insert the missing courts rows, then promote waitlisters into the
-- new seats in the same order as promote_from_waitlist (is_premium desc,
-- registered_at, id). The promotion step is the same as there: flip status from
-- waiting_list to confirmed. The usage a premium waitlister consumed at
-- registration is already held, and promote_from_waitlist does nothing else, so
-- neither does this. Fewer waitlisters than seats leaves seats open. Raising
-- never bumps anyone.
--
-- Lowering: JB024 when the new capacity is below the confirmed count, JB025
-- when a court that would be removed is not idle. Courts beyond the new count
-- are deleted, highest court_number first in effect; guard_court_delete still
-- refuses a court that has a scheduled or in-progress match (JB010). Nobody is
-- dropped by automation.
--
-- The same coach count is a no-op: the row is returned unchanged.
--
-- Allowed in draft, scheduled and live status. Promotion only runs in
-- scheduled and live, as in promote_from_waitlist.
--
-- Errors: JB004 anon, JB006 isolation, JB007 not a host or admin, JB008
-- session not found, JB011 coach_count missing or below 1, JB024 below
-- confirmed count, JB025 court to remove is not idle, JB026 not a drilling
-- session or status not draft / scheduled / live.

create or replace function public.adjust_session_capacity(
  p_session_id uuid,
  p_coach_count int
)
returns public.sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions;
  v_new_max int;
  v_confirmed int;
  v_old_coach_count int;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'adjust_session_capacity requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  select * into v_session from public.sessions
   where id = p_session_id for update;
  if not found then
    raise exception 'session not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(p_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  if v_session.kind <> 'drilling'
     or v_session.status not in ('draft', 'scheduled', 'live') then
    raise exception 'capacity can only be adjusted on a draft, scheduled or live drilling session'
      using errcode = 'JB026';
  end if;

  if p_coach_count is null or p_coach_count < 1 then
    raise exception 'coach_count must be at least 1' using errcode = 'JB011';
  end if;

  if p_coach_count = v_session.coach_count then
    return v_session;
  end if;

  v_old_coach_count := v_session.coach_count;
  v_new_max := p_coach_count * v_session.seats_per_coach;

  if p_coach_count < v_session.coach_count then
    select count(*) into v_confirmed
      from public.participants
     where session_id = p_session_id and status = 'confirmed';
    if v_new_max < v_confirmed then
      raise exception 'new capacity % is below the % confirmed participants',
        v_new_max, v_confirmed using errcode = 'JB024';
    end if;

    if exists (
      select 1 from public.courts
       where session_id = p_session_id
         and court_number > p_coach_count
         and status <> 'idle'
    ) then
      raise exception 'a court that would be removed is not idle' using errcode = 'JB025';
    end if;
  end if;

  update public.sessions
     set coach_count = p_coach_count,
         max_participants = v_new_max,
         court_count = p_coach_count
   where id = p_session_id
  returning * into v_session;

  if p_coach_count > v_old_coach_count then
    -- Raise: fill in every missing number up to the new count. Nothing is
    -- deleted, even a court numbered above the new count (gapped numbers).
    insert into public.courts (session_id, court_number)
    select p_session_id, n
      from generate_series(1, p_coach_count) n
     where not exists (
       select 1 from public.courts c
        where c.session_id = p_session_id and c.court_number = n);
  else
    -- Lower: remove the courts beyond the new count (all idle, checked above).
    delete from public.courts
     where session_id = p_session_id and court_number > p_coach_count;
  end if;

  if v_session.status in ('scheduled', 'live') then
    select count(*) into v_confirmed
      from public.participants
     where session_id = p_session_id and status = 'confirmed';

    if v_confirmed < v_session.max_participants then
      update public.participants
         set status = 'confirmed'
       where id in (
         select id from public.participants
          where session_id = p_session_id and status = 'waiting_list'
          order by is_premium desc, registered_at, id
          limit v_session.max_participants - v_confirmed
       );
    end if;
  end if;

  return v_session;
end;
$$;

revoke execute on function public.adjust_session_capacity(uuid, int) from public;
revoke execute on function public.adjust_session_capacity(uuid, int) from anon;
grant execute on function public.adjust_session_capacity(uuid, int) to authenticated;
