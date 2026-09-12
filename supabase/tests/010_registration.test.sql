begin;
select plan(21);

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

-- Seed a participant who is already waiting_list, timestamped a minute in
-- the past. This is fixture setup (raw insert as postgres), not a new
-- production write path: it exists because the whole test file runs
-- inside one wrapping transaction, and register_for_session's ordering
-- uses now(), which is frozen for the life of a Postgres transaction.
-- Registering this "prior" participant through a second live RPC call
-- would give it the identical now() as the next call below, which is
-- exactly the tie this fixture avoids -- see the report for detail.
set local role postgres;
set local request.jwt.claims = '';
insert into public.participants (session_id, user_id, status, registered_at)
values ('aaaaaaaa-0000-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777',
        'waiting_list', now() - interval '1 minute');

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';

select results_eq(
  $$ select status::text, waitlist_position from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000003') $$,
  $$ values ('waiting_list'::text, 2) $$,
  'a registrant past capacity is waitlisted at position 2, accounting for the earlier waitlisted participant'
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

select * from finish();
rollback;
