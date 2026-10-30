-- host_add_participant lets a host insert an arbitrary member into a session
-- they host, with no consent check from the member being added
-- (docs/superpowers/core-schema-follow-ups.md, "must decide"). Once that
-- participant row exists, profiles_private_select_self_admin_or_host grants
-- that host the member's phone purely because a non-cancelled row exists --
-- so an uninvited add was also an uninvited phone disclosure.
--
-- Fix: consented_at distinguishes "a participant row exists" from "the member
-- is aware they're registered". Self-registration is consent by construction
-- (the member performed the action), so register_for_session stamps it
-- immediately. host_add_participant leaves it null until the member
-- acknowledges via member_confirm_participation. The profiles_private
-- host-visibility policy now requires it.

alter table public.participants add column consented_at timestamptz;

-- Backfill: register_for_session has been the only write path into
-- participants (host_add_participant has no UI yet per the follow-ups doc),
-- so every existing row is self-registered and already has implicit consent.
update public.participants set consented_at = registered_at;

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
  v_registered_at timestamptz := clock_timestamp();
  v_participant_id uuid;
  v_result public.registration_result;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'register_for_session requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

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

  insert into public.participants
    (session_id, user_id, status, registered_at, consented_at)
  values (p_session_id, v_user, v_status, v_registered_at, v_registered_at)
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        consented_at = excluded.consented_at,
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
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'host_add_participant requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_session_host(p_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  -- consented_at is deliberately never set here, on insert or on the
  -- conflict-update branch: a host's action is never the member's consent,
  -- including when it overwrites a row the member previously self-consented
  -- to (e.g. re-adding someone after they cancelled) -- that is a new
  -- registration event the member hasn't acknowledged yet.
  insert into public.participants
    (session_id, user_id, status, registered_at, added_by)
  values (p_session_id, p_user_id, p_status, clock_timestamp(), auth.uid())
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        cancelled_at = null,
        added_by = excluded.added_by,
        consented_at = null,
        -- re-entering the queue is not re-entering the checked-in pool
        checked_in_at = null
  returning * into v_row;

  return v_row;
end;
$$;

-- Member-only acknowledgement of a host-added registration. Takes
-- p_session_id rather than a participant id, matching cancel_registration's
-- shape -- a member declining instead just calls cancel_registration, which
-- already cancels any participant row they own regardless of who created it.
-- Idempotent: confirming an already-consented row is a no-op success, so a
-- double click (or a member confirming their own self-registration, which
-- was already consented) never errors.
create or replace function public.member_confirm_participation(p_session_id uuid)
returns public.participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.participants;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  update public.participants
     set consented_at = coalesce(consented_at, now())
   where session_id = p_session_id
     and user_id = v_user
     and status <> 'cancelled'
  returning * into v_row;

  if not found then
    raise exception 'participant not found' using errcode = 'JB008';
  end if;

  return v_row;
end;
$$;

-- Same two-step revoke as migration 10: `revoke ... from public` strips the
-- PUBLIC pseudo-role grant, but Supabase's default per-function grant to
-- anon/authenticated on new public-schema functions is a separate, explicit
-- grant that survives it -- revoke that explicitly too, or anon keeps
-- EXECUTE despite `revoke ... from public`.
revoke execute on function public.member_confirm_participation(uuid) from public;
revoke execute on function public.member_confirm_participation(uuid) from anon;
grant execute on function public.member_confirm_participation(uuid) to authenticated;

-- Host visibility of a participant's phone now also requires that
-- participant's own consent, not just a non-cancelled row -- see the
-- migration header.
drop policy profiles_private_select_self_admin_or_host on public.profiles_private;

create policy profiles_private_select_self_admin_or_host on public.profiles_private
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.participants p
      where p.user_id = profiles_private.user_id
        and p.status <> 'cancelled'
        and p.consented_at is not null
        and public.is_session_host(p.session_id)
    )
  );
