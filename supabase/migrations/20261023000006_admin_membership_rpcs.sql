-- Admin grant and cancel RPCs for premium memberships
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md, sections 3, 5, 8).
-- These are the only write path into public.memberships. Guards, in order,
-- mirror the FAQ RPCs plus the JB004 check the other admin/host RPCs use:
--   JB006 wrong transaction isolation
--   JB004 not authenticated (auth.uid() is null)
--   JB007 not authorized (not public.is_admin())
--   JB017 membership or plan not found or inactive (also: user not found)
--   JB018 membership already cancelled
--
-- Duration clock (spec section 3): a grant to a user with no live membership
-- starts at once (started_at = now(), expires_at = now() + duration_days).
-- Otherwise it is queued with both null, and lock_current_membership starts
-- it lazily at the member's first registration once it becomes current.
--
-- The "has a live membership" check deliberately does NOT call
-- lock_current_membership: that function starts a queued membership's clock
-- as a side effect, and a grant must not start anyone's clock but its own.
-- A queued (never started) membership with quota left counts as live, so a
-- grant behind it queues too.
--
-- Concurrency: two grants for the same user serialise on a per-user advisory
-- xact lock (key 'membership_grant:<user id>'), so both cannot see "no live
-- membership" and both start immediately. No registration path takes this
-- lock, so the documented lock order (session advisory lock, then membership
-- rows) is unchanged. A registration racing a grant cannot create a
-- membership, only consume or start one, so the grant's decision stays
-- correct: at worst a membership it queued becomes current at the next
-- registration, exactly as a queued one should.

-- ---- admin_grant_membership ----

create function public.admin_grant_membership(
  p_user_id uuid,
  p_plan_id uuid,
  p_payment_received_at timestamptz,
  p_price_idr int default null,
  p_quota int default null,
  p_duration_days int default null
)
returns public.memberships
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.membership_plans;
  v_has_live boolean;
  v_duration int;
  v_row public.memberships;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'admin_grant_membership requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  select * into v_plan
    from public.membership_plans
   where id = p_plan_id and is_active;

  if not found then
    raise exception 'membership plan not found or inactive' using errcode = 'JB017';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user not found' using errcode = 'JB017';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership_grant:' || p_user_id::text, 0));

  -- Non-mutating: same liveness rule as lock_current_membership, no lock,
  -- no lazy start.
  select exists (
    select 1
      from public.memberships m
     where m.user_id = p_user_id
       and m.cancelled_at is null
       and (m.started_at is null or m.expires_at > now())
       and public.membership_quota_left(m.id) > 0
  ) into v_has_live;

  v_duration := coalesce(p_duration_days, v_plan.duration_days);

  insert into public.memberships
    (user_id, plan_id, price_idr, quota_total, duration_days, refund_cutoff_hours,
     payment_received_at, activated_by, started_at, expires_at)
  values
    (p_user_id, v_plan.id,
     coalesce(p_price_idr, v_plan.price_idr),
     coalesce(p_quota, v_plan.quota),
     v_duration,
     v_plan.refund_cutoff_hours,
     p_payment_received_at,
     auth.uid(),
     case when v_has_live then null else now() end,
     case when v_has_live then null else now() + v_duration * interval '1 day' end)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function
  public.admin_grant_membership(uuid, uuid, timestamptz, int, int, int)
  from public, anon;
grant execute on function
  public.admin_grant_membership(uuid, uuid, timestamptz, int, int, int)
  to authenticated;

-- ---- admin_cancel_membership ----
-- Sets cancelled_at. Usages already consumed stay as they are (the premium
-- registrations they paid for are not undone); lock_current_membership skips
-- a cancelled membership from the next registration on. The row lock makes
-- two concurrent cancels serialise: the loser re-reads cancelled_at and gets
-- JB018.

create function public.admin_cancel_membership(p_membership_id uuid)
returns public.memberships
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.memberships;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'admin_cancel_membership requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  select * into v_row
    from public.memberships
   where id = p_membership_id
     for update;

  if not found then
    raise exception 'membership not found' using errcode = 'JB017';
  end if;

  if v_row.cancelled_at is not null then
    raise exception 'membership already cancelled' using errcode = 'JB018';
  end if;

  update public.memberships
     set cancelled_at = now()
   where id = p_membership_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.admin_cancel_membership(uuid) from public, anon;
grant execute on function public.admin_cancel_membership(uuid) to authenticated;
