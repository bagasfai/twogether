-- Premium membership helpers and premium-first waitlist order
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md, sections 3 and 4).

-- ---- membership_quota_left ----
-- Quota units not yet consumed: quota_total minus live (unrefunded) usages.
create or replace function public.membership_quota_left(p_membership_id uuid)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  select m.quota_total - (
    select count(*)::int
      from public.membership_usages u
     where u.membership_id = m.id
       and u.refunded_at is null
  )
  from public.memberships m
  where m.id = p_membership_id;
$$;

revoke execute on function public.membership_quota_left(uuid)
  from public, anon, authenticated;

-- ---- lock_current_membership ----
-- Returns the user's current membership (earliest-created non-cancelled one
-- that is not expired and has quota left), row-locked, starting it lazily if
-- it was queued. Returns a row with null id when there is none. Called by
-- security definer RPCs AFTER the session advisory lock (lock order:
-- session lock, then membership row).
--
-- Concurrency: the quota check must not share a statement with FOR UPDATE.
-- Under read committed, a single "select ... where quota_left > 0 for update"
-- evaluates the quota subquery on the pre-lock snapshot, so two sessions of
-- one member racing for the last unit could both pass. Instead we lock every
-- non-cancelled membership of the user first, in a fixed order (created_at,
-- id; also avoids deadlocks), and compute quota in a later statement, which
-- sees a fresh snapshot that includes usages committed by the lock holder.
create or replace function public.lock_current_membership(p_user_id uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_row public.memberships;
  v_candidate public.memberships;
begin
  select coalesce(array_agg(id order by created_at, id), '{}')
    into v_ids
    from (
      select id, created_at
        from public.memberships
       where user_id = p_user_id
         and cancelled_at is null
       order by created_at, id
         for update
    ) locked;

  foreach v_id in array v_ids loop
    -- Fresh statement after the locks: re-read the row and its quota.
    select * into v_candidate from public.memberships where id = v_id;

    if v_candidate.cancelled_at is null
       and (v_candidate.started_at is null or v_candidate.expires_at > now())
       and public.membership_quota_left(v_id) > 0 then
      if v_candidate.started_at is null then
        update public.memberships
           set started_at = now(),
               expires_at = now() + v_candidate.duration_days * interval '1 day'
         where id = v_id
        returning * into v_candidate;
      end if;
      return v_candidate;
    end if;
  end loop;

  return v_row;  -- all-null row: no current membership
end;
$$;

revoke execute on function public.lock_current_membership(uuid)
  from public, anon, authenticated;

-- ---- waitlist ordering: is_premium desc, registered_at, id ----

create or replace function public.waitlist_position_of(
  p_session_id uuid,
  p_registered_at timestamptz,
  p_id uuid
)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  -- Same total order as promote_from_waitlist's ORDER BY: premium first,
  -- then registered_at, then id as the deterministic tie-break.
  select count(*) + 1
    from public.participants w, public.participants t
   where t.id = p_id
     and w.session_id = p_session_id
     and w.status = 'waiting_list'
     and (not w.is_premium, w.registered_at, w.id)
       < (not t.is_premium, p_registered_at, p_id);
$$;

revoke execute on function public.waitlist_position_of(uuid, timestamptz, uuid)
  from public, anon, authenticated;

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
        order by is_premium desc, registered_at, id
        limit 1
     );
  end if;

  return null;
end;
$$;

-- The host-DELETE path must use the same order. Body identical to
-- 20260911000012_invariant_fixes.sql except the ORDER BY.
create or replace function public.promote_from_waitlist_on_delete()
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
    raise exception 'promote_from_waitlist_on_delete requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(old.session_id));

  select * into v_session from public.sessions where id = old.session_id;

  if v_session.status not in ('scheduled', 'live') then
    return null;
  end if;

  select count(*) into v_confirmed
    from public.participants
   where session_id = old.session_id and status = 'confirmed';

  if v_confirmed < v_session.max_participants then
    update public.participants
       set status = 'confirmed'
     where id = (
       select id from public.participants
        where session_id = old.session_id
          and status = 'waiting_list'
        order by is_premium desc, registered_at, id
        limit 1
     );
  end if;

  return null;
end;
$$;
