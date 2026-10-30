-- Re-review fix: demotion (confirmed -> waiting_list) was self-reverting,
-- and a demoted participant kept checked_in_at set. Migration 0012 is now
-- reviewed and closed; this is a new migration.

-- ---------------------------------------------------------------------------
-- Demotion self-reversion: promote_from_waitlist picks the earliest
-- waiting_list row WITHOUT excluding the row whose UPDATE fired the
-- trigger. On a confirmed -> waiting_list demotion, the demoted row is
-- itself already sitting at status = 'waiting_list' by the time the
-- AFTER ROW trigger runs, and the confirmed count is now below max -- so
-- whenever the demoted participant's registered_at precedes the existing
-- waiters (the normal case, since they were confirmed first) the trigger
-- immediately re-confirms the very person the host just demoted, silently
-- undoing the host's manual override. Exclude the firing row itself from
-- the candidate pool. Harmless on the cancel path (that row is no longer
-- waiting_list at all by the time this runs) and on the delete path
-- (the row is gone, so it was never a candidate).
-- ---------------------------------------------------------------------------

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
          and id is distinct from new.id
        order by registered_at, id
        limit 1
     );
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- checked_in_at is only meaningful for a confirmed participant. F1's
-- trigger only nulled it on a transition to 'cancelled', so a demotion to
-- 'waiting_list' left checked_in_at set -- and guard_match_player only
-- checks checked_in_at is null plus session match, so a demoted,
-- still-marked-checked-in participant could still be added to a match.
-- Broaden the condition to any status other than 'confirmed'.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_checkin_requires_active()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'confirmed' then
    new.checked_in_at := null;
  end if;
  return new;
end;
$$;
