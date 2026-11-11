-- Covers 20261104000004_report_hosts.sql: admin-only per-host report (owners
-- and co-hosts), cancelled sessions counted but excluded from fill/waitlist,
-- draft exclusion, null full_name, Asia/Jakarta date boundaries.

begin;
select plan(15);

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-000000000001', 'rh-admin@test.local'),
  ('a6000000-0000-0000-0000-000000000002', 'rh-host@test.local'),
  ('a6000000-0000-0000-0000-000000000003', 'rh-cohost@test.local'),
  ('a6000000-0000-0000-0000-000000000004', 'rh-cancelled-only@test.local'),
  ('a6000000-0000-0000-0000-000000000005', 'rh-draft-only@test.local'),
  ('a6000000-0000-0000-0000-000000000006', 'rh-nullname@test.local'),
  ('a6000000-0000-0000-0000-000000000007', 'rh-edge@test.local'),
  ('a6000000-0000-0000-0000-000000000008', 'rh-recent@test.local');

update public.profiles set role = 'admin' where id = 'a6000000-0000-0000-0000-000000000001';
update public.profiles set role = 'host', full_name = 'Host Main'     where id = 'a6000000-0000-0000-0000-000000000002';
update public.profiles set role = 'host', full_name = 'Host Co'       where id = 'a6000000-0000-0000-0000-000000000003';
update public.profiles set role = 'host', full_name = 'Host Cancelled' where id = 'a6000000-0000-0000-0000-000000000004';
update public.profiles set role = 'host', full_name = 'Host Draft'     where id = 'a6000000-0000-0000-0000-000000000005';
update public.profiles set role = 'host', full_name = '   '            where id = 'a6000000-0000-0000-0000-000000000006';
update public.profiles set role = 'host', full_name = 'Host Edge'      where id = 'a6000000-0000-0000-0000-000000000007';
update public.profiles set role = 'host', full_name = 'Host Recent'    where id = 'a6000000-0000-0000-0000-000000000008';

-- The sessions_add_owner trigger inserts the creator into session_hosts.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a6000000-1111-0000-0000-000000000001', 'Done half', '2026-11-10 19:00+07', '2026-11-10 21:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000002', 'completed'),
  ('a6000000-1111-0000-0000-000000000002', 'Done full', '2026-11-11 19:00+07', '2026-11-11 21:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000002', 'completed'),
  ('a6000000-1111-0000-0000-000000000003', 'Cancelled', '2026-11-12 19:00+07', '2026-11-12 21:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000002', 'cancelled'),
  ('a6000000-1111-0000-0000-000000000004', 'Only cancelled', '2026-11-13 19:00+07', '2026-11-13 21:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000004', 'cancelled'),
  ('a6000000-1111-0000-0000-000000000005', 'Only draft', '2026-11-14 19:00+07', '2026-11-14 21:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000005', 'draft'),
  ('a6000000-1111-0000-0000-000000000006', 'Null name', '2026-11-15 19:00+07', '2026-11-15 21:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000006', 'completed'),
  ('a6000000-1111-0000-0000-000000000007', 'Edge first', '2026-11-01 00:30+07', '2026-11-01 02:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000007', 'completed'),
  ('a6000000-1111-0000-0000-000000000008', 'Edge last', '2026-11-30 23:30+07', '2026-12-01 00:15+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000007', 'completed'),
  ('a6000000-1111-0000-0000-000000000009', 'Edge after', '2026-12-01 00:30+07', '2026-12-01 02:00+07', 'GOR', 16, 'a6000000-0000-0000-0000-000000000007', 'completed'),
  ('a6000000-1111-0000-0000-00000000000a', 'Recent', now() - interval '5 days', now() - interval '5 days' + interval '2 hours', 'GOR', 16, 'a6000000-0000-0000-0000-000000000008', 'completed'),
  ('a6000000-1111-0000-0000-00000000000b', 'Old', now() - interval '40 days', now() - interval '40 days' + interval '2 hours', 'GOR', 16, 'a6000000-0000-0000-0000-000000000008', 'completed');

-- Host Co co-hosts the first two sessions of Host Main.
insert into public.session_hosts (session_id, user_id, role) values
  ('a6000000-1111-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000003', 'cohost'),
  ('a6000000-1111-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000003', 'cohost'),
  ('a6000000-1111-0000-0000-000000000003', 'a6000000-0000-0000-0000-000000000003', 'cohost');

-- Guests keep fixtures independent of extra profiles.
-- S1: 8 confirmed. S2: 16 confirmed, 3 waiting, 2 cancelled.
-- S3 (cancelled): 4 confirmed, 5 waiting, 1 cancelled.
insert into public.participants (session_id, user_id, guest_name, status, added_by)
select 'a6000000-1111-0000-0000-000000000001'::uuid, null::uuid, 'g1-' || g, 'confirmed'::public.participant_status, 'a6000000-0000-0000-0000-000000000002'::uuid
  from generate_series(1, 8) g
union all
select 'a6000000-1111-0000-0000-000000000002', null, 'g2c-' || g, 'confirmed', 'a6000000-0000-0000-0000-000000000002'
  from generate_series(1, 16) g
union all
select 'a6000000-1111-0000-0000-000000000002', null, 'g2w-' || g, 'waiting_list', 'a6000000-0000-0000-0000-000000000002'
  from generate_series(1, 3) g
union all
select 'a6000000-1111-0000-0000-000000000002', null, 'g2x-' || g, 'cancelled', 'a6000000-0000-0000-0000-000000000002'
  from generate_series(1, 2) g
union all
select 'a6000000-1111-0000-0000-000000000003', null, 'g3c-' || g, 'confirmed', 'a6000000-0000-0000-0000-000000000002'
  from generate_series(1, 4) g
union all
select 'a6000000-1111-0000-0000-000000000003', null, 'g3w-' || g, 'waiting_list', 'a6000000-0000-0000-0000-000000000002'
  from generate_series(1, 5) g
union all
select 'a6000000-1111-0000-0000-000000000003', null, 'g3x-1', 'cancelled', 'a6000000-0000-0000-0000-000000000002';

set local role authenticated;

set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select * from public.report_hosts('2026-11-01', '2026-11-30')$$,
  '42501', 'forbidden', 'host is denied');

set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select * from public.report_hosts('2026-11-01', '2026-11-30')$$,
  'admin can run the report');

select results_eq(
  $$select full_name, sessions_hosted, completed_sessions, cancelled_sessions,
           avg_fill_rate, peak_waitlist, participant_cancellations
      from public.report_hosts('2026-11-01', '2026-11-30')
     where host_id = 'a6000000-0000-0000-0000-000000000002'$$,
  $$values ('Host Main'::text, 3, 2, 1, 75.0::numeric, 3, 3)$$,
  'owner: 3 hosted, 2 completed, 1 cancelled, fill 75.0, waitlist peak ignores cancelled session, 3 cancellations');

select results_eq(
  $$select full_name, sessions_hosted, completed_sessions, cancelled_sessions,
           avg_fill_rate, peak_waitlist, participant_cancellations
      from public.report_hosts('2026-11-01', '2026-11-30')
     where host_id = 'a6000000-0000-0000-0000-000000000003'$$,
  $$values ('Host Co'::text, 3, 2, 1, 75.0::numeric, 3, 3)$$,
  'co-host sees the same session counts as the owner');

select is(
  (select avg_fill_rate from public.report_hosts('2026-11-01', '2026-11-30')
    where host_id = 'a6000000-0000-0000-0000-000000000004'),
  null::numeric, 'host with only a cancelled session has null avg_fill_rate');

select results_eq(
  $$select sessions_hosted, completed_sessions, cancelled_sessions, peak_waitlist, participant_cancellations
      from public.report_hosts('2026-11-01', '2026-11-30')
     where host_id = 'a6000000-0000-0000-0000-000000000004'$$,
  $$values (1, 0, 1, 0, 0)$$,
  'cancelled-only host: hosted 1, peak_waitlist 0');

select is(
  (select count(*)::int from public.report_hosts('2026-11-01', '2026-11-30')
    where host_id = 'a6000000-0000-0000-0000-000000000005'),
  0, 'host with only a draft session is absent');

select is(
  (select full_name from public.report_hosts('2026-11-01', '2026-11-30')
    where host_id = 'a6000000-0000-0000-0000-000000000006'),
  'Unnamed member', 'blank full_name becomes Unnamed member');

select is(
  (select avg_fill_rate from public.report_hosts('2026-11-01', '2026-11-30')
    where host_id = 'a6000000-0000-0000-0000-000000000006'),
  0.0::numeric, 'non-cancelled session with zero confirmed has fill 0.0');

select is(
  (select sessions_hosted from public.report_hosts('2026-11-01', '2026-11-30')
    where host_id = 'a6000000-0000-0000-0000-000000000007'),
  2, 'Jakarta boundaries: 00:30 on p_from and 23:30 on p_to included, 00:30 next day not');

select is(
  (select sessions_hosted from public.report_hosts('2026-12-01', '2026-12-01')
    where host_id = 'a6000000-0000-0000-0000-000000000007'),
  1, 'session at 00:30 Jakarta on 1 Dec belongs to a December range');

select is(
  (select count(*)::int from public.report_hosts('2026-11-01', '2026-11-30')
    where host_id = 'a6000000-0000-0000-0000-000000000002'),
  1, 'one row per host (no fan-out)');

select is(
  (select string_agg(host_id::text, ',' order by rn)
     from (select host_id, row_number() over () as rn
             from public.report_hosts('2026-11-01', '2026-11-30')
            where host_id in ('a6000000-0000-0000-0000-000000000002',
                              'a6000000-0000-0000-0000-000000000004')) q),
  'a6000000-0000-0000-0000-000000000002,a6000000-0000-0000-0000-000000000004',
  'ordered by sessions_hosted desc');

select is(
  (select sessions_hosted from public.report_hosts(null, null)
    where host_id = 'a6000000-0000-0000-0000-000000000008'),
  1, 'null/null window counts the session from 5 days ago, not the one from 40 days ago');

reset role;
set local role anon;
select throws_ok(
  $$select * from public.report_hosts('2026-11-01', '2026-11-30')$$,
  '42501', null, 'anon cannot execute');

select * from finish();
rollback;
