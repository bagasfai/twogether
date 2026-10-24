-- Premium membership: final whole-branch review fixes
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md,
-- sections 4 "Refunds" and 5; ledger Rulings 6 and 7).
--
-- 1. Refund on close. sessions_refund_usages only fired for live and
--    cancelled. closeSession (lib/actions/sessions.ts) sets 'completed'
--    directly from 'scheduled', so premium waitlisters of a session that was
--    never started kept their unit. The trigger now also fires for
--    'completed' and runs the same waitlist sweep. After a 'live' sweep the
--    'completed' sweep finds no open waitlist usage (every UPDATE filters on
--    refunded_at is null), so it is a no-op there.
--
--    Lock order: the trigger takes the session advisory lock, as before.
--    closeSession is a direct `update sessions set status = 'completed'`, so
--    like cancelSession it takes the sessions row lock first and the
--    advisory lock second, the reverse of start_session. A close racing a
--    start of the same session joins the accepted 40P01 edge of Ruling 5
--    (clean abort, retry the action; future fix: close/cancel RPCs that take
--    the advisory lock first). See docs/superpowers/core-schema-follow-ups.md.
--
-- 2. Live sweep clears the premium snapshot (Ruling 6). The live (and
--    completed) sweep refunds waitlisted participants' open usages, then sets
--    is_premium = false, membership_id = null on the session's premium
--    waitlist rows. Invariant: a premium snapshot means a charged unit. A
--    refunded waitlister who is later promoted while live is now honestly
--    non-premium. No double refund: refund_usage_on_cancel returns early on
--    `not old.is_premium`, and every refund UPDATE filters on
--    refunded_at is null. Clearing the snapshot does not fire the
--    participant refund or promotion triggers (they key on a status change).
--
-- 3. Host re-add and host un-cancel reset the premium snapshot (spec s5:
--    host-added rows are non-premium). host_add_participant's conflict
--    branch and host_set_participant_status's cancelled -> active path
--    re-used a participant row and kept is_premium / membership_id /
--    bumped_at from an earlier premium registration. Both now reset them,
--    but only when the existing row is cancelled: host_add_participant's
--    conflict branch leaves a still-active premium row's snapshot alone
--    (its usage is live and must stay refundable).
--    Any usage still live on such a row (a late cancel that was not
--    refunded) stays a forfeited unit, per Ruling 4.
--
-- Function signatures are unchanged.

-- ---- 1 + 2: session live / completed / cancelled sweep ----

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
    update public.membership_usages u
       set refunded_at = now(),
           refund_reason = case when new.status = 'live'
                                then 'waitlist_at_start'
                                else 'waitlist_at_close' end
      from public.participants p
     where p.id = u.participant_id
       and p.session_id = new.id
       and p.status = 'waiting_list'
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

drop trigger if exists sessions_refund_usages on public.sessions;
create trigger sessions_refund_usages
after update of status on public.sessions
for each row
when (old.status is distinct from new.status
      and new.status in ('live', 'completed', 'cancelled'))
execute function public.refund_usages_on_session_change();

-- ---- 3a: host_add_participant ----
-- Same as 20260914000001_participant_consent.sql except the conflict branch
-- resets the premium snapshot.

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
                         then null else participants.bumped_at end
  returning * into v_row;

  return v_row;
end;
$$;

-- ---- 3b: host_set_participant_status ----
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
         bumped_at = case when v_uncancel then null else bumped_at end
   where id = p_participant_id
  returning * into v_row;

  return v_row;
end;
$$;
