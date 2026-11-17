-- A quota unit that pays for a handed-over seat stays on the original row
-- (20261028000004). Two paths could still spend or refund it a second time.
--
-- 1. register_for_session: the guard keyed on replaced_by, but the first
--    re-registration clears replaced_by. After register, transfer, register,
--    cancel, register, the guard no longer fired, the row turned premium and
--    the re-point UPDATE took over the funding unit. The guard now keys on the
--    row itself: a live usage on a row that was handed over, or on a row that
--    is not premium, is a funding or forfeited unit. It is never re-pointed and
--    the registration is non-premium. A premium row cancelled late (live usage,
--    is_premium still true) keeps the old behaviour: the unit is re-pointed.
--
-- 2. refund_usages_on_session_change: the live / completed sweep refunded
--    every live usage on a waitlisted row. A member who re-registers after a
--    hand-off is waitlisted as non-premium, so the sweep refunded the unit that
--    funds the replacement. The sweep now refunds premium waitlist rows only.
--    A forfeited unit on a non-premium waitlist row stays forfeited (Ruling 4).
--    The cancelled sweep is unchanged.
--
-- Bodies are copied from 20261116000002 (register_for_session) and
-- 20261023000007 (refund_usages_on_session_change) with only these changes.

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
  v_existing_id uuid;
  v_existing_replaced_by uuid;
  v_existing_is_premium boolean;
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

  select id, status, replaced_by, is_premium
    into v_existing_id, v_existing, v_existing_replaced_by, v_existing_is_premium
    from public.participants
   where session_id = p_session_id and user_id = v_user;

  if v_existing in ('confirmed', 'waiting_list') then
    raise exception 'already registered' using errcode = 'JB003';
  end if;

  -- Session lock is held; now lock the member's memberships. A null id means
  -- no current membership (none, expired, cancelled or out of quota): the
  -- caller registers exactly as a non-premium member.
  -- A live usage on a handed-over row, or on a non-premium row, funds a
  -- replacement's seat or is forfeited. It is never re-pointed, and this
  -- registration is non-premium. The usage is left exactly as it is.
  if (v_existing_replaced_by is not null or not v_existing_is_premium)
     and exists (
       select 1 from public.membership_usages u
        where u.participant_id = v_existing_id
          and u.refunded_at is null) then
    v_membership := null;
  else
    v_membership := public.lock_current_membership(v_user);
  end if;
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
      -- the 20261023000004 header).
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
    -- participants_promote_waitlist fires for this demotion (see the
    -- 20261023000004 header).
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

  end if;

  if v_is_premium then
    -- One unit per participant row (partial unique index
    -- membership_usages_one_live_per_participant). A re-registration over a
    -- still-live usage on a premium row (a late cancel that kept its quota
    -- consumed) does not consume a second unit. Instead the live usage is
    -- re-pointed to the membership this registration snapshots, so the
    -- ledger always agrees with participants.membership_id: the old
    -- membership gets its unit back, the current one is charged.
    -- consumed_at is kept: it records when this participant row first
    -- consumed the unit. Race-free: every write to this participant row's
    -- usages runs under this session's advisory lock, which we hold.
    -- A funding or forfeited usage never reaches here (guard above).
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

revoke execute on function public.register_for_session(uuid) from public;
revoke execute on function public.register_for_session(uuid) from anon;
grant execute on function public.register_for_session(uuid) to authenticated;

create or replace function public.refund_usages_on_session_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- See 20261023000005 header: serialises with registrations for this
  -- session.
  perform pg_advisory_xact_lock(public.session_lock_key(new.id));

  if new.status = 'cancelled' then
    update public.membership_usages u
       set refunded_at = now(),
           refund_reason = 'session_cancelled'
      from public.participants p
     where p.id = u.participant_id
       and p.session_id = new.id
       and u.refunded_at is null;
  elsif new.status in ('live', 'completed') then
    -- Premium waitlist rows only: a live usage on a non-premium waitlist row
    -- funds a handed-over seat or is forfeited.
    update public.membership_usages u
       set refunded_at = now(),
           refund_reason = case when new.status = 'live'
                                then 'waitlist_at_start'
                                else 'waitlist_at_close' end
      from public.participants p
     where p.id = u.participant_id
       and p.session_id = new.id
       and p.status = 'waiting_list'
       and p.is_premium
       and u.refunded_at is null;

    -- Ruling 6: a premium snapshot means a charged unit. The waitlisters were
    -- just refunded, so they are no longer premium in this session.
    update public.participants
       set is_premium = false,
           membership_id = null
     where session_id = new.id
       and status = 'waiting_list'
       and is_premium;
  end if;

  return null;
end;
$$;

revoke execute on function public.refund_usages_on_session_change() from public, anon, authenticated;
