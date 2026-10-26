-- Premium quota refunds
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md, section 4
-- "Refunds").
--
-- A refund stamps refunded_at = now() and a refund_reason on the open usage
-- row (refunded_at is null) of a participant. The ledger is keyed by
-- participant_id only: one quota unit per participant row, refunded wherever
-- it points, never looked up through participants.membership_id. Every
-- refund UPDATE filters on refunded_at is null, so re-running any of them is
-- a no-op and an already refunded row keeps its original time and reason.
--
-- 1. refund_usage_on_cancel: participant status -> cancelled. Covers member
--    cancels (cancel_registration) and host overrides
--    (host_set_participant_status) in one place. Only a row snapshotted as
--    premium refunds: a non-premium row can carry a stale live usage
--    forfeited by an earlier late cancel, and cancelling it must not hand
--    that unit back.
-- 2. refund_usages_on_session_change: session status -> cancelled refunds
--    every open usage of the session; -> live refunds open usages of
--    participants still on the waitlist.
--
-- The confirmed -> waiting_list bump in register_for_session is not a cancel,
-- so the participant trigger's WHEN never fires for it.
--
-- Concurrency: every participant status writer already holds the session
-- advisory lock when the participant trigger fires. The session trigger takes
-- the same lock, so a registration that read status = 'scheduled' and is
-- still inserting its usage finishes (and commits) before the refund sweep
-- reads usages, and a registration that queues behind the sweep re-reads the
-- new status and fails with JB001. start_session is replaced below only to
-- take that lock BEFORE its sessions row lock: otherwise start_session
-- (holding the row FOR UPDATE) waits for the advisory lock while a
-- registration (holding the advisory lock) waits on the row for its
-- participants FK check, a deadlock.
--
-- Accepted residual edge (docs/superpowers/core-schema-follow-ups.md): a
-- direct `update sessions set status = 'cancelled'` (cancelSession in
-- lib/actions/sessions.ts) takes the sessions row lock first and then this
-- trigger's advisory lock, the reverse of start_session. A cancel racing a
-- start of the same session can therefore abort one of them with 40P01. The
-- abort is clean and the action can be retried. Future fix: a cancel_session
-- RPC that takes the advisory lock first.
--
-- Cancels that fall back to the member/cutoff rule: a cancel with no JWT
-- (service role; auth.uid() is null, so it is never a host cancel), and a
-- member cancel on a draft session. Only live and completed sessions block
-- the member refund.

-- ---- participant cancel ----

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

create trigger participants_refund_usage_on_cancel
after update of status on public.participants
for each row
when (old.status in ('confirmed', 'waiting_list') and new.status = 'cancelled')
execute function public.refund_usage_on_cancel();

-- ---- session live / cancelled ----

create or replace function public.refund_usages_on_session_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- See header: serialises with registrations for this session.
  perform pg_advisory_xact_lock(public.session_lock_key(new.id));

  if new.status = 'cancelled' then
    update public.membership_usages u
       set refunded_at = now(),
           refund_reason = 'session_cancelled'
      from public.participants p
     where p.id = u.participant_id
       and p.session_id = new.id
       and u.refunded_at is null;
  elsif new.status = 'live' then
    update public.membership_usages u
       set refunded_at = now(),
           refund_reason = 'waitlist_at_start'
      from public.participants p
     where p.id = u.participant_id
       and p.session_id = new.id
       and p.status = 'waiting_list'
       and u.refunded_at is null;
  end if;

  return null;
end;
$$;

revoke execute on function public.refund_usages_on_session_change() from public, anon, authenticated;

create trigger sessions_refund_usages
after update of status on public.sessions
for each row
when (old.status is distinct from new.status and new.status in ('live', 'cancelled'))
execute function public.refund_usages_on_session_change();

-- ---- start_session: advisory lock before the row lock ----
-- Same as 20261021000001_start_session_auto_album.sql except the session
-- advisory lock is taken before the sessions row lock (see header).

create or replace function public.start_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.session_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  -- Not-found is checked before authorization so an unknown id reports
  -- JB008 for every caller; session ids are not secret to authenticated users.
  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'session not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(p_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  -- Lock order: session advisory lock, then the sessions row. The refund
  -- trigger fired by the update below takes the same advisory lock.
  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  -- Row lock: two concurrent starts serialise here, and the loser re-reads
  -- 'live' and gets JB016 instead of both passing the status check.
  select status into v_status
    from public.sessions
   where id = p_session_id
     for update;

  if v_status <> 'scheduled' then
    raise exception 'session is not scheduled' using errcode = 'JB016';
  end if;

  update public.sessions set status = 'live' where id = p_session_id;
end;
$$;

revoke execute on function public.start_session(uuid) from public, anon;
grant execute on function public.start_session(uuid) to authenticated;
