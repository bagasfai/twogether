begin;
select plan(40);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'member2@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

-- one seat, one waitlist slot
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Closed Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 8, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'closed');

set local role authenticated;

-- first member takes the only seat
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select status::text from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001')),
  'confirmed',
  'the first registrant is confirmed'
);

select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB003',
  null,
  'registering twice raises JB003'
);

select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000002') $$,
  'JB001',
  null,
  'registering on a closed session raises JB001'
);

-- second member is waitlisted at position 1
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(
  (select status::text from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001')),
  'waiting_list',
  'the second registrant is waitlisted'
);

-- third would exceed max_participants + waitlist_capacity
set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'member3@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB002',
  null,
  'registering past both caps raises JB002'
);

-- the confirmed member cancels; the waitlisted member is promoted by trigger
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_registration('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'the confirmed member can cancel'
);

select is(
  (select status::text from public.participants
    where user_id = '44444444-4444-4444-4444-444444444444'),
  'confirmed',
  'the waitlisted member is promoted automatically on cancellation'
);

-- the host may exceed the cap manually
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select status::text from public.host_add_participant(
     'aaaaaaaa-0000-0000-0000-000000000001',
     '55555555-5555-5555-5555-555555555555',
     'confirmed')),
  'confirmed',
  'a host can add a participant beyond max_participants'
);

-- === GAP (a): an anon caller is rejected =========================

-- anon has no execute grant on these RPCs at all (Supabase's default
-- per-function grant to anon is explicitly revoked at the end of the
-- migration) -- calling as anon never even reaches the function body.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anon has no execute grant on register_for_session'
);
select throws_ok(
  $$ select public.cancel_registration('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anon has no execute grant on cancel_registration'
);

-- the internal auth.uid() is null guard, exercised independently of the
-- grant: an authenticated-role caller with no "sub" claim is turned away
-- by the guard inside the function, not merely by a missing privilege.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB004',
  null,
  'an authenticated caller with no sub claim (auth.uid() is null) is rejected by the guard'
);
select throws_ok(
  $$ select public.cancel_registration('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB004',
  null,
  'cancel_registration rejects a null auth.uid() caller via the same guard'
);

-- === GAP (b): positive coverage ===================================

set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'member4@test.local'),
  ('77777777-7777-7777-7777-777777777777', 'member5@test.local'),
  ('88888888-8888-8888-8888-888888888888', 'member6@test.local');

-- one seat, plenty of waitlist room, dedicated to the positive-coverage
-- assertions below so they don't depend on session 1's prior history
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Waitlist Order Test',
   now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 1, 5, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- host_add_participant stamps added_by with the acting host's id -- the
-- audit trail that makes an over-capacity add traceable
select is(
  (select added_by from public.host_add_participant(
     'aaaaaaaa-0000-0000-0000-000000000003',
     '66666666-6666-6666-6666-666666666666',
     'confirmed')),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'host_add_participant stamps added_by with the acting host id'
);

-- Two real, sequential RPC calls. register_for_session stamps registered_at
-- with clock_timestamp() (actual wall-clock time), not now() (frozen for
-- the whole transaction), so these two calls get distinct timestamps even
-- though the entire test file runs inside one wrapping transaction.
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select results_eq(
  $$ select status::text, waitlist_position from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000003') $$,
  $$ values ('waiting_list'::text, 1) $$,
  'the first overflow registrant is waitlisted at position 1'
);

set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
select results_eq(
  $$ select status::text, waitlist_position from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000003') $$,
  $$ values ('waiting_list'::text, 2) $$,
  'the second overflow registrant is waitlisted at position 2'
);

-- host_set_participant_status actually changes the participant's status,
-- not merely returns without error
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select status::text from public.host_set_participant_status(
     (select id from public.participants
        where session_id = 'aaaaaaaa-0000-0000-0000-000000000003'
          and user_id = '77777777-7777-7777-7777-777777777777'),
     'cancelled')),
  'cancelled',
  'host_set_participant_status returns the new status'
);
select is(
  (select status::text from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000003'
       and user_id = '77777777-7777-7777-7777-777777777777'),
  'cancelled',
  'host_set_participant_status persists the new status to the row'
);

-- === GAP (c): the promotion trigger fires per row, not per statement ===

set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999', 'member7@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member8@test.local'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'member9@test.local'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'member10@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Row Trigger Test',
   now() + interval '4 days', now() + interval '4 days 2 hours',
   'GOR Jakbar', 2, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000004', '99999999-9999-9999-9999-999999999999', 'confirmed') $$,
  'host seats the first of two confirmed participants'
);
select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'confirmed') $$,
  'host seats the second of two confirmed participants'
);
select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'waiting_list') $$,
  'host seats the first of two waitlisted participants'
);
select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000004', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'waiting_list') $$,
  'host seats the second of two waitlisted participants'
);

-- the host cancels both confirmed participants in a single UPDATE
-- statement; a row-level trigger promotes once per matching row (two
-- promotions), where a statement-level trigger would only promote one
update public.participants
   set status = 'cancelled', cancelled_at = now()
 where session_id = 'aaaaaaaa-0000-0000-0000-000000000004'
   and user_id in ('99999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
   and status = 'confirmed';

select is(
  (select count(*)::int from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000004'
       and status = 'confirmed'
       and user_id in ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd')),
  2,
  'cancelling two confirmed participants in one statement promotes two waitlisted participants (FOR EACH ROW)'
);

-- === GAP (d): the promotion tie-break is deterministic, not arbitrary ===

-- Two waitlisted participants with an IDENTICAL registered_at (forced by a
-- direct insert with an explicit literal timestamp, in the privileged
-- context) must still promote the same one every time: the trigger's
-- ORDER BY registered_at, id makes id the deterministic tie-break.
set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'member11@test.local'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'member12@test.local'),
  ('12121212-1212-1212-1212-121212121212', 'member13@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Tie Break Test',
   now() + interval '5 days', now() + interval '5 days 2 hours',
   'GOR Jakbar', 1, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

insert into public.participants (session_id, user_id, status, registered_at)
values ('aaaaaaaa-0000-0000-0000-000000000005', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'confirmed', now());

-- both waitlisted rows share the exact same registered_at; only id differs
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('00000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005',
   'ffffffff-ffff-ffff-ffff-ffffffffffff', 'waiting_list', '2026-01-01 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005',
   '12121212-1212-1212-1212-121212121212', 'waiting_list', '2026-01-01 00:00:00+00');

-- an admin's direct update (not the RPC) cancels the confirmed participant,
-- freeing the one seat and firing the promotion trigger
update public.participants
   set status = 'cancelled', cancelled_at = now()
 where session_id = 'aaaaaaaa-0000-0000-0000-000000000005'
   and user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
   and status = 'confirmed';

select is(
  (select user_id from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000005'
       and status = 'confirmed'),
  '12121212-1212-1212-1212-121212121212'::uuid,
  'a registered_at tie is broken deterministically by the lower participant id'
);

-- === GAP (e): the host RPC authorization guards have coverage =========

-- A regular, non-host member (44444444 is a member, not a host of session
-- 3) is turned away by is_session_host, for both host-only RPCs. Deleting
-- either check leaves every other assertion in this file green.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', 'confirmed') $$,
  'JB007',
  null,
  'a non-host cannot host_add_participant'
);
select throws_ok(
  $$ select public.host_set_participant_status(
       (select id from public.participants
          where session_id = 'aaaaaaaa-0000-0000-0000-000000000003'
            and user_id = '88888888-8888-8888-8888-888888888888'),
       'cancelled') $$,
  'JB007',
  null,
  'a non-host cannot host_set_participant_status'
);

-- === GAP (f): the trigger's capacity check has coverage (no promotion
-- while confirmed is still at or above max_participants) ============

set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'member14@test.local'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'member15@test.local'),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'member16@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000006', 'Over Capacity Test',
   now() + interval '6 days', now() + interval '6 days 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000006', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'confirmed') $$,
  'host seats the first confirmed participant'
);
select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000006', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'confirmed') $$,
  'host seats a second confirmed participant, pushing confirmed above max_participants (1)'
);
select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000006', 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'waiting_list') $$,
  'host seats a waitlisted participant'
);

-- cancel one of the two confirmed participants: confirmed drops from 2 to
-- 1, which is still not below max_participants (1), so nobody should be
-- promoted. In the original fixture (max 2, two cancelled, two waiting)
-- deleting this guard still promoted exactly 2 by coincidence -- here,
-- deleting it would incorrectly promote the waitlisted participant too.
update public.participants
   set status = 'cancelled', cancelled_at = now()
 where session_id = 'aaaaaaaa-0000-0000-0000-000000000006'
   and user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'
   and status = 'confirmed';

select is(
  (select status::text from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000006'
       and user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'),
  'waiting_list',
  'the waitlisted participant is NOT promoted while confirmed is still at max_participants'
);
select is(
  (select count(*)::int from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000006'
       and status = 'confirmed'),
  1,
  'confirmed count reflects exactly the one still-confirmed over-capacity participant'
);

-- === GAP (g): waitlist_position_of's tie-break, in isolation ===========

-- register_for_session's waitlist_position is a one-time return value
-- computed at insert time from the NEW row's own registered_at/id -- there
-- is no way to re-invoke that computation for a row that already exists,
-- and no deterministic way to make two live calls (each using
-- clock_timestamp()) tie on demand. waitlist_position_of() was extracted
-- from register_for_session specifically so this predicate is callable
-- with arbitrary, chosen (registered_at, id) pairs: this test seeds two
-- waiting_list rows with an IDENTICAL registered_at and confirms each
-- reports a DIFFERENT position (1 and 2, by id order) via the exact
-- function register_for_session calls -- not a copy of its logic.
-- Reverting waitlist_position_of to a plain `registered_at <` would make
-- both calls below report 1.
set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('30303030-3030-3030-3030-303030303030', 'member17@test.local'),
  ('40404040-4040-4040-4040-404040404040', 'member18@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000007', 'Position Tie Test',
   now() + interval '7 days', now() + interval '7 days 2 hours',
   'GOR Jakbar', 1, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

-- identical registered_at; only id differs (...0011 < ...0012). Distinct
-- from GAP (d)'s tie-break ids (...0001/...0002) -- same file, same
-- transaction, participant id is a primary key.
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('00000000-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000007',
   '30303030-3030-3030-3030-303030303030', 'waiting_list', '2026-02-01 00:00:00+00'),
  ('00000000-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000007',
   '40404040-4040-4040-4040-404040404040', 'waiting_list', '2026-02-01 00:00:00+00');

select is(
  public.waitlist_position_of('aaaaaaaa-0000-0000-0000-000000000007',
    '2026-02-01 00:00:00+00'::timestamptz, '00000000-0000-0000-0000-000000000011'),
  1,
  'the lower-id row in a registered_at tie reports position 1'
);
select is(
  public.waitlist_position_of('aaaaaaaa-0000-0000-0000-000000000007',
    '2026-02-01 00:00:00+00'::timestamptz, '00000000-0000-0000-0000-000000000012'),
  2,
  'the higher-id row in the same registered_at tie reports position 2, not the same number'
);

-- Lock in the grant surface: waitlist_position_of is deliberately NOT
-- security definer and has no EXECUTE grant for anon or authenticated. If
-- it were reachable directly (e.g. via PostgREST's /rpc/waitlist_position_of)
-- while still definer, it would read participants as the owner and bypass
-- participants_select_self_host_or_public entirely -- a session uuid and a
-- far-future timestamp would leak any session's waitlist size to anon.
-- Nothing before this pinned that it stays revoked.
select is(
  has_function_privilege('anon', 'public.waitlist_position_of(uuid, timestamptz, uuid)', 'EXECUTE'),
  false,
  'anon has no EXECUTE on waitlist_position_of'
);
select is(
  has_function_privilege('authenticated', 'public.waitlist_position_of(uuid, timestamptz, uuid)', 'EXECUTE'),
  false,
  'authenticated has no EXECUTE on waitlist_position_of'
);

-- === GAP (h): checked_in_at leaves the checked-in pool on cancellation,
-- and stays cleared through a re-registration =========================

set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('50505050-5050-5050-5050-505050505050', 'member19@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000008', 'Check-in Clear Test',
   now() + interval '8 days', now() + interval '8 days 2 hours',
   'GOR Jakbar', 2, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000008', '50505050-5050-5050-5050-505050505050', 'confirmed') $$,
  'host adds the participant (added_by is stamped, checked separately elsewhere)'
);

-- there is no dedicated check-in RPC yet; a host can already do this via a
-- plain UPDATE under the participants_update_host RLS policy
update public.participants
   set checked_in_at = now()
 where session_id = 'aaaaaaaa-0000-0000-0000-000000000008'
   and user_id = '50505050-5050-5050-5050-505050505050';

select isnt(
  (select checked_in_at from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000008'
       and user_id = '50505050-5050-5050-5050-505050505050'),
  null,
  'fixture: the participant is checked in'
);

set local request.jwt.claims = '{"sub":"50505050-5050-5050-5050-505050505050","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_registration('aaaaaaaa-0000-0000-0000-000000000008') $$,
  'the checked-in member cancels'
);
select is(
  (select checked_in_at from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000008'
       and user_id = '50505050-5050-5050-5050-505050505050'),
  null,
  'cancel_registration clears checked_in_at -- the checked-in pool is distinct from the registration list'
);

select lives_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000008') $$,
  'the member re-registers after cancelling (register_for_session''s own do-update branch)'
);
select results_eq(
  $$ select status::text, cancelled_at, added_by, checked_in_at
       from public.participants
      where session_id = 'aaaaaaaa-0000-0000-0000-000000000008'
        and user_id = '50505050-5050-5050-5050-505050505050' $$,
  $$ values ('confirmed'::text, null::timestamptz, null::uuid, null::timestamptz) $$,
  're-registering clears cancelled_at, added_by, and checked_in_at (the do-update branch that makes re-registration work at all, and keeps the checked-in pool distinct)'
);

select * from finish();
rollback;
