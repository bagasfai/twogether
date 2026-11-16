create or replace function public.queue_participant_email()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_type public.email_type;
  v_payload jsonb := '{}';
begin
  if new.user_id is null then return null; end if;
  if not exists (select 1 from public.sessions
                  where id = new.session_id and status in ('scheduled', 'live')) then
    return null;
  end if;

  if tg_op = 'INSERT' or old.status = 'cancelled' then
    v_type := case new.status
      when 'confirmed' then 'registration_confirmed'
      when 'waiting_list' then 'registration_waitlisted' end;
  elsif old.status = 'waiting_list' and new.status = 'confirmed' then
    v_type := 'waitlist_promoted';
  elsif old.status = 'confirmed' and new.status = 'waiting_list' then
    v_type := case when new.bumped_at is distinct from old.bumped_at
      then 'bumped' else 'registration_waitlisted' end;
  elsif new.status = 'cancelled' then
    v_type := 'registration_cancelled';
  end if;

  if v_type is null then return null; end if;

  if v_type = 'registration_waitlisted' then
    v_payload := jsonb_build_object('waitlist_position',
      public.waitlist_position_of(new.session_id, new.registered_at, new.id));
  end if;

  insert into public.email_outbox (type, user_id, session_id, payload)
  values (v_type, new.user_id, new.session_id, v_payload);
  return null;
end; $$;

revoke execute on function public.queue_participant_email() from public, anon, authenticated;

create trigger participants_queue_email_insert
  after insert on public.participants
  for each row execute function public.queue_participant_email();

create trigger participants_queue_email
  after update of status on public.participants
  for each row when (old.status is distinct from new.status)
  execute function public.queue_participant_email();

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
  v_existing_replaced_by uuid;
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

  select status, replaced_by into v_existing, v_existing_replaced_by
    from public.participants
   where session_id = p_session_id and user_id = v_user;

  if v_existing in ('confirmed', 'waiting_list') then
    raise exception 'already registered' using errcode = 'JB003';
  end if;

  -- Session lock is held; now lock the member's memberships. A null id means
  -- no current membership (none, expired, cancelled or out of quota): the
  -- caller registers exactly as a non-premium member.
  -- A handed-over row whose usage is still live: that unit already pays for
  -- the replacement's seat, so this registration is non-premium (header
  -- item 4). The usage is left exactly as it is.
  if v_existing_replaced_by is not null and exists (
       select 1
         from public.membership_usages u
         join public.participants p on p.id = u.participant_id
        where p.session_id = p_session_id
          and p.user_id = v_user
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

revoke execute on function public.register_for_session(uuid) from public;
revoke execute on function public.register_for_session(uuid) from anon;
grant execute on function public.register_for_session(uuid) to authenticated;

insert into public.email_outbox (type, user_id, session_id, created_at)
select 'bumped', p.user_id, p.session_id, b.created_at
  from public.bump_notifications b
  join public.participants p on p.id = b.participant_id
 where b.sent_at is null and p.user_id is not null;

drop table public.bump_notifications;
