-- Covers migration 20261028000004_transfer_participation.sql.

begin;
select plan(38);

create function pg_temp.usage_state(p_participant uuid)
returns text
language sql
as $$
  select coalesce(string_agg(
           case when u.refunded_at is null then 'live'
                else coalesce(u.refund_reason, '<no reason>') end,
           ',' order by u.consumed_at, u.id), '')
    from public.membership_usages u
   where u.participant_id = p_participant;
$$;

-- Users: 01 host; 02 owner O1; 03 target T1; 04 filler F; 05 waiter W;
-- 06 owner O2; 07 target T2 (prior cancelled row); 08 owner O3 (member seat);
-- 09 target T3; 10 target T4 (guest seat); 11 outsider X; 12 owner O5;
-- 13 target T5; 14 owner O6; 15 target T6; 16 premium registrant P;
-- 17 filler F6; 18 owner O7; 19 target T7; 20 owner O8 (errors);
-- 21 target already confirmed C; 22 filler; 23 cancelled-seat owner;
-- 24 waiting-seat owner; 25 target T8.
insert into auth.users (id, email)
select ('000000' || lpad(n::text, 2, '0') || '-0043-0043-0043-000000000000')::uuid,
       'u' || n || '-043@test.local'
  from generate_series(1, 30) n;

update public.profiles set role = 'host'
 where id = '00000001-0043-0043-0043-000000000000';

-- (id, kind, max, starts_in, status)
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   court_count, kind, coach_count, seats_per_coach, created_by, status, registration_state)
select s.id::uuid, 'S', now() + s.starts, now() + s.starts + interval '2 hours', 'GOR',
       2, 3, 1, s.kind::public.session_kind, s.coaches, s.seats,
       '00000001-0043-0043-0043-000000000000', s.status::public.session_status, 'open'
  from (values
    ('a4300001-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '3 days', 'scheduled'), -- S1 main
    ('a4300002-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '3 days', 'scheduled'), -- S2 revive
    ('a4300003-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '3 days', 'scheduled'), -- S3 host transfers
    ('a4300004-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '3 days', 'scheduled'), -- S4 errors
    ('a4300005-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '-1 hour', 'live'),     -- S5 after start
    ('a4300006-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '3 days', 'scheduled'), -- S6 bump
    ('a4300007-0000-0000-0000-000000000000', 'open_play', null::int, null::int, interval '3 days', 'scheduled'), -- S7 later cancel
    ('a4300008-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '3 days', 'scheduled'), -- S8 live usage on target row
    ('a4300009-0000-0000-0000-000000000000', 'drilling',  1, 2, interval '-1 day', 'completed')  -- S9 completed session
  ) as s(id, kind, coaches, seats, starts, status);

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at)
select ('e43000' || lpad(n::text, 2, '0') || '-0000-0000-0000-000000000000')::uuid,
       ('000000' || lpad(n::text, 2, '0') || '-0043-0043-0043-000000000000')::uuid,
       0, 5, 30, now() - interval '1 day', now() + interval '29 days'
  from unnest(array[2, 14, 16, 18, 26]) n;

-- S1: O1 premium, checked in, paid, consented; F filler; W waiting.
insert into public.participants
  (id, session_id, user_id, status, is_premium, membership_id, registered_at,
   consented_at, checked_in_at, paid_at) values
  ('b4300001-0000-0000-0000-000000000000', 'a4300001-0000-0000-0000-000000000000', '00000002-0043-0043-0043-000000000000', 'confirmed', true, 'e4300002-0000-0000-0000-000000000000', now() - interval '5 hours', now() - interval '5 hours', now() - interval '30 minutes', '2026-01-02 03:04:05+00');
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4300004-0000-0000-0000-000000000000', 'a4300001-0000-0000-0000-000000000000', '00000004-0043-0043-0043-000000000000', 'confirmed', now() - interval '4 hours'),
  ('b4300005-0000-0000-0000-000000000000', 'a4300001-0000-0000-0000-000000000000', '00000005-0043-0043-0043-000000000000', 'waiting_list', now() - interval '3 hours');
insert into public.membership_usages (membership_id, participant_id) values
  ('e4300002-0000-0000-0000-000000000000', 'b4300001-0000-0000-0000-000000000000');

-- S2: O2 non-premium owner, T2 has a stale cancelled row.
insert into public.participants (id, session_id, user_id, status, registered_at, paid_at) values
  ('b4300006-0000-0000-0000-000000000000', 'a4300002-0000-0000-0000-000000000000', '00000006-0043-0043-0043-000000000000', 'confirmed', now() - interval '5 hours', null);
insert into public.participants
  (id, session_id, user_id, status, registered_at, cancelled_at, consented_at, added_by, bumped_at, paid_at) values
  ('b4300007-0000-0000-0000-000000000000', 'a4300002-0000-0000-0000-000000000000', '00000007-0043-0043-0043-000000000000', 'cancelled', now() - interval '6 hours', now() - interval '1 hour', now() - interval '6 hours', '00000001-0043-0043-0043-000000000000', now() - interval '2 hours', '2026-02-02 00:00:00+00');
update public.participants
   set no_show_at = now() - interval '1 hour',
       replaced_by = 'b4300006-0000-0000-0000-000000000000',
       paid_by_user_id = '00000006-0043-0043-0043-000000000000'
 where id = 'b4300007-0000-0000-0000-000000000000';

-- S3: member seat O3 and a guest seat.
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4300008-0000-0000-0000-000000000000', 'a4300003-0000-0000-0000-000000000000', '00000008-0043-0043-0043-000000000000', 'confirmed', now() - interval '5 hours');
insert into public.participants (id, session_id, user_id, guest_name, registered_by, status, registered_at) values
  ('b4300010-0000-0000-0000-000000000000', 'a4300003-0000-0000-0000-000000000000', null, 'Guest', '00000008-0043-0043-0043-000000000000', 'confirmed', now() - interval '4 hours');

-- S4: O8 confirmed (ok seat), C confirmed, W waiting, cancelled seat, waiting seat.
-- max 2: O8 + C confirmed; waiting seat + cancelled seat are extra rows.
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4300020-0000-0000-0000-000000000000', 'a4300004-0000-0000-0000-000000000000', '00000020-0043-0043-0043-000000000000', 'confirmed', now() - interval '5 hours'),
  ('b4300021-0000-0000-0000-000000000000', 'a4300004-0000-0000-0000-000000000000', '00000021-0043-0043-0043-000000000000', 'confirmed', now() - interval '4 hours'),
  ('b4300024-0000-0000-0000-000000000000', 'a4300004-0000-0000-0000-000000000000', '00000024-0043-0043-0043-000000000000', 'waiting_list', now() - interval '3 hours'),
  ('b4300022-0000-0000-0000-000000000000', 'a4300004-0000-0000-0000-000000000000', '00000022-0043-0043-0043-000000000000', 'waiting_list', now() - interval '2 hours');
insert into public.participants (id, session_id, user_id, status, registered_at, cancelled_at) values
  ('b4300023-0000-0000-0000-000000000000', 'a4300004-0000-0000-0000-000000000000', '00000023-0043-0043-0043-000000000000', 'cancelled', now() - interval '2 hours', now());

-- S5: live session already past starts_at.
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4300012-0000-0000-0000-000000000000', 'a4300005-0000-0000-0000-000000000000', '00000012-0043-0043-0043-000000000000', 'confirmed', now() - interval '5 hours');

-- S6: premium O6 seat and non-premium filler F6 (the bump target).
insert into public.participants (id, session_id, user_id, status, is_premium, membership_id, registered_at) values
  ('b4300014-0000-0000-0000-000000000000', 'a4300006-0000-0000-0000-000000000000', '00000014-0043-0043-0043-000000000000', 'confirmed', true, 'e4300014-0000-0000-0000-000000000000', now() - interval '5 hours'),
  ('b4300017-0000-0000-0000-000000000000', 'a4300006-0000-0000-0000-000000000000', '00000017-0043-0043-0043-000000000000', 'confirmed', false, null, now() - interval '4 hours');
insert into public.membership_usages (membership_id, participant_id) values
  ('e4300014-0000-0000-0000-000000000000', 'b4300014-0000-0000-0000-000000000000');

-- S7: premium O7 seat on open play, before the cutoff.
insert into public.participants (id, session_id, user_id, status, is_premium, membership_id, registered_at) values
  ('b4300018-0000-0000-0000-000000000000', 'a4300007-0000-0000-0000-000000000000', '00000018-0043-0043-0043-000000000000', 'confirmed', true, 'e4300018-0000-0000-0000-000000000000', now() - interval '5 hours');
insert into public.membership_usages (membership_id, participant_id) values
  ('e4300018-0000-0000-0000-000000000000', 'b4300018-0000-0000-0000-000000000000');

-- ======== member_transfers_own_seat (S1: O1 -> T1) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0043-0043-0043-000000000000","role":"authenticated"}';
create temp table t1 on commit drop as
  select * from public.transfer_participation(
    'b4300001-0000-0000-0000-000000000000', '00000003-0043-0043-0043-000000000000');
grant all on t1 to public;
reset role;

select is((select status::text from t1), 'confirmed',
  'member_transfers_own_seat: returned replacement row is confirmed');
select is(
  (select user_id from public.participants where id = (select id from t1)),
  '00000003-0043-0043-0043-000000000000'::uuid,
  'member_transfers_own_seat: replacement belongs to the target');
select is(
  (select (status::text, replaced_by = (select id from t1), cancelled_at is not null)::text
     from public.participants where id = 'b4300001-0000-0000-0000-000000000000'),
  ('cancelled', true, true)::text,
  'member_transfers_own_seat: old row cancelled with replaced_by = new id');
select is(
  (select count(*)::int from public.participants
    where session_id = 'a4300001-0000-0000-0000-000000000000' and status = 'confirmed'),
  2, 'member_transfers_own_seat: confirmed count unchanged');
select is(
  (select status::text from public.participants where id = 'b4300005-0000-0000-0000-000000000000'),
  'waiting_list', 'member_transfers_own_seat: waitlister not promoted');

-- ======== replacement_copies_premium_snapshot_and_paid_at ========

select is(
  (select (is_premium, membership_id, paid_at)::text from public.participants where id = (select id from t1)),
  (true, 'e4300002-0000-0000-0000-000000000000'::uuid, '2026-01-02 03:04:05+00'::timestamptz)::text,
  'replacement_copies_premium_snapshot_and_paid_at: is_premium, membership_id, paid_at copied');
select is(
  (select count(*)::int from public.membership_usages where participant_id = (select id from t1)),
  0, 'replacement_copies_premium_snapshot_and_paid_at: no usage row for the replacement');
select is(pg_temp.usage_state('b4300001-0000-0000-0000-000000000000'), 'live',
  'replacement_copies_premium_snapshot_and_paid_at: old usage unchanged and unrefunded');
select is(
  (select paid_by_user_id from public.participants where id = (select id from t1)),
  '00000002-0043-0043-0043-000000000000'::uuid,
  'replacement_copies_premium_snapshot_and_paid_at: paid_by_user_id is the original user');
select is(
  (select checked_in_at from public.participants where id = (select id from t1)),
  null::timestamptz,
  'replacement_checked_in_at_is_null');
select is(
  (select consented_at from public.participants where id = (select id from t1)),
  null::timestamptz,
  'replacement_consent_is_null');

-- S8: owner 27 seat; target 26 has a cancelled premium row with a live usage.
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4300027-0000-0000-0000-000000000000', 'a4300008-0000-0000-0000-000000000000', '00000027-0043-0043-0043-000000000000', 'confirmed', now() - interval '5 hours');
insert into public.participants (id, session_id, user_id, status, is_premium, membership_id, registered_at, cancelled_at) values
  ('b4300026-0000-0000-0000-000000000000', 'a4300008-0000-0000-0000-000000000000', '00000026-0043-0043-0043-000000000000', 'cancelled', true, 'e4300026-0000-0000-0000-000000000000', now() - interval '6 hours', now() - interval '1 hour');
insert into public.membership_usages (membership_id, participant_id) values
  ('e4300026-0000-0000-0000-000000000000', 'b4300026-0000-0000-0000-000000000000');

-- S9: completed session with a confirmed seat.
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4300028-0000-0000-0000-000000000000', 'a4300009-0000-0000-0000-000000000000', '00000028-0043-0043-0043-000000000000', 'confirmed', now() - interval '5 hours');

-- ======== replacement_with_prior_cancelled_row_is_revived (S2: O2 -> T2) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000006-0043-0043-0043-000000000000","role":"authenticated"}';
select public.transfer_participation(
  'b4300006-0000-0000-0000-000000000000', '00000007-0043-0043-0043-000000000000');
reset role;

select is(
  (select count(*)::int from public.participants
    where session_id = 'a4300002-0000-0000-0000-000000000000'
      and user_id = '00000007-0043-0043-0043-000000000000'),
  1, 'replacement_with_prior_cancelled_row_is_revived: one row for the user');
select is(
  (select (status::text, consented_at is null, cancelled_at is null, added_by is null,
           bumped_at is null, replaced_by is null, checked_in_at is null, paid_at is null)::text
     from public.participants where id = 'b4300007-0000-0000-0000-000000000000'),
  ('confirmed', true, true, true, true, true, true, true)::text,
  'replacement_with_prior_cancelled_row_is_revived: stale fields reset (paid_at copied from old row: null)');
select is(
  (select paid_by_user_id from public.participants where id = 'b4300007-0000-0000-0000-000000000000'),
  '00000006-0043-0043-0043-000000000000'::uuid,
  'replacement_with_prior_cancelled_row_is_revived: paid_by_user_id is the original user');
select is(
  (select no_show_at from public.participants where id = 'b4300007-0000-0000-0000-000000000000'),
  null::timestamptz,
  'replacement_with_prior_cancelled_row_is_revived: no_show_at reset');
select is(
  (select replaced_by from public.participants where id = 'b4300006-0000-0000-0000-000000000000'),
  'b4300007-0000-0000-0000-000000000000'::uuid,
  'replacement_with_prior_cancelled_row_is_revived: old row points at the revived row');

-- ======== host_can_transfer_any_seat_including_guest (S3) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0043-0043-0043-000000000000","role":"authenticated"}';
create temp table t3 on commit drop as
  select * from public.transfer_participation(
    'b4300010-0000-0000-0000-000000000000', '00000010-0043-0043-0043-000000000000');
grant all on t3 to public;
select public.transfer_participation(
  'b4300008-0000-0000-0000-000000000000', '00000009-0043-0043-0043-000000000000');
reset role;

select is(
  (select (status::text, paid_by_user_id is null)::text from t3),
  ('confirmed', true)::text,
  'host_can_transfer_any_seat_including_guest: guest seat replaced, paid_by_user_id null');
select is(
  (select (status::text, replaced_by = (select id from t3))::text
     from public.participants where id = 'b4300010-0000-0000-0000-000000000000'),
  ('cancelled', true)::text,
  'host_can_transfer_any_seat_including_guest: guest row cancelled and linked');
select is(
  (select status::text from public.participants
    where session_id = 'a4300003-0000-0000-0000-000000000000'
      and user_id = '00000009-0043-0043-0043-000000000000'),
  'confirmed', 'host_can_transfer_any_seat_including_guest: member seat replaced by host');

-- ======== error cases (S4) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000011-0043-0043-0043-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300020-0000-0000-0000-000000000000', '00000025-0043-0043-0043-000000000000') $$,
  'JB007', null, 'non_owner_non_host_gets_JB007');

set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300020-0000-0000-0000-000000000000', '00000025-0043-0043-0043-000000000000') $$,
  'JB004', null, 'anon_gets_JB004');

set local request.jwt.claims = '{"sub":"00000020-0043-0043-0043-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300020-0000-0000-0000-000000000000', '00000021-0043-0043-0043-000000000000') $$,
  'JB021', null, 'transfer_to_member_already_confirmed_or_waitlisted_gets_JB021: confirmed');
select throws_ok(
  $$ select public.transfer_participation('b4300020-0000-0000-0000-000000000000', '00000022-0043-0043-0043-000000000000') $$,
  'JB021', null, 'transfer_to_member_already_confirmed_or_waitlisted_gets_JB021: waitlisted');
select throws_ok(
  $$ select public.transfer_participation('b4300020-0000-0000-0000-000000000000', '00000020-0043-0043-0043-000000000000') $$,
  'JB021', null, 'transfer_to_self_gets_JB021');

set local request.jwt.claims = '{"sub":"00000024-0043-0043-0043-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300024-0000-0000-0000-000000000000', '00000025-0043-0043-0043-000000000000') $$,
  'JB022', null, 'transfer_waitlisted_or_cancelled_seat_gets_JB022: waitlisted');
set local request.jwt.claims = '{"sub":"00000023-0043-0043-0043-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300023-0000-0000-0000-000000000000', '00000025-0043-0043-0043-000000000000') $$,
  'JB022', null, 'transfer_waitlisted_or_cancelled_seat_gets_JB022: cancelled');
reset role;

-- Failed transfers change nothing.
select is(
  (select count(*)::int from public.participants
    where session_id = 'a4300004-0000-0000-0000-000000000000' and status = 'confirmed'),
  2, 'failed transfers left the confirmed count unchanged');

-- A cancelled target row (no live usage) is not a conflict: it is revived.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000020-0043-0043-0043-000000000000","role":"authenticated"}';
select lives_ok(
  $$ select public.transfer_participation('b4300020-0000-0000-0000-000000000000', '00000023-0043-0043-0043-000000000000') $$,
  'transfer_to_member_with_plain_cancelled_row_is_not_a_conflict');
reset role;

-- ======== live usage on the target's cancelled row (S8) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000027-0043-0043-0043-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300027-0000-0000-0000-000000000000', '00000026-0043-0043-0043-000000000000') $$,
  'JB021', null, 'transfer_to_member_with_live_usage_on_cancelled_row_gets_JB021');
-- missing target profile
select throws_ok(
  $$ select public.transfer_participation('b4300027-0000-0000-0000-000000000000', 'ffffffff-0043-0043-0043-000000000000') $$,
  'JB008', null, 'transfer_to_missing_profile_gets_JB008');
-- completed session, even for a host
set local request.jwt.claims = '{"sub":"00000001-0043-0043-0043-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300028-0000-0000-0000-000000000000', '00000029-0043-0043-0043-000000000000') $$,
  'JB023', null, 'transfer_on_non_scheduled_or_live_session_gets_JB023_even_for_host');
reset role;

-- ======== member_after_starts_at_gets_JB023_host_succeeds (S5) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000012-0043-0043-0043-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.transfer_participation('b4300012-0000-0000-0000-000000000000', '00000013-0043-0043-0043-000000000000') $$,
  'JB023', null, 'member_after_starts_at_gets_JB023_host_succeeds: member refused');
set local request.jwt.claims = '{"sub":"00000001-0043-0043-0043-000000000000","role":"authenticated"}';
select lives_ok(
  $$ select public.transfer_participation('b4300012-0000-0000-0000-000000000000', '00000013-0043-0043-0043-000000000000') $$,
  'member_after_starts_at_gets_JB023_host_succeeds: host succeeds');
reset role;

-- ======== premium_replacement_seat_is_not_bumped (S6) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000014-0043-0043-0043-000000000000","role":"authenticated"}';
select public.transfer_participation(
  'b4300014-0000-0000-0000-000000000000', '00000015-0043-0043-0043-000000000000');
set local request.jwt.claims = '{"sub":"00000016-0043-0043-0043-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a4300006-0000-0000-0000-000000000000')).status::text,
  'confirmed', 'premium_replacement_seat_is_not_bumped: premium registrant confirmed by bumping');
reset role;
select is(
  (select status::text from public.participants
    where session_id = 'a4300006-0000-0000-0000-000000000000'
      and user_id = '00000015-0043-0043-0043-000000000000'),
  'confirmed', 'premium_replacement_seat_is_not_bumped: replacement keeps the seat');
select is(
  (select status::text from public.participants where id = 'b4300017-0000-0000-0000-000000000000'),
  'waiting_list', 'premium_replacement_seat_is_not_bumped: the non-premium filler is bumped instead');

-- ======== replacement_cancel_later_does_not_refund_original (S7) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000018-0043-0043-0043-000000000000","role":"authenticated"}';
select public.transfer_participation(
  'b4300018-0000-0000-0000-000000000000', '00000019-0043-0043-0043-000000000000');
set local request.jwt.claims = '{"sub":"00000019-0043-0043-0043-000000000000","role":"authenticated"}';
select public.cancel_registration('a4300007-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.usage_state('b4300018-0000-0000-0000-000000000000'), 'live',
  'replacement_cancel_later_does_not_refund_original: original usage still consumed');
select is(
  (select count(*)::int from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a4300007-0000-0000-0000-000000000000'),
  1, 'replacement_cancel_later_does_not_refund_original: still exactly one usage row');

select * from finish();
rollback;
