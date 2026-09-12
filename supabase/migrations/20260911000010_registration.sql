create type public.registration_result as (
  status public.participant_status,
  waitlist_position int
);

-- One lock key per session. Registrations for different sessions never contend.
create or replace function public.session_lock_key(p_session_id uuid)
returns bigint
language sql
immutable
as $$
  select hashtextextended(p_session_id::text, 0);
$$;

-- Extracted from register_for_session so the (registered_at, id) tie-break
-- can be exercised directly in a test with two rows that have an identical
-- registered_at -- position is otherwise only ever returned once, at
-- insert time, for the row that is being inserted, which makes it
-- impossible to observe what position a PRE-EXISTING tied row would get
-- without a callable, argument-driven version of the same formula.
--
-- Deliberately NOT security definer: its only caller is register_for_session,
-- which is already definer and calls it while already running as the
-- owner, so the nested read of participants happens with the owner's
-- privileges regardless. Giving this function its own definer would only
-- add a second, independently-callable way to read participants as the
-- owner -- exactly the widening a prior version of this migration
-- introduced (a session uuid and a far-future timestamp would let anon
-- read the waitlist size of any session, bypassing
-- participants_select_self_host_or_public entirely). Revoked from
-- everyone below for the same reason the four RPCs are.
create or replace function public.waitlist_position_of(
  p_session_id uuid,
  p_registered_at timestamptz,
  p_id uuid
)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  -- Same total order as promote_from_waitlist's ORDER BY: registered_at,
  -- then id as the deterministic tie-break.
  select count(*) + 1
    from public.participants
   where session_id = p_session_id
     and status = 'waiting_list'
     and (registered_at, id) < (p_registered_at, p_id);
$$;

revoke execute on function public.waitlist_position_of(uuid, timestamptz, uuid)
  from public, anon, authenticated;

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
    raise exception 'session not found' using errcode = 'JB001';
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

create or replace function public.cancel_registration(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_rows int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  update public.participants
     set status = 'cancelled',
         cancelled_at = now(),
         -- a cancelled registration leaves the checked-in pool too, not
         -- just the registration list
         checked_in_at = null
   where session_id = p_session_id
     and user_id = v_user
     and status in ('confirmed', 'waiting_list');

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'no active registration' using errcode = 'JB003';
  end if;
end;
$$;

-- Rule 3: hosts always retain manual override. No capacity check here.
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
    raise exception 'not authorized' using errcode = 'JB004';
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
    raise exception 'participant not found' using errcode = 'JB003';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'not authorized' using errcode = 'JB004';
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

-- Fires however the cancellation arrives: member RPC, host override, or an
-- admin's direct update. The WHEN clause is the recursion guard — the
-- promotion below is waiting_list -> confirmed, which does not re-match.
create or replace function public.promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions;
  v_confirmed int;
begin
  -- Same isolation guard as register_for_session -- this trigger re-counts
  -- confirmed participants under the same READ COMMITTED assumption after
  -- acquiring the same lock.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'promote_from_waitlist requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(new.session_id));

  select * into v_session from public.sessions where id = new.session_id;

  if v_session.status not in ('scheduled', 'live') then
    return null;
  end if;

  select count(*) into v_confirmed
    from public.participants
   where session_id = new.session_id and status = 'confirmed';

  if v_confirmed < v_session.max_participants then
    update public.participants
       set status = 'confirmed'
     where id = (
       select id from public.participants
        where session_id = new.session_id
          and status = 'waiting_list'
        order by registered_at, id
        limit 1
     );
  end if;

  return null;
end;
$$;

create trigger participants_promote_waitlist
after update on public.participants
for each row
when (old.status = 'confirmed' and new.status = 'cancelled')
execute function public.promote_from_waitlist();

revoke execute on function
  public.register_for_session(uuid),
  public.cancel_registration(uuid),
  public.host_add_participant(uuid, uuid, public.participant_status),
  public.host_set_participant_status(uuid, public.participant_status)
from public;

grant execute on function
  public.register_for_session(uuid),
  public.cancel_registration(uuid),
  public.host_add_participant(uuid, uuid, public.participant_status),
  public.host_set_participant_status(uuid, public.participant_status)
to authenticated;

-- Supabase grants EXECUTE on new public-schema functions to anon/authenticated
-- by default, and `revoke ... from public` above does not strip that (it only
-- revokes the PUBLIC pseudo-role, not the explicit per-role grants). An anon
-- caller is already turned away with JB004 because auth.uid() is null, but
-- revoke the explicit grant too so the privilege story matches intent.
revoke execute on function
  public.register_for_session(uuid),
  public.cancel_registration(uuid),
  public.host_add_participant(uuid, uuid, public.participant_status),
  public.host_set_participant_status(uuid, public.participant_status)
from anon;
