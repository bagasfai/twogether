-- Covers 20261104000001_report_attendance.sql: admin-only per-member attendance
-- report, Asia/Jakarta date boundaries, guest/cancelled/draft exclusion.

begin;
select plan(15);

insert into auth.users (id, email) values
  ('a4900000-0000-0000-0000-000000000001', 'ra-admin@test.local'),
  ('a4900000-0000-0000-0000-000000000002', 'ra-host@test.local'),
  ('a4900000-0000-0000-0000-000000000003', 'ra-alice@test.local'),
  ('a4900000-0000-0000-0000-000000000004', 'ra-cancelonly@test.local'),
  ('a4900000-0000-0000-0000-000000000005', 'ra-noname@test.local'),
  ('a4900000-0000-0000-0000-000000000006', 'ra-hidden@test.local'),
  ('a4900000-0000-0000-0000-000000000007', 'ra-edge-from@test.local'),
  ('a4900000-0000-0000-0000-000000000008', 'ra-edge-to@test.local'),
  ('a4900000-0000-0000-0000-000000000009', 'ra-edge-after@test.local'),
  ('a4900000-0000-0000-0000-00000000000a', 'ra-recent@test.local'),
  ('a4900000-0000-0000-0000-00000000000b', 'ra-old@test.local');

update public.profiles set role = 'admin' where id = 'a4900000-0000-0000-0000-000000000001';
update public.profiles set role = 'host'  where id = 'a4900000-0000-0000-0000-000000000002';
update public.profiles set full_name = 'Alice Attendance' where id = 'a4900000-0000-0000-0000-000000000003';
update public.profiles set full_name = 'Cancel Only'      where id = 'a4900000-0000-0000-0000-000000000004';
update public.profiles set full_name = null               where id = 'a4900000-0000-0000-0000-000000000005';
update public.profiles set full_name = 'Hidden Person'    where id = 'a4900000-0000-0000-0000-000000000006';
update public.profiles set full_name = 'Edge From'        where id = 'a4900000-0000-0000-0000-000000000007';
update public.profiles set full_name = 'Edge To'          where id = 'a4900000-0000-0000-0000-000000000008';
update public.profiles set full_name = 'Edge After'       where id = 'a4900000-0000-0000-0000-000000000009';
update public.profiles set full_name = 'Recent Person'    where id = 'a4900000-0000-0000-0000-00000000000a';
update public.profiles set full_name = 'Old Person'       where id = 'a4900000-0000-0000-0000-00000000000b';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a4900000-1111-0000-0000-000000000001', 'S1', '2026-11-10 19:00+07', '2026-11-10 21:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-000000000002', 'S2', '2026-11-11 19:00+07', '2026-11-11 21:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-000000000003', 'S3', '2026-11-12 19:00+07', '2026-11-12 21:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-000000000004', 'S4', '2026-11-13 19:00+07', '2026-11-13 21:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-000000000005', 'Cancelled', '2026-11-14 19:00+07', '2026-11-14 21:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'cancelled'),
  ('a4900000-1111-0000-0000-000000000006', 'Draft', '2026-11-15 19:00+07', '2026-11-15 21:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'draft'),
  ('a4900000-1111-0000-0000-000000000007', 'Edge from', '2026-11-01 00:30+07', '2026-11-01 02:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-000000000008', 'Edge to', '2026-11-30 23:30+07', '2026-12-01 01:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-000000000009', 'Edge after', '2026-12-01 00:30+07', '2026-12-01 02:00+07', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-00000000000a', 'Recent', now() - interval '5 days', now() - interval '5 days' + interval '2 hours', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed'),
  ('a4900000-1111-0000-0000-00000000000b', 'Old', now() - interval '40 days', now() - interval '40 days' + interval '2 hours', 'GOR', 10, 'a4900000-0000-0000-0000-000000000002', 'completed');

-- Alice: S1 checked in, S2 no-show, S3 plain, S4 cancelled; cancelled-session row must not count
insert into public.participants (session_id, user_id, status, checked_in_at, no_show_at) values
  ('a4900000-1111-0000-0000-000000000001', 'a4900000-0000-0000-0000-000000000003', 'confirmed', '2026-11-10 19:05+07', null),
  ('a4900000-1111-0000-0000-000000000002', 'a4900000-0000-0000-0000-000000000003', 'confirmed', null, '2026-11-11 21:00+07'),
  ('a4900000-1111-0000-0000-000000000003', 'a4900000-0000-0000-0000-000000000003', 'confirmed', null, null),
  ('a4900000-1111-0000-0000-000000000004', 'a4900000-0000-0000-0000-000000000003', 'cancelled', null, null),
  ('a4900000-1111-0000-0000-000000000005', 'a4900000-0000-0000-0000-000000000003', 'confirmed', '2026-11-14 19:05+07', null),
  -- cancel-only member
  ('a4900000-1111-0000-0000-000000000001', 'a4900000-0000-0000-0000-000000000004', 'cancelled', null, null),
  -- null full_name
  ('a4900000-1111-0000-0000-000000000001', 'a4900000-0000-0000-0000-000000000005', 'confirmed', null, null),
  -- only in cancelled + draft sessions
  ('a4900000-1111-0000-0000-000000000005', 'a4900000-0000-0000-0000-000000000006', 'confirmed', '2026-11-14 19:05+07', null),
  ('a4900000-1111-0000-0000-000000000006', 'a4900000-0000-0000-0000-000000000006', 'confirmed', null, null),
  -- boundaries
  ('a4900000-1111-0000-0000-000000000007', 'a4900000-0000-0000-0000-000000000007', 'confirmed', null, null),
  ('a4900000-1111-0000-0000-000000000008', 'a4900000-0000-0000-0000-000000000008', 'confirmed', null, null),
  ('a4900000-1111-0000-0000-000000000009', 'a4900000-0000-0000-0000-000000000009', 'confirmed', null, null),
  -- relative window
  ('a4900000-1111-0000-0000-00000000000a', 'a4900000-0000-0000-0000-00000000000a', 'confirmed', null, null),
  ('a4900000-1111-0000-0000-00000000000b', 'a4900000-0000-0000-0000-00000000000b', 'confirmed', null, null);

-- guest row
insert into public.participants (session_id, guest_name, status) values
  ('a4900000-1111-0000-0000-000000000001', 'Guest Gary', 'confirmed');

set local role authenticated;

-- member denied
set local request.jwt.claims = '{"sub":"a4900000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_attendance('2026-11-01', '2026-11-30')$$,
  '42501', 'forbidden', 'member is denied');

-- host denied
set local request.jwt.claims = '{"sub":"a4900000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_attendance('2026-11-01', '2026-11-30')$$,
  '42501', 'forbidden', 'host is denied');

-- admin allowed
set local request.jwt.claims = '{"sub":"a4900000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select * from public.report_attendance('2026-11-01', '2026-11-30')$$,
  'admin can run the report');

select results_eq(
  $$select registered_count, attended_count, no_show_count, cancelled_count, attendance_rate
      from public.report_attendance('2026-11-01', '2026-11-30')
     where member_id = 'a4900000-0000-0000-0000-000000000003'$$,
  $$values (3, 1, 1, 1, 33.3::numeric)$$,
  'counts and rate for a mixed member; cancelled-session row ignored');

select results_eq(
  $$select registered_count, cancelled_count, attendance_rate is null
      from public.report_attendance('2026-11-01', '2026-11-30')
     where member_id = 'a4900000-0000-0000-0000-000000000004'$$,
  $$values (0, 1, true)$$,
  'cancelled-only member has null attendance_rate');

select is(
  (select count(*)::int from public.report_attendance('2026-11-01', '2026-11-30')
    where member_id is null or full_name = 'Guest Gary'),
  0, 'guest participants never appear');

select is(
  (select count(*)::int from public.report_attendance('2026-11-01', '2026-11-30')
    where member_id = 'a4900000-0000-0000-0000-000000000006'),
  0, 'cancelled and draft sessions contribute nothing');

select is(
  (select full_name from public.report_attendance('2026-11-01', '2026-11-30')
    where member_id = 'a4900000-0000-0000-0000-000000000005'),
  'Unnamed member', 'null full_name is shown as Unnamed member');

select is(
  (select count(*)::int from public.report_attendance('2026-11-01', '2026-11-30')
    where member_id = 'a4900000-0000-0000-0000-000000000007'),
  1, '00:30 Jakarta on p_from is included');

select is(
  (select count(*)::int from public.report_attendance('2026-11-01', '2026-11-30')
    where member_id = 'a4900000-0000-0000-0000-000000000008'),
  1, '23:30 Jakarta on p_to is included');

select is(
  (select count(*)::int from public.report_attendance('2026-11-01', '2026-11-30')
    where member_id = 'a4900000-0000-0000-0000-000000000009'),
  0, '00:30 Jakarta the day after p_to is excluded');

select is(
  (select count(*)::int from public.report_attendance(null, null)
    where member_id = 'a4900000-0000-0000-0000-00000000000a'),
  1, 'null/null window includes a session 5 days ago');

select is(
  (select count(*)::int from public.report_attendance(null, null)
    where member_id = 'a4900000-0000-0000-0000-00000000000b'),
  0, 'null/null window excludes a session 40 days ago');

select is(
  (select member_id::text from public.report_attendance('2026-11-01', '2026-11-30') limit 1),
  'a4900000-0000-0000-0000-000000000003',
  'ordered by attended_count desc');

-- anon cannot execute
reset role;
set local role anon;
select throws_ok(
  $$select * from public.report_attendance('2026-11-01', '2026-11-30')$$,
  '42501', null, 'anon cannot execute');

select * from finish();
rollback;
