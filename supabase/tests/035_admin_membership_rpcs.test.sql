-- Covers migration 20261023000006_admin_membership_rpcs.sql:
-- admin_grant_membership (plan copy, overrides, the duration-clock rule from
-- spec section 3, authorization, JB018) and admin_cancel_membership
-- (cancelled_at, usages kept, JB018, JB019).
--
-- now() is the transaction start time and stays fixed for the whole pgTAP
-- transaction, so started_at / expires_at / cancelled_at are compared exactly.
--
-- Setup runs as the superuser; RPC calls switch to `authenticated` with a
-- JWT, and assertions `reset role` first so RLS does not hide rows.

begin;
select plan(46);

insert into auth.users (id, email) values
  ('00000001-0035-0035-0035-000000000000', 'admin-035@test.local'),
  ('00000002-0035-0035-0035-000000000000', 'host-035@test.local'),
  ('00000003-0035-0035-0035-000000000000', 'fresh-035@test.local'),
  ('00000004-0035-0035-0035-000000000000', 'live-035@test.local'),
  ('00000005-0035-0035-0035-000000000000', 'queued-035@test.local'),
  ('00000006-0035-0035-0035-000000000000', 'dead-035@test.local'),
  ('00000007-0035-0035-0035-000000000000', 'override-035@test.local'),
  ('00000008-0035-0035-0035-000000000000', 'cancel-035@test.local'),
  ('00000009-0035-0035-0035-000000000000', 'member-035@test.local');

update public.profiles set role = 'admin'
 where id = '00000001-0035-0035-0035-000000000000';
update public.profiles set role = 'host'
 where id = '00000002-0035-0035-0035-000000000000';

-- P: active plan with a non-default cutoff, so the copy is observable.
-- Q: inactive plan.
insert into public.membership_plans
  (id, name, price_idr, quota, duration_days, refund_cutoff_hours, is_active)
values
  ('c3500001-0000-0000-0000-000000000000', 'Plan P', 500000, 8, 60, 12, true),
  ('c3500002-0000-0000-0000-000000000000', 'Plan Q', 300000, 4, 30, 24, false);

-- User 4: one live membership (started, unexpired, quota left).
-- User 5: one queued membership (never started, quota left).
-- User 6: only dead memberships: expired, cancelled, out of quota.
-- User 8: a live membership with one consumed usage, to be cancelled.
insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at, cancelled_at)
values
  ('e3500004-0000-0000-0000-000000000000', '00000004-0035-0035-0035-000000000000',
   0, 5, 30, now() - interval '1 day', now() + interval '29 days', null),
  ('e3500005-0000-0000-0000-000000000000', '00000005-0035-0035-0035-000000000000',
   0, 5, 30, null, null, null),
  ('e3500061-0000-0000-0000-000000000000', '00000006-0035-0035-0035-000000000000',
   0, 5, 30, now() - interval '31 days', now() - interval '1 day', null),
  ('e3500062-0000-0000-0000-000000000000', '00000006-0035-0035-0035-000000000000',
   0, 5, 30, now() - interval '1 day', now() + interval '29 days', now() - interval '1 hour'),
  ('e3500063-0000-0000-0000-000000000000', '00000006-0035-0035-0035-000000000000',
   0, 1, 30, now() - interval '1 day', now() + interval '29 days', null),
  ('e3500008-0000-0000-0000-000000000000', '00000008-0035-0035-0035-000000000000',
   0, 5, 30, now() - interval '1 day', now() + interval '29 days', null);

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a3500001-0000-0000-0000-000000000000', 'Session 035',
   now() + interval '3 days', now() + interval '3 days 2 hours', 'GOR',
   8, '00000002-0035-0035-0035-000000000000', 'scheduled');

insert into public.participants
  (id, session_id, user_id, status, is_premium, membership_id)
values
  ('b3500063-0000-0000-0000-000000000000', 'a3500001-0000-0000-0000-000000000000',
   '00000006-0035-0035-0035-000000000000', 'confirmed', true,
   'e3500063-0000-0000-0000-000000000000'),
  ('b3500008-0000-0000-0000-000000000000', 'a3500001-0000-0000-0000-000000000000',
   '00000008-0035-0035-0035-000000000000', 'confirmed', true,
   'e3500008-0000-0000-0000-000000000000'),
  ('b3500009-0000-0000-0000-000000000000', 'a3500001-0000-0000-0000-000000000000',
   '00000009-0035-0035-0035-000000000000', 'confirmed', false, null);

-- User 6's single-unit membership is used up; user 8 has one live usage.
insert into public.membership_usages (id, membership_id, participant_id)
values
  ('d3500063-0000-0000-0000-000000000000', 'e3500063-0000-0000-0000-000000000000',
   'b3500063-0000-0000-0000-000000000000'),
  ('d3500008-0000-0000-0000-000000000000', 'e3500008-0000-0000-0000-000000000000',
   'b3500008-0000-0000-0000-000000000000');

-- ---------------------------------------------------------------------
-- grant surface (positive half; 036 pins the negatives)
-- ---------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated',
    'public.admin_grant_membership(uuid, uuid, timestamptz, integer, integer, integer)', 'EXECUTE'),
  'authenticated has EXECUTE on admin_grant_membership'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_cancel_membership(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on admin_cancel_membership'
);

-- ---------------------------------------------------------------------
-- admin grants
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0035-0035-0035-000000000000","role":"authenticated"}';

-- admin_grant_copies_plan_values / grant_starts_immediately_when_no_live_membership
select is(
  (select user_id from public.admin_grant_membership(
     '00000003-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000',
     '2026-10-20 10:00:00+00')),
  '00000003-0035-0035-0035-000000000000'::uuid,
  'admin_grant_membership returns the new membership row'
);

-- grant_queues_when_live_membership_exists
select public.admin_grant_membership(
  '00000004-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) is not null
  as granted;

-- queued-and-unstarted counts as live: the new one queues behind it
select public.admin_grant_membership(
  '00000005-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) is not null
  as granted;

-- expired, cancelled and exhausted memberships are not live
select public.admin_grant_membership(
  '00000006-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) is not null
  as granted;

-- admin_grant_overrides_win
select public.admin_grant_membership(
  '00000007-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', null,
  p_price_idr => 0, p_quota => 3, p_duration_days => 10) is not null
  as granted;

reset role;

-- ---- admin_grant_copies_plan_values ----

select results_eq(
  $$ select plan_id, price_idr, quota_total, duration_days, refund_cutoff_hours,
            payment_received_at, activated_by, cancelled_at
       from public.memberships
      where user_id = '00000003-0035-0035-0035-000000000000' $$,
  $$ values ('c3500001-0000-0000-0000-000000000000'::uuid, 500000, 8, 60, 12,
             '2026-10-20 10:00:00+00'::timestamptz,
             '00000001-0035-0035-0035-000000000000'::uuid, null::timestamptz) $$,
  'grant copies price, quota, duration and refund cutoff from the plan and records activated_by'
);

-- ---- grant_starts_immediately_when_no_live_membership ----

select is(
  (select started_at from public.memberships
    where user_id = '00000003-0035-0035-0035-000000000000'),
  now(),
  'first membership starts at grant time'
);
select is(
  (select expires_at from public.memberships
    where user_id = '00000003-0035-0035-0035-000000000000'),
  now() + interval '60 days',
  'first membership expires duration_days after grant'
);

select is(
  (select started_at from public.memberships
    where user_id = '00000006-0035-0035-0035-000000000000'
      and plan_id = 'c3500001-0000-0000-0000-000000000000'),
  now(),
  'expired, cancelled and exhausted memberships do not block an immediate start'
);
select is(
  (select expires_at from public.memberships
    where user_id = '00000006-0035-0035-0035-000000000000'
      and plan_id = 'c3500001-0000-0000-0000-000000000000'),
  now() + interval '60 days',
  'membership granted after only dead ones expires duration_days after grant'
);

-- ---- grant_queues_when_live_membership_exists ----

select is(
  (select started_at from public.memberships
    where user_id = '00000004-0035-0035-0035-000000000000'
      and plan_id = 'c3500001-0000-0000-0000-000000000000'),
  null,
  'grant while a live membership exists leaves started_at null (queued)'
);
select is(
  (select expires_at from public.memberships
    where user_id = '00000004-0035-0035-0035-000000000000'
      and plan_id = 'c3500001-0000-0000-0000-000000000000'),
  null,
  'grant while a live membership exists leaves expires_at null (queued)'
);
select results_eq(
  $$ select started_at, expires_at from public.memberships
      where id = 'e3500004-0000-0000-0000-000000000000' $$,
  $$ values (now() - interval '1 day', now() + interval '29 days') $$,
  'the live membership is untouched by the queued grant'
);

-- ---- grant does not start a queued membership's clock ----

select is(
  (select started_at from public.memberships
    where id = 'e3500005-0000-0000-0000-000000000000'),
  null,
  'granting while the only other membership is queued leaves its started_at null'
);
select is(
  (select expires_at from public.memberships
    where id = 'e3500005-0000-0000-0000-000000000000'),
  null,
  'granting while the only other membership is queued leaves its expires_at null'
);
select is(
  (select started_at from public.memberships
    where user_id = '00000005-0035-0035-0035-000000000000'
      and plan_id = 'c3500001-0000-0000-0000-000000000000'),
  null,
  'a grant behind a queued membership is itself queued'
);

-- ---- admin_grant_overrides_win ----

select results_eq(
  $$ select price_idr, quota_total, duration_days, refund_cutoff_hours,
            payment_received_at, expires_at
       from public.memberships
      where user_id = '00000007-0035-0035-0035-000000000000' $$,
  $$ values (0, 3, 10, 12, null::timestamptz, now() + interval '10 days') $$,
  'price, quota and duration overrides win; cutoff still comes from the plan'
);

-- ---- editing_plan_after_grant_does_not_change_membership ----

update public.membership_plans
   set price_idr = 1, quota = 99, duration_days = 1, refund_cutoff_hours = 0
 where id = 'c3500001-0000-0000-0000-000000000000';

select results_eq(
  $$ select price_idr, quota_total, duration_days, refund_cutoff_hours, expires_at
       from public.memberships
      where user_id = '00000003-0035-0035-0035-000000000000' $$,
  $$ values (500000, 8, 60, 12, now() + interval '60 days') $$,
  'editing the plan after a grant leaves the membership values unchanged'
);

-- ---------------------------------------------------------------------
-- JB018 on grant
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0035-0035-0035-000000000000","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_grant_membership(
       '00000009-0035-0035-0035-000000000000', 'c3500002-0000-0000-0000-000000000000', now()) $$,
  'JB018', null,
  'grant with an inactive plan gets JB018'
);
select throws_ok(
  $$ select public.admin_grant_membership(
       '00000009-0035-0035-0035-000000000000', 'c35000ff-0000-0000-0000-000000000000', now()) $$,
  'JB018', null,
  'grant with an unknown plan gets JB018'
);
select throws_ok(
  $$ select public.admin_grant_membership(
       '000000ff-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) $$,
  'JB018', null,
  'grant to a missing user gets JB018'
);
select throws_ok(
  $$ select public.admin_grant_membership(
       '00000009-0035-0035-0035-000000000000', null, now()) $$,
  'JB018', null,
  'grant with a null plan gets JB018'
);

-- ---------------------------------------------------------------------
-- admin cancel
-- ---------------------------------------------------------------------

select is(
  (select cancelled_at from public.admin_cancel_membership('e3500008-0000-0000-0000-000000000000')),
  now(),
  'admin_cancel_membership returns the row with cancelled_at set'
);

select throws_ok(
  $$ select public.admin_cancel_membership('e3500008-0000-0000-0000-000000000000') $$,
  'JB019', null,
  'cancelling an already-cancelled membership gets JB019'
);
select throws_ok(
  $$ select public.admin_cancel_membership('e35000ff-0000-0000-0000-000000000000') $$,
  'JB018', null,
  'cancelling an unknown membership gets JB018'
);
select throws_ok(
  $$ select public.admin_cancel_membership(null) $$,
  'JB018', null,
  'cancelling a null membership id gets JB018'
);

reset role;

select is(
  (select cancelled_at from public.memberships where id = 'e3500008-0000-0000-0000-000000000000'),
  now(),
  'cancel sets cancelled_at'
);
select results_eq(
  $$ select started_at, expires_at, quota_total from public.memberships
      where id = 'e3500008-0000-0000-0000-000000000000' $$,
  $$ values (now() - interval '1 day', now() + interval '29 days', 5) $$,
  'cancel leaves the rest of the membership row unchanged'
);
select results_eq(
  $$ select id, refunded_at from public.membership_usages
      where membership_id = 'e3500008-0000-0000-0000-000000000000' $$,
  $$ values ('d3500008-0000-0000-0000-000000000000'::uuid, null::timestamptz) $$,
  'cancel keeps existing usages, unrefunded'
);
select results_eq(
  $$ select is_premium, membership_id from public.participants
      where id = 'b3500008-0000-0000-0000-000000000000' $$,
  $$ values (true, 'e3500008-0000-0000-0000-000000000000'::uuid) $$,
  'cancel leaves the premium registration it paid for in place'
);

-- a cancelled membership no longer blocks an immediate start
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0035-0035-0035-000000000000","role":"authenticated"}';

select is(
  (select started_at from public.admin_grant_membership(
     '00000008-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now())),
  now(),
  'a grant after the only live membership was cancelled starts immediately'
);

-- ---------------------------------------------------------------------
-- non_admin_and_host_get_JB007
-- ---------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000009-0035-0035-0035-000000000000","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_grant_membership(
       '00000009-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) $$,
  'JB007', null,
  'a member granting gets JB007'
);
select throws_ok(
  $$ select public.admin_cancel_membership('e3500004-0000-0000-0000-000000000000') $$,
  'JB007', null,
  'a member cancelling gets JB007'
);
select throws_ok(
  $$ select public.admin_grant_membership(
       '00000009-0035-0035-0035-000000000000', 'c35000ff-0000-0000-0000-000000000000', now()) $$,
  'JB007', null,
  'a member granting an unknown plan gets JB007, not JB018'
);
select throws_ok(
  $$ select public.admin_cancel_membership('e35000ff-0000-0000-0000-000000000000') $$,
  'JB007', null,
  'a member cancelling an unknown membership gets JB007, not JB018'
);

set local request.jwt.claims = '{"sub":"00000002-0035-0035-0035-000000000000","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_grant_membership(
       '00000002-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) $$,
  'JB007', null,
  'a host granting gets JB007'
);
select throws_ok(
  $$ select public.admin_cancel_membership('e3500004-0000-0000-0000-000000000000') $$,
  'JB007', null,
  'a host cancelling gets JB007'
);

-- ---------------------------------------------------------------------
-- anon_gets_JB004: an authenticated-role caller without claims
-- ---------------------------------------------------------------------

set local request.jwt.claims = '';

select throws_ok(
  $$ select public.admin_grant_membership(
       '00000009-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) $$,
  'JB004', null,
  'a caller without claims granting gets JB004'
);
select throws_ok(
  $$ select public.admin_cancel_membership('e3500004-0000-0000-0000-000000000000') $$,
  'JB004', null,
  'a caller without claims cancelling gets JB004'
);

-- the real anon role has no EXECUTE at all
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select public.admin_grant_membership(
       '00000009-0035-0035-0035-000000000000', 'c3500001-0000-0000-0000-000000000000', now()) $$,
  '42501', null,
  'anon granting is refused by the missing EXECUTE grant'
);
select throws_ok(
  $$ select public.admin_cancel_membership('e3500004-0000-0000-0000-000000000000') $$,
  '42501', null,
  'anon cancelling is refused by the missing EXECUTE grant'
);

reset role;

-- ---------------------------------------------------------------------
-- nothing the refused calls did leaked into the table
-- ---------------------------------------------------------------------

select is(
  (select count(*)::int from public.memberships
    where user_id in ('00000002-0035-0035-0035-000000000000',
                      '00000009-0035-0035-0035-000000000000')),
  0,
  'refused grants created no memberships'
);
select is(
  (select cancelled_at from public.memberships where id = 'e3500004-0000-0000-0000-000000000000'),
  null,
  'refused cancels left the membership uncancelled'
);
select is(
  (select count(*)::int from public.memberships
    where user_id = '00000004-0035-0035-0035-000000000000'),
  2,
  'user with a live membership holds the original plus one queued grant'
);
select is(
  (select count(*)::int from public.memberships
    where user_id = '00000005-0035-0035-0035-000000000000'),
  2,
  'user with a queued membership holds it plus one queued grant'
);
select is(
  (select count(*)::int from public.memberships
    where user_id = '00000008-0035-0035-0035-000000000000'),
  2,
  'user with a cancelled membership holds it plus one new grant'
);
select is(
  (select count(*)::int from public.memberships
    where user_id = '00000008-0035-0035-0035-000000000000' and cancelled_at is null),
  1,
  'only the new grant is uncancelled'
);
select is(
  (select count(*)::int from public.memberships
    where user_id = '00000006-0035-0035-0035-000000000000'
      and cancelled_at is null and started_at = now()),
  1,
  'dead memberships are not restarted by the grant'
);

select * from finish();
rollback;
