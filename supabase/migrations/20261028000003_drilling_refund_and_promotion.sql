-- Drilling sessions: refund and promotion rules (spec
-- 2026-10-26-drilling-sessions-design.md sections 5 and 6).
--
-- 1. refund_usage_on_cancel: a member cancel from confirmed never refunds on a
--    drilling session. Cancel from waiting_list, host cancel and session
--    cancel still refund; open play keeps the cutoff rule.
-- 2. refund_usage_on_cancel and promote_from_waitlist both return at once for a
--    row with replaced_by set: a handed-over seat is neither refunded (the
--    original usage stays consumed) nor given to the waitlist.
--
-- Bodies are copied from the latest definitions
-- (refund_usage_on_cancel: 20261023000005; promote_from_waitlist: 20261023000003)
-- with only the changes above. Trigger definitions are unchanged.

create or replace function public.refund_usage_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions;
  v_reason text;
begin
  -- A seat handed over via transfer_participation keeps its usage consumed.
  if new.replaced_by is not null then
    return null;
  end if;

  if not old.is_premium then
    return null;
  end if;

  select * into v_session from public.sessions where id = new.session_id;

  if old.status = 'waiting_list' then
    v_reason := 'waitlist_cancel';
  elsif public.is_session_host(new.session_id)
        and auth.uid() is distinct from new.user_id then
    -- auth.uid() reads the caller's JWT claims, which a security definer
    -- function still sees, so this is the human who issued the cancel.
    v_reason := 'host_cancel';
  elsif v_session.kind = 'drilling' then
    -- A member cancel from confirmed never refunds on a drilling session.
    return null;
  elsif v_session.status not in ('live', 'completed') then
    -- A member cancel from confirmed. A session already live (or completed)
    -- never refunds a member cancel, even if a host started it early.
    v_reason := 'member_cancel_before_cutoff';
  else
    return null;
  end if;

  update public.membership_usages u
     set refunded_at = now(),
         refund_reason = v_reason
    from public.memberships m
   where u.participant_id = new.id
     and u.refunded_at is null
     and m.id = u.membership_id
     -- The cutoff is the membership's snapshot, compared with now().
     and (v_reason <> 'member_cancel_before_cutoff'
          or now() <= v_session.starts_at
                      - m.refund_cutoff_hours * interval '1 hour');

  return null;
end;
$$;

-- Trigger function: never callable as an RPC.
revoke execute on function public.refund_usage_on_cancel() from public, anon, authenticated;

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

  -- A handed-over seat is already taken by its replacement.
  if new.replaced_by is not null then
    return null;
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
        order by is_premium desc, registered_at, id
        limit 1
     );
  end if;

  return null;
end;
$$;

revoke execute on function public.promote_from_waitlist() from public, anon, authenticated;
