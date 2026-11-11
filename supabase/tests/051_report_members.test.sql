-- Covers 20261104000003_report_members.sql: admin-only per-member membership
-- and attendance report; active-membership rule, quota usage excluding
-- refunds, one row per profile, Asia/Jakarta range, 'Unnamed member'.

begin;
select plan(16);

insert into auth.users (id, email) values
  ('a5100000-0000-0000-0000-000000000001', 'rm-admin@test.local'),
  ('a5100000-0000-0000-0000-000000000002', 'rm-host@test.local'),
  ('a5100000-0000-0000-0000-000000000003', 'rm-active@test.local'),
  ('a5100000-0000-0000-0000-000000000004', 'rm-expired@test.local'),
  ('a5100000-0000-0000-0000-000000000005', 'rm-queued@test.local'),
  ('a5100000-0000-0000-0000-000000000006', 'rm-cancelled@test.local'),
  ('a5100000-0000-0000-0000-000000000007', 'rm-none@test.local'),
  ('a5100000-0000-0000-0000-000000000008', 'rm-noname@test.local'),
  ('a5100000-0000-0000-0000-000000000009', 'rm-blank@test.local');

update public.profiles set role = 'admin' where id = 'a5100000-0000-0000-0000-000000000001';
update public.profiles set role = 'host'  where id = 'a5100000-0000-0000-0000-000000000002';
update public.profiles set full_name = 'Active Amy'    where id = 'a5100000-0000-0000-0000-000000000003';
update public.profiles set full_name = 'Expired Ed'    where id = 'a5100000-0000-0000-0000-000000000004';
update public.profiles set full_name = 'Queued Quinn'  where id = 'a5100000-0000-0000-0000-000000000005';
update public.profiles set full_name = 'Cancelled Cy'  where id = 'a5100000-0000-0000-0000-000000000006';
update public.profiles set full_name = 'None Nina'     where id = 'a5100000-0000-0000-0000-000000000007';
update public.profiles set full_name = null            where id = 'a5100000-0000-0000-0000-000000000008';
update public.profiles set full_name = '   '           where id = 'a5100000-0000-0000-0000-000000000009';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a5100000-1111-0000-0000-000000000001', 'S1', '2026-11-10 19:00+07', '2026-11-10 21:00+07', 'GOR', 20, 'a5100000-0000-0000-0000-000000000002', 'completed'),
  ('a5100000-1111-0000-0000-000000000002', 'S2', '2026-11-11 19:00+07', '2026-11-11 21:00+07', 'GOR', 20, 'a5100000-0000-0000-0000-000000000002', 'completed'),
  ('a5100000-1111-0000-0000-000000000003', 'S3', '2026-11-12 19:00+07', '2026-11-12 21:00+07', 'GOR', 20, 'a5100000-0000-0000-0000-000000000002', 'completed'),
  ('a5100000-1111-0000-0000-000000000004', 'S4', '2026-11-13 19:00+07', '2026-11-13 21:00+07', 'GOR', 20, 'a5100000-0000-0000-0000-000000000002', 'completed'),
  ('a5100000-1111-0000-0000-000000000005', 'Out of range', '2026-10-05 19:00+07', '2026-10-05 21:00+07', 'GOR', 20, 'a5100000-0000-0000-0000-000000000002', 'completed'),
  ('a5100000-1111-0000-0000-000000000006', 'Cancelled', '2026-11-14 19:00+07', '2026-11-14 21:00+07', 'GOR', 20, 'a5100000-0000-0000-0000-000000000002', 'cancelled'),
  ('a5100000-1111-0000-0000-000000000007', 'Next day', '2026-12-01 00:30+07', '2026-12-01 02:00+07', 'GOR', 20, 'a5100000-0000-0000-0000-000000000002', 'completed');

-- Amy: S1 attended (usage), S2 + S3 plain (usage), S4 (refunded usage), S5 out of range attended
-- Nina (no membership): S1 + S2 attended, cancelled-session and next-day rows ignored
insert into public.participants (id, session_id, user_id, status, checked_in_at) values
  ('a5100000-2222-0000-0000-000000000001', 'a5100000-1111-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000003', 'confirmed', '2026-11-10 19:05+07'),
  ('a5100000-2222-0000-0000-000000000002', 'a5100000-1111-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000003', 'confirmed', null),
  ('a5100000-2222-0000-0000-000000000003', 'a5100000-1111-0000-0000-000000000003', 'a5100000-0000-0000-0000-000000000003', 'confirmed', null),
  ('a5100000-2222-0000-0000-000000000004', 'a5100000-1111-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000003', 'confirmed', null),
  ('a5100000-2222-0000-0000-000000000005', 'a5100000-1111-0000-0000-000000000005', 'a5100000-0000-0000-0000-000000000003', 'confirmed', '2026-10-05 19:05+07'),
  ('a5100000-2222-0000-0000-000000000006', 'a5100000-1111-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000007', 'confirmed', '2026-11-10 19:05+07'),
  ('a5100000-2222-0000-0000-000000000007', 'a5100000-1111-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000007', 'confirmed', '2026-11-11 19:05+07'),
  ('a5100000-2222-0000-0000-000000000008', 'a5100000-1111-0000-0000-000000000006', 'a5100000-0000-0000-0000-000000000007', 'confirmed', '2026-11-14 19:05+07'),
  ('a5100000-2222-0000-0000-000000000009', 'a5100000-1111-0000-0000-000000000007', 'a5100000-0000-0000-0000-000000000007', 'confirmed', '2026-12-01 00:35+07'),
  -- checked in but cancelled status: not attendance
  ('a5100000-2222-0000-0000-00000000000a', 'a5100000-1111-0000-0000-000000000003', 'a5100000-0000-0000-0000-000000000007', 'cancelled', '2026-11-12 19:05+07');

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at, cancelled_at)
values
  ('a5100000-3333-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000003', 150000, 8, 60, now() - interval '10 days', now() + interval '50 days', null),
  ('a5100000-3333-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000004', 150000, 8, 60, now() - interval '70 days', now() - interval '10 days', null),
  ('a5100000-3333-0000-0000-000000000003', 'a5100000-0000-0000-0000-000000000005', 150000, 8, 60, null, null, null),
  ('a5100000-3333-0000-0000-000000000004', 'a5100000-0000-0000-0000-000000000006', 150000, 8, 60, now() - interval '10 days', now() + interval '50 days', now() - interval '1 day');

insert into public.membership_usages (membership_id, participant_id, refunded_at) values
  ('a5100000-3333-0000-0000-000000000001', 'a5100000-2222-0000-0000-000000000001', null),
  ('a5100000-3333-0000-0000-000000000001', 'a5100000-2222-0000-0000-000000000002', null),
  ('a5100000-3333-0000-0000-000000000001', 'a5100000-2222-0000-0000-000000000003', null),
  ('a5100000-3333-0000-0000-000000000001', 'a5100000-2222-0000-0000-000000000004', '2026-11-13 10:00+07');

set local role authenticated;

set local request.jwt.claims = '{"sub":"a5100000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_members('2026-11-01', '2026-11-30')$$,
  '42501', 'forbidden', 'member is denied');

set local request.jwt.claims = '{"sub":"a5100000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_members('2026-11-01', '2026-11-30')$$,
  '42501', 'forbidden', 'host is denied');

set local request.jwt.claims = '{"sub":"a5100000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select * from public.report_members('2026-11-01', '2026-11-30')$$,
  'admin can run the report');

select results_eq(
  $$select full_name, plan_price_idr, quota_total, quota_used, quota_left,
           has_active_membership, attended_count
      from public.report_members('2026-11-01', '2026-11-30')
     where member_id = 'a5100000-0000-0000-0000-000000000003'$$,
  $$values ('Active Amy'::text, 150000, 8, 3, 5, true, 1)$$,
  'active member: 3 live usages, 1 refunded ignored, left 5, attended 1 in range');

select ok(
  (select started_at is not null and expires_at > now()
     from public.report_members('2026-11-01', '2026-11-30')
    where member_id = 'a5100000-0000-0000-0000-000000000003'),
  'active member has started_at and a future expires_at');

select results_eq(
  $$select plan_price_idr, quota_total, quota_used, quota_left, started_at,
           expires_at, has_active_membership
      from public.report_members('2026-11-01', '2026-11-30')
     where member_id = 'a5100000-0000-0000-0000-000000000004'$$,
  $$values (null::int, null::int, null::int, null::int, null::timestamptz,
            null::timestamptz, false)$$,
  'expired membership: plan columns null, inactive');

select results_eq(
  $$select plan_price_idr, quota_total, started_at, has_active_membership
      from public.report_members('2026-11-01', '2026-11-30')
     where member_id = 'a5100000-0000-0000-0000-000000000005'$$,
  $$values (null::int, null::int, null::timestamptz, false)$$,
  'queued membership (null started_at) is ignored');

select results_eq(
  $$select plan_price_idr, quota_total, has_active_membership
      from public.report_members('2026-11-01', '2026-11-30')
     where member_id = 'a5100000-0000-0000-0000-000000000006'$$,
  $$values (null::int, null::int, false)$$,
  'cancelled membership is ignored');

select results_eq(
  $$select full_name, has_active_membership, attended_count
      from public.report_members('2026-11-01', '2026-11-30')
     where member_id = 'a5100000-0000-0000-0000-000000000007'$$,
  $$values ('None Nina'::text, false, 2)$$,
  'member without membership is listed; cancelled-session, next-day and cancelled-status rows not counted');

select is(
  (select attended_count from public.report_members('2026-10-01', '2026-10-31')
    where member_id = 'a5100000-0000-0000-0000-000000000003'),
  1, 'October range counts only the October attendance');

select is(
  (select attended_count from public.report_members('2026-12-01', '2026-12-01')
    where member_id = 'a5100000-0000-0000-0000-000000000007'),
  1, '00:30 Jakarta on p_to counts as that day');

select is(
  (select full_name from public.report_members('2026-11-01', '2026-11-30')
    where member_id = 'a5100000-0000-0000-0000-000000000008'),
  'Unnamed member', 'null full_name -> Unnamed member');

select is(
  (select full_name from public.report_members('2026-11-01', '2026-11-30')
    where member_id = 'a5100000-0000-0000-0000-000000000009'),
  'Unnamed member', 'blank full_name -> Unnamed member');

select is(
  (select count(*)::int from public.report_members('2026-11-01', '2026-11-30')
    where member_id = 'a5100000-0000-0000-0000-000000000003'),
  1, 'one row per profile (no fan-out from usages)');

select is(
  (select string_agg(full_name, ',' order by rn)
     from (select full_name, row_number() over () as rn
             from public.report_members('2026-11-01', '2026-11-30')
            where member_id in (
              'a5100000-0000-0000-0000-000000000003',
              'a5100000-0000-0000-0000-000000000004',
              'a5100000-0000-0000-0000-000000000007')) q),
  'None Nina,Active Amy,Expired Ed',
  'ordered by attended_count desc, then full_name');

reset role;
set local role anon;
select throws_ok(
  $$select * from public.report_members('2026-11-01', '2026-11-30')$$,
  '42501', null, 'anon cannot execute');

select * from finish();
rollback;
