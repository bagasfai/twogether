-- Covers 20261104000002_report_revenue.sql: admin-only cash-basis revenue
-- report (session rows + membership sale rows), quota-covered participants,
-- null price, Asia/Jakarta date boundaries, cancelled/draft exclusion.

begin;
select plan(17);

insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-000000000001', 'rr-admin@test.local'),
  ('a5000000-0000-0000-0000-000000000002', 'rr-host@test.local'),
  ('a5000000-0000-0000-0000-000000000003', 'rr-paid@test.local'),
  ('a5000000-0000-0000-0000-000000000004', 'rr-unpaid@test.local'),
  ('a5000000-0000-0000-0000-000000000005', 'rr-covered@test.local'),
  ('a5000000-0000-0000-0000-000000000006', 'rr-refunded@test.local'),
  ('a5000000-0000-0000-0000-000000000007', 'rr-member-in@test.local'),
  ('a5000000-0000-0000-0000-000000000008', 'rr-member-null@test.local'),
  ('a5000000-0000-0000-0000-000000000009', 'rr-member-out@test.local');

update public.profiles set role = 'admin' where id = 'a5000000-0000-0000-0000-000000000001';
update public.profiles set role = 'host'  where id = 'a5000000-0000-0000-0000-000000000002';
update public.profiles set full_name = 'Member In'   where id = 'a5000000-0000-0000-0000-000000000007';
update public.profiles set full_name = 'Member Null' where id = 'a5000000-0000-0000-0000-000000000008';
update public.profiles set full_name = 'Member Out'  where id = 'a5000000-0000-0000-0000-000000000009';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status, price)
values
  ('a5000000-1111-0000-0000-000000000001', 'Priced', '2026-11-10 19:00+07', '2026-11-10 21:00+07', 'GOR', 20, 'a5000000-0000-0000-0000-000000000002', 'completed', 50000),
  ('a5000000-1111-0000-0000-000000000002', 'Refunded', '2026-11-11 19:00+07', '2026-11-11 21:00+07', 'GOR', 20, 'a5000000-0000-0000-0000-000000000002', 'completed', 30000),
  ('a5000000-1111-0000-0000-000000000003', 'Free', '2026-11-12 19:00+07', '2026-11-12 21:00+07', 'GOR', 20, 'a5000000-0000-0000-0000-000000000002', 'completed', null),
  ('a5000000-1111-0000-0000-000000000004', 'Cancelled', '2026-11-13 19:00+07', '2026-11-13 21:00+07', 'GOR', 20, 'a5000000-0000-0000-0000-000000000002', 'cancelled', 50000),
  ('a5000000-1111-0000-0000-000000000005', 'Draft', '2026-11-14 19:00+07', '2026-11-14 21:00+07', 'GOR', 20, 'a5000000-0000-0000-0000-000000000002', 'draft', 50000);

-- Priced: paid, unpaid, covered (paid_at also set), guest unpaid, plus a cancelled row
insert into public.participants (id, session_id, user_id, guest_name, status, paid_at) values
  ('a5000000-2222-0000-0000-000000000001', 'a5000000-1111-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000003', null, 'confirmed', '2026-11-10 18:00+07'),
  ('a5000000-2222-0000-0000-000000000002', 'a5000000-1111-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000004', null, 'confirmed', null),
  ('a5000000-2222-0000-0000-000000000003', 'a5000000-1111-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000005', null, 'confirmed', '2026-11-10 18:05+07'),
  ('a5000000-2222-0000-0000-000000000004', 'a5000000-1111-0000-0000-000000000001', null, 'Guest Gary', 'confirmed', null),
  ('a5000000-2222-0000-0000-000000000005', 'a5000000-1111-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000006', null, 'cancelled', null),
  -- Refunded: both had a usage that was refunded; fall back to paid_at
  ('a5000000-2222-0000-0000-000000000006', 'a5000000-1111-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000003', null, 'confirmed', '2026-11-11 18:00+07'),
  ('a5000000-2222-0000-0000-000000000007', 'a5000000-1111-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000004', null, 'confirmed', null),
  -- Free (null price): one paid, one unpaid
  ('a5000000-2222-0000-0000-000000000008', 'a5000000-1111-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000003', null, 'confirmed', '2026-11-12 18:00+07'),
  ('a5000000-2222-0000-0000-000000000009', 'a5000000-1111-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000004', null, 'confirmed', null),
  -- Cancelled / draft sessions
  ('a5000000-2222-0000-0000-00000000000a', 'a5000000-1111-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000003', null, 'confirmed', '2026-11-13 18:00+07'),
  ('a5000000-2222-0000-0000-00000000000b', 'a5000000-1111-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000003', null, 'confirmed', '2026-11-14 18:00+07');

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, payment_received_at, cancelled_at)
values
  ('a5000000-3333-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000007', 150000, 8, 60, '2026-11-05 10:00+07', '2026-11-20 10:00+07'),
  ('a5000000-3333-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000008', 150000, 8, 60, null, null),
  ('a5000000-3333-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000009', 150000, 8, 60, '2026-12-01 00:30+07', null),
  ('a5000000-3333-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000005', 150000, 8, 60, '2026-11-01 00:30+07', null),
  ('a5000000-3333-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000008', 90000, 8, 60, now() - interval '5 days', null),
  ('a5000000-3333-0000-0000-000000000006', 'a5000000-0000-0000-0000-000000000009', 90000, 8, 60, now() - interval '40 days', null);

-- Covered participant: an old refunded usage plus the live one (must not double count)
insert into public.membership_usages (membership_id, participant_id, refunded_at) values
  ('a5000000-3333-0000-0000-000000000004', 'a5000000-2222-0000-0000-000000000003', '2026-11-09 10:00+07'),
  ('a5000000-3333-0000-0000-000000000004', 'a5000000-2222-0000-0000-000000000003', null),
  ('a5000000-3333-0000-0000-000000000004', 'a5000000-2222-0000-0000-000000000006', '2026-11-10 10:00+07'),
  ('a5000000-3333-0000-0000-000000000004', 'a5000000-2222-0000-0000-000000000007', '2026-11-10 10:00+07');

set local role authenticated;

set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_revenue('2026-11-01', '2026-11-30')$$,
  '42501', 'forbidden', 'member is denied');

set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_revenue('2026-11-01', '2026-11-30')$$,
  '42501', 'forbidden', 'host is denied');

set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select * from public.report_revenue('2026-11-01', '2026-11-30')$$,
  'admin can run the report');

select results_eq(
  $$select row_kind, label, price, confirmed_count, covered_count, paid_count,
           unpaid_count, cash_collected, outstanding
      from public.report_revenue('2026-11-01', '2026-11-30')
     where ref_id = 'a5000000-1111-0000-0000-000000000001'$$,
  $$values ('session'::text, 'Priced'::text, 50000, 4, 1, 1, 2, 50000::bigint, 100000::bigint)$$,
  'priced session: covered participant adds nothing, guest counts, cancelled row ignored');

select results_eq(
  $$select confirmed_count, covered_count, paid_count, unpaid_count, cash_collected, outstanding
      from public.report_revenue('2026-11-01', '2026-11-30')
     where ref_id = 'a5000000-1111-0000-0000-000000000002'$$,
  $$values (2, 0, 1, 1, 30000::bigint, 30000::bigint)$$,
  'refunded usage falls back to paid_at');

select results_eq(
  $$select price, paid_count, unpaid_count, cash_collected, outstanding
      from public.report_revenue('2026-11-01', '2026-11-30')
     where ref_id = 'a5000000-1111-0000-0000-000000000003'$$,
  $$values (null::int, 1, 1, 0::bigint, 0::bigint)$$,
  'null price counts as 0, sums are 0 not null');

select is(
  (select count(*)::int from public.report_revenue('2026-11-01', '2026-11-30')
    where ref_id in ('a5000000-1111-0000-0000-000000000004', 'a5000000-1111-0000-0000-000000000005')),
  0, 'cancelled and draft sessions are absent');

select results_eq(
  $$select row_kind, label, price, paid_count, unpaid_count, covered_count, cash_collected, outstanding
      from public.report_revenue('2026-11-01', '2026-11-30')
     where ref_id = 'a5000000-3333-0000-0000-000000000001'$$,
  $$values ('membership'::text, 'Member In'::text, 150000, 1, 0, 0, 150000::bigint, 0::bigint)$$,
  'membership sale appears with cash_collected = price_idr, even when later cancelled');

select is(
  (select occurred_at from public.report_revenue('2026-11-01', '2026-11-30')
    where ref_id = 'a5000000-3333-0000-0000-000000000001'),
  '2026-11-05 10:00+07'::timestamptz, 'membership occurred_at is payment_received_at');

select is(
  (select count(*)::int from public.report_revenue('2026-11-01', '2026-11-30')
    where ref_id = 'a5000000-3333-0000-0000-000000000002'),
  0, 'membership with null payment_received_at is absent');

select is(
  (select count(*)::int from public.report_revenue('2026-11-01', '2026-11-30')
    where ref_id = 'a5000000-3333-0000-0000-000000000003'),
  0, 'membership paid 00:30 Jakarta the day after p_to is excluded');

select is(
  (select count(*)::int from public.report_revenue('2026-11-01', '2026-11-30')
    where ref_id = 'a5000000-3333-0000-0000-000000000004'),
  1, 'membership paid 00:30 Jakarta on p_from is included');

select is(
  (select count(*)::int from public.report_revenue('2026-12-01', '2026-12-01')
    where ref_id = 'a5000000-3333-0000-0000-000000000003'),
  1, 'membership paid 00:30 Jakarta on 1 Dec is in a December range');

select is(
  (select count(*)::int from public.report_revenue(null, null)
    where ref_id = 'a5000000-3333-0000-0000-000000000005'),
  1, 'null/null window includes a membership paid 5 days ago');

select is(
  (select count(*)::int from public.report_revenue(null, null)
    where ref_id = 'a5000000-3333-0000-0000-000000000006'),
  0, 'null/null window excludes a membership paid 40 days ago');

select is(
  (select string_agg(row_kind, ',' order by rn)
     from (select row_kind, row_number() over () as rn
             from public.report_revenue('2026-11-01', '2026-11-30')
            where ref_id in (
              'a5000000-1111-0000-0000-000000000001', 'a5000000-1111-0000-0000-000000000002',
              'a5000000-3333-0000-0000-000000000001', 'a5000000-3333-0000-0000-000000000004')) q),
  'session,session,membership,membership',
  'sessions first (row_kind desc)');

reset role;
set local role anon;
select throws_ok(
  $$select * from public.report_revenue('2026-11-01', '2026-11-30')$$,
  '42501', null, 'anon cannot execute');

select * from finish();
rollback;
