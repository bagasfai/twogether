-- Drilling sessions: registration rule changes (spec
-- 2026-10-26-drilling-sessions-design.md section 5 and decision 8).
--
-- 1. The premium bump target now includes host-added rows and guest rows.
--    Premium and checked-in rows stay protected.
-- 2. Bumping a guest row (user_id null) inserts no bump_notifications row:
--    the guest has no account, and the registration must not fail.
-- 3. register_for_session's re-registration, host_add_participant's re-add of
--    a cancelled row and host_set_participant_status's un-cancel clear
--    replaced_by and paid_by_user_id. A stale replaced_by would make the
--    promotion and refund triggers skip the row forever.
--
-- Bodies are copied from the latest definitions
-- (register_for_session: 20261023000004; host_add_participant and
-- host_set_participant_status: 20261023000007). Signatures, JB006 guards and
-- grants are unchanged.

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
  v_membership public.memberships;
  v_is_premium boolean;
  v_bump_target uuid;
  v_bump_target_user uuid;
  v_earliest_waiting timestamptz;
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

  -- Session lock is held; now lock the member's memberships. A null id means
  -- no current membership (none, expired, cancelled or out of quota): the
  -- caller registers exactly as a non-premium member.
  v_membership := public.lock_current_membership(v_user);
  v_is_premium := v_membership.id is not null;

  select
    count(*) filter (where status = 'confirmed'),
    count(*) filter (where status = 'waiting_list')
  into v_confirmed, v_waiting
  from public.participants
  where session_id = p_session_id;

  if v_confirmed < v_session.max_participants then
    v_status := 'confirmed';
  else
    if v_is_premium then
      -- Last-registered confirmed participant who is non-premium and not
      -- checked in. Host-added rows and guest rows are bumpable (drilling
      -- spec decision 8). Premium never bumps premium. FOR UPDATE re-checks
      -- the predicate against a row a host may have just checked in (see
      -- header).
      select id, user_id into v_bump_target, v_bump_target_user
        from public.participants
       where session_id = p_session_id
         and status = 'confirmed'
         and not is_premium
         and checked_in_at is null
       order by registered_at desc, id desc
       limit 1
         for update;
    end if;

    if v_bump_target is not null then
      -- A bump ignores waitlist_capacity.
      v_status := 'confirmed';
    elsif v_waiting < v_session.waitlist_capacity then
      v_status := 'waiting_list';
    else
      raise exception 'session is full' using errcode = 'JB002';
    end if;
  end if;

  insert into public.participants
    (session_id, user_id, status, registered_at, consented_at, is_premium, membership_id)
  values (p_session_id, v_user, v_status, v_registered_at, v_registered_at,
          v_is_premium, v_membership.id)
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        consented_at = excluded.consented_at,
        cancelled_at = null,
        added_by = null,
        -- re-entering the queue is not re-entering the checked-in pool
        checked_in_at = null,
        -- premium is a snapshot of this registration, not the previous one
        is_premium = excluded.is_premium,
        membership_id = excluded.membership_id,
        bumped_at = null,
        -- a seat handed over earlier no longer applies to a fresh registration
        replaced_by = null,
        paid_by_user_id = null
  returning id into v_participant_id;

  if v_bump_target is not null then
    -- After the caller's upsert, so the confirmed count is at capacity when
    -- participants_promote_waitlist fires for this demotion (see header).
    -- The bumped member leads the non-premium queue: 1us before the
    -- earliest non-premium waiter, or now if nobody non-premium waits.
    select min(registered_at) into v_earliest_waiting
      from public.participants
     where session_id = p_session_id
       and status = 'waiting_list'
       and not is_premium;

    update public.participants
       set status = 'waiting_list',
           registered_at = coalesce(v_earliest_waiting - interval '1 microsecond',
                                    clock_timestamp()),
           bumped_at = clock_timestamp()
     where id = v_bump_target;

    -- A guest row has no account to notify.
    if v_bump_target_user is not null then
      insert into public.bump_notifications (participant_id)
      values (v_bump_target);
    end if;
  end if;

  if v_is_premium then
    -- One unit per participant row (partial unique index
    -- membership_usages_one_live_per_participant). A re-registration over a
    -- still-live usage (a cancel that kept its quota consumed, e.g. a late
    -- cancel) does not consume a second unit. Instead the live usage is
    -- re-pointed to the membership this registration snapshots, so the
    -- ledger always agrees with participants.membership_id: the old
    -- membership gets its unit back, the current one is charged.
    -- consumed_at is kept: it records when this participant row first
    -- consumed the unit. Race-free: every write to this participant row's
    -- usages runs under this session's advisory lock, which we hold.
    -- A non-premium re-registration never reaches here, so a stale live
    -- usage is left untouched in that case.
    update public.membership_usages
       set membership_id = v_membership.id
     where participant_id = v_participant_id
       and refunded_at is null;

    if not found then
      insert into public.membership_usages (membership_id, participant_id, consumed_at)
      values (v_membership.id, v_participant_id, now());
    end if;
  end if;

  v_result.status := v_status;

  if v_status = 'waiting_list' then
    v_result.waitlist_position :=
      public.waitlist_position_of(p_session_id, v_registered_at, v_participant_id);
  end if;

  return v_result;
end;
$$;

-- create or replace keeps the existing ACL; restated so the privilege story
-- is visible here (same two-step revoke as migration 10).
revoke execute on function public.register_for_session(uuid) from public;
revoke execute on function public.register_for_session(uuid) from anon;
grant execute on function public.register_for_session(uuid) to authenticated;

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
        checked_in_at = null,
        -- a host-added row is non-premium (spec s5), even when it re-uses a
        -- row from an earlier premium registration. Only a cancelled row is
        -- reset: a still-active (confirmed / waiting_list) premium row keeps
        -- its snapshot, because its membership_usages unit is still live and
        -- refund_usage_on_cancel (gated on old.is_premium) must be able to
        -- refund it later. (participants.status is the pre-update value.)
        is_premium = case when participants.status = 'cancelled'
                          then false else participants.is_premium end,
        membership_id = case when participants.status = 'cancelled'
                             then null else participants.membership_id end,
        bumped_at = case when participants.status = 'cancelled'
                         then null else participants.bumped_at end,
        -- a cancelled row's transfer links must not outlive the re-add, or
        -- the promotion and refund triggers would skip it forever
        replaced_by = case when participants.status = 'cancelled'
                           then null else participants.replaced_by end,
        paid_by_user_id = case when participants.status = 'cancelled'
                               then null else participants.paid_by_user_id end
  returning * into v_row;

  return v_row;
end;
$$;


-- Same as 20260917000003_demotion_queue_fairness.sql except an un-cancel
-- (cancelled -> confirmed / waiting_list) resets the premium snapshot.

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
  v_old_status public.participant_status;
  v_row public.participants;
  v_uncancel boolean;
begin
  select session_id, status into v_session_id, v_old_status
    from public.participants where id = p_participant_id;

  if v_session_id is null then
    raise exception 'participant not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(v_session_id));

  -- A host bringing a cancelled row back is a host action, not a premium
  -- registration: the row comes back non-premium (spec s5).
  v_uncancel := v_old_status = 'cancelled' and p_status <> 'cancelled';

  update public.participants
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else null end,
         -- a host-cancelled participant leaves the checked-in pool too
         checked_in_at = case when p_status = 'cancelled' then null else checked_in_at end,
         registered_at = case
           when p_status = 'waiting_list' and v_old_status is distinct from 'waiting_list'
             then now()
           else registered_at
         end,
         is_premium = case when v_uncancel then false else is_premium end,
         membership_id = case when v_uncancel then null else membership_id end,
         bumped_at = case when v_uncancel then null else bumped_at end,
         replaced_by = case when v_uncancel then null else replaced_by end,
         paid_by_user_id = case when v_uncancel then null else paid_by_user_id end
   where id = p_participant_id
  returning * into v_row;

  return v_row;
end;
$$;
