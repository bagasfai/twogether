-- Premium priority registration with bump and quota consume
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md, section 4).
--
-- Replaces register_for_session. Based on the latest definition in
-- 20260914000001_participant_consent.sql: same signature and result type,
-- same isolation guard (JB006), error codes, consented_at stamping and
-- grants. register_guest_for_session is deliberately left unchanged.
--
-- Concurrency:
-- * Lock order is the session advisory lock first, then the member's
--   membership rows (inside lock_current_membership). Every other writer
--   that takes both takes them in this order, so no deadlock.
-- * Membership is locked only after the open and already-registered checks,
--   so JB001/JB003 fire exactly as before without touching memberships.
-- * The bump target is chosen and moved under the session lock, in this
--   transaction. The target row is also locked (FOR UPDATE) because a host
--   check-in is a direct UPDATE that does not take the session lock; the
--   locked re-check means a just-checked-in row is never bumped.
--
-- Trigger interplay: the bump is a confirmed -> waiting_list UPDATE, which
-- fires participants_promote_waitlist. The caller is upserted as confirmed
-- FIRST, so when the bump runs the confirmed count is back at capacity and
-- promote_from_waitlist promotes nobody. Bumping first would leave a free
-- seat at trigger time and promote some other waiter, undoing the bump.

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
      -- Last-registered confirmed participant who is non-premium, not
      -- checked in, not host-added and not a guest. Premium never bumps
      -- premium. FOR UPDATE re-checks the predicate against a row a host
      -- may have just checked in (see header).
      select id into v_bump_target
        from public.participants
       where session_id = p_session_id
         and status = 'confirmed'
         and not is_premium
         and checked_in_at is null
         and added_by is null
         and user_id is not null
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
        bumped_at = null
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

    insert into public.bump_notifications (participant_id)
    values (v_bump_target);
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
