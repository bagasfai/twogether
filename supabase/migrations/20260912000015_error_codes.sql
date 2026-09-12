-- JB004 meant both "not authenticated" (401) and "not authorized" (403); a
-- Server Action needs to redirect for one and show a forbidden message for the
-- other, and could not tell them apart. Not-found was smeared across JB001 and
-- JB003. After this migration:
--
--   JB001 registration is not open
--   JB002 session is full
--   JB003 already registered, or nothing to cancel
--   JB004 not authenticated
--   JB005 invalid match player
--   JB006 wrong transaction isolation
--   JB007 not authorized
--   JB008 session or participant not found
--
-- Function bodies below are copied verbatim from migrations 0010 and 0002.
-- Only errcode values changed.

create or replace function public.register_for_session(p_session_id uuid)
returns public.registration_result
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session public.sessions;
  v_existing public.participant_status;
  v_confirmed int;
  v_waiting int;
  v_status public.participant_status;
  -- clock_timestamp(), not now(): now() is transaction start time and is
  -- identical for every statement in the same transaction, which would tie
  -- registered_at (and therefore waitlist ordering) for any two calls that
  -- happen to share a transaction.
  v_registered_at timestamptz := clock_timestamp();
  v_participant_id uuid;
  v_result public.registration_result;
begin
  -- The advisory lock only serializes concurrent callers under READ
  -- COMMITTED: a blocked caller re-reads current state once it acquires the
  -- lock. Under REPEATABLE READ (or SERIALIZABLE), a caller that blocked on
  -- the lock still sees its transaction-start snapshot after waking up, so
  -- the capacity count below would silently pass on stale data -- write
  -- skew the lock does nothing to prevent. Fail loudly instead of
  -- oversubscribing silently if the isolation level is ever changed
  -- (PostgREST defaults to READ COMMITTED today, but nothing else pins it).
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'register_for_session requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  -- Held until commit. Covers the count-then-insert window below, which is
  -- where "two people take the last slot" would otherwise live.
  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception 'session not found' using errcode = 'JB008';
  end if;

  if v_session.registration_state <> 'open' or v_session.status <> 'scheduled' then
    raise exception 'registration is not open' using errcode = 'JB001';
  end if;

  select status into v_existing
    from public.participants
   where session_id = p_session_id and user_id = v_user;

  if v_existing in ('confirmed', 'waiting_list') then
    raise exception 'already registered' using errcode = 'JB003';
  end if;

  select
    count(*) filter (where status = 'confirmed'),
    count(*) filter (where status = 'waiting_list')
  into v_confirmed, v_waiting
  from public.participants
  where session_id = p_session_id;

  if v_confirmed < v_session.max_participants then
    v_status := 'confirmed';
  elsif v_waiting < v_session.waitlist_capacity then
    v_status := 'waiting_list';
  else
    raise exception 'session is full' using errcode = 'JB002';
  end if;

  insert into public.participants (session_id, user_id, status, registered_at)
  values (p_session_id, v_user, v_status, v_registered_at)
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        cancelled_at = null,
        added_by = null,
        -- re-entering the queue is not re-entering the checked-in pool
        checked_in_at = null
  returning id into v_participant_id;

  v_result.status := v_status;

  if v_status = 'waiting_list' then
    v_result.waitlist_position :=
      public.waitlist_position_of(p_session_id, v_registered_at, v_participant_id);
  end if;

  return v_result;
end;
$$;

create or replace function public.host_add_participant(
  p_session_id uuid,
  p_user_id uuid,
  p_status public.participant_status default 'confirmed'
)
returns public.participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.participants;
begin
  -- Same isolation guard as register_for_session -- this RPC takes the same
  -- lock and re-reads the same tables under the same READ COMMITTED
  -- assumption (host overrides skip the capacity check, but the lock still
  -- needs to serialize against concurrent register_for_session callers).
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'host_add_participant requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_session_host(p_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  insert into public.participants
    (session_id, user_id, status, registered_at, added_by)
  values (p_session_id, p_user_id, p_status, clock_timestamp(), auth.uid())
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        cancelled_at = null,
        added_by = excluded.added_by,
        -- re-entering the queue is not re-entering the checked-in pool
        checked_in_at = null
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.host_set_participant_status(
  p_participant_id uuid,
  p_status public.participant_status
)
returns public.participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_row public.participants;
begin
  select session_id into v_session_id
    from public.participants where id = p_participant_id;

  if v_session_id is null then
    raise exception 'participant not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(v_session_id));

  update public.participants
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else null end,
         -- a host-cancelled participant leaves the checked-in pool too
         checked_in_at = case when p_status = 'cancelled' then null else checked_in_at end
   where id = p_participant_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  if new.role is distinct from old.role
     and not public.is_admin()
     and not (
       (v_claims is null and v_role not in ('anon', 'authenticated'))
       or coalesce(v_claims ->> 'role', '') = 'service_role'
     ) then
    raise exception 'only an admin may change a role' using errcode = 'JB007';
  end if;
  return new;
end;
$$;

