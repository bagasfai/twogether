-- Drilling sessions: seat replacement (spec 2026-10-26-drilling-sessions-design.md
-- section 6). A member hands a confirmed seat to another member; a host can
-- hand over any seat, including a guest's.
--
-- No trigger or constraint on participants limits the confirmed count, and
-- promote_from_waitlist / refund_usage_on_cancel return early for a row with
-- replaced_by set, so the order is: insert or revive the replacement, then
-- cancel the old row with replaced_by pointing at it.
--
-- The replacement gets no membership_usages row: the original usage stays
-- consumed and is never refunded. It carries the is_premium / membership_id
-- snapshot so the seat keeps its bump protection.
--
-- checked_in_at is reset to null (the replacement has not arrived) and
-- consented_at is left null (the replacement confirms through
-- member_confirm_participation, as host-added rows do). added_by is set to
-- the caller (the host, or the member handing the seat over): the app keys
-- "awaiting confirmation" on added_by not null and consented_at null, so a
-- null added_by would never prompt the replacement.
--
-- Locks: the session advisory lock plus FOR UPDATE on the participant row.
-- The sessions row is read without FOR UPDATE: every status change that
-- matters here (cancel / live / completed sweeps) takes the advisory lock.
--
-- Errors: JB004 anon, JB006 isolation, JB007 not owner or host, JB008 seat or
-- target not found, JB021 target already on the session, JB022 seat not
-- confirmed, JB023 member after starts_at or session not scheduled / live.

create or replace function public.transfer_participation(
  p_participant_id uuid,
  p_to_user_id uuid
)
returns public.participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session_id uuid;
  v_old public.participants;
  v_session public.sessions;
  v_is_host boolean;
  v_target_status public.participant_status;
  v_target_id uuid;
  v_new public.participants;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'transfer_participation requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  select session_id into v_session_id
    from public.participants where id = p_participant_id;
  if v_session_id is null then
    raise exception 'participant not found' using errcode = 'JB008';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(v_session_id));

  select * into v_old from public.participants
   where id = p_participant_id for update;
  select * into v_session from public.sessions
   where id = v_session_id;

  v_is_host := public.is_session_host(v_session_id);
  -- A guest seat has user_id null: a bare comparison is NULL and would let
  -- any caller through, so coalesce it to false.
  if not (v_is_host or coalesce(v_old.user_id = v_user, false)) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  if v_old.status is distinct from 'confirmed' then
    raise exception 'only a confirmed seat can be handed over' using errcode = 'JB022';
  end if;

  if v_session.status not in ('scheduled', 'live') then
    raise exception 'session is not open for seat changes' using errcode = 'JB023';
  end if;
  if not v_is_host and now() >= v_session.starts_at then
    raise exception 'seat transfer is closed once the session has started'
      using errcode = 'JB023';
  end if;

  if not exists (select 1 from public.profiles where id = p_to_user_id) then
    raise exception 'target member not found' using errcode = 'JB008';
  end if;

  if p_to_user_id is not distinct from v_old.user_id then
    raise exception 'cannot transfer a seat to its own holder' using errcode = 'JB021';
  end if;

  select id, status into v_target_id, v_target_status
    from public.participants
   where session_id = v_session_id and user_id = p_to_user_id;
  if v_target_status in ('confirmed', 'waiting_list') then
    raise exception 'target already has a seat on this session' using errcode = 'JB021';
  end if;

  -- A cancelled row can still own a live usage (a cancel that kept its quota
  -- consumed). Reviving it as a premium replacement would put a second claim
  -- on that unit, and a later refund-eligible cancel would hand it back.
  -- Refuse; the usage is left untouched.
  if v_target_id is not null and exists (
       select 1 from public.membership_usages
        where participant_id = v_target_id and refunded_at is null) then
    raise exception 'target has a live quota usage on this session'
      using errcode = 'JB021';
  end if;

  -- Insert, or revive the target's cancelled row (UNIQUE (session_id,
  -- user_id)). The revive resets every per-row field so nothing from the
  -- earlier registration leaks into the replacement.
  insert into public.participants
    (session_id, user_id, status, registered_at, consented_at, is_premium,
     membership_id, paid_at, paid_by_user_id, added_by, bumped_at,
     checked_in_at, replaced_by, cancelled_at, no_show_at)
  values
    (v_session_id, p_to_user_id, 'confirmed', clock_timestamp(), null,
     v_old.is_premium, v_old.membership_id, v_old.paid_at, v_old.user_id, v_user,
     null, null, null, null, null)
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        consented_at = excluded.consented_at,
        is_premium = excluded.is_premium,
        membership_id = excluded.membership_id,
        paid_at = excluded.paid_at,
        paid_by_user_id = excluded.paid_by_user_id,
        added_by = excluded.added_by,
        bumped_at = excluded.bumped_at,
        checked_in_at = excluded.checked_in_at,
        replaced_by = excluded.replaced_by,
        cancelled_at = excluded.cancelled_at,
        no_show_at = excluded.no_show_at
  returning * into v_new;

  update public.participants
     set status = 'cancelled',
         cancelled_at = now(),
         replaced_by = v_new.id
   where id = v_old.id;

  return v_new;
end;
$$;

revoke execute on function public.transfer_participation(uuid, uuid) from public;
revoke execute on function public.transfer_participation(uuid, uuid) from anon;
grant execute on function public.transfer_participation(uuid, uuid) to authenticated;
