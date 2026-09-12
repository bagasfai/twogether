-- Final whole-branch review fixes: F1 (checked_in_at/status invariant),
-- F3+F4 (promotion fires on every way a confirmed slot is freed), and the
-- re-review fixes (demotion self-reversion; checked_in_at on demotion).
begin;
select plan(10);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'p1@test.local'),
  ('aaaaaaaa-2222-2222-2222-222222222222', 'p2@test.local'),
  ('aaaaaaaa-3333-3333-3333-333333333333', 'p3@test.local'),
  ('aaaaaaaa-4444-4444-4444-444444444444', 'p4@test.local'),
  ('aaaaaaaa-5555-5555-5555-555555555555', 'p5@test.local'),
  ('aaaaaaaa-6666-6666-6666-666666666666', 'p6@test.local'),
  ('aaaaaaaa-7777-7777-7777-777777777777', 'p7@test.local'),
  ('aaaaaaaa-8888-8888-8888-888888888888', 'p8@test.local'),
  ('aaaaaaaa-9999-9999-9999-999999999999', 'p9@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

-- One-seat, one-waitlist-slot sessions: one per scenario, so the fixtures
-- cannot interact with each other's promotion trigger firing.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('11111111-0000-0000-0000-000000000001', 'F1 Session',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open'),
  ('11111111-0000-0000-0000-000000000002', 'F3 Demote Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open'),
  ('11111111-0000-0000-0000-000000000003', 'F4 Delete Session',
   now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open'),
  ('11111111-0000-0000-0000-000000000004', 'Demotion Checkin Session',
   now() + interval '4 days', now() + interval '4 days 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

-- Court + scheduled match for the demotion/checked_in_at/match_players
-- regression below.
insert into public.courts (id, session_id, court_number)
values ('bbbbbbbb-0000-0000-0000-000000000002',
        '11111111-0000-0000-0000-000000000004', 1);

insert into public.matches (id, session_id, court_id, status)
values ('dddddddd-0000-0000-0000-000000000001',
        '11111111-0000-0000-0000-000000000004',
        'bbbbbbbb-0000-0000-0000-000000000002', 'scheduled');

-- F1 fixture: P1 confirmed + checked in, P2 waiting, P3 already cancelled.
insert into public.participants (id, session_id, user_id, status, checked_in_at)
values
  ('cccccccc-1111-1111-1111-111111111111',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-1111-1111-111111111111', 'confirmed', now());
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('cccccccc-2222-2222-2222-222222222222',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-2222-2222-222222222222', 'waiting_list', now());
insert into public.participants (id, session_id, user_id, status, cancelled_at)
values
  ('cccccccc-3333-3333-3333-333333333333',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-3333-3333-3333-333333333333', 'cancelled', now());

-- F3 fixture: P4 confirmed, P5 waiting. P4's registered_at is set EARLIER
-- than P5's -- the normal case, since P4 registered first and that is
-- exactly why P4 (not P5) held the confirmed seat. This is the fixture
-- shape that catches self-reverting demotion: once demotion puts P4 at
-- status = 'waiting_list' alongside P5, promote_from_waitlist's
-- `order by registered_at, id` would pick P4 itself first (the earliest
-- registered_at of the two) unless the candidate query excludes the row
-- that fired the trigger.
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('cccccccc-4444-4444-4444-444444444444',
   '11111111-0000-0000-0000-000000000002',
   'aaaaaaaa-4444-4444-4444-444444444444', 'confirmed', now() - interval '2 hours');
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('cccccccc-5555-5555-5555-555555555555',
   '11111111-0000-0000-0000-000000000002',
   'aaaaaaaa-5555-5555-5555-555555555555', 'waiting_list', now() - interval '1 hour');

-- F4 fixture: P6 confirmed, P7 waiting.
insert into public.participants (id, session_id, user_id, status)
values
  ('cccccccc-6666-6666-6666-666666666666',
   '11111111-0000-0000-0000-000000000003',
   'aaaaaaaa-6666-6666-6666-666666666666', 'confirmed');
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('cccccccc-7777-7777-7777-777777777777',
   '11111111-0000-0000-0000-000000000003',
   'aaaaaaaa-7777-7777-7777-777777777777', 'waiting_list', now());

-- F1c fixture: P8 confirmed + checked in, P9 waiting.
insert into public.participants (id, session_id, user_id, status, checked_in_at)
values
  ('cccccccc-8888-8888-8888-888888888888',
   '11111111-0000-0000-0000-000000000004',
   'aaaaaaaa-8888-8888-8888-888888888888', 'confirmed', now());
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('cccccccc-9999-9999-9999-999999999999',
   '11111111-0000-0000-0000-000000000004',
   'aaaaaaaa-9999-9999-9999-999999999999', 'waiting_list', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- F1a: a host's plain UPDATE that cancels a checked-in participant (not one
-- of the RPCs, which is the whole point -- participants_update_host is
-- column- and status-unrestricted) must not leave checked_in_at set.
update public.participants
   set status = 'cancelled'
 where id = 'cccccccc-1111-1111-1111-111111111111';

select is(
  (select checked_in_at from public.participants
    where id = 'cccccccc-1111-1111-1111-111111111111'),
  null,
  'a host direct-UPDATE cancellation clears checked_in_at even without the RPC doing it by hand'
);

select is(
  (select status::text from public.participants
    where id = 'cccccccc-1111-1111-1111-111111111111'),
  'cancelled',
  'the direct-UPDATE cancellation itself still took effect'
);

-- Same UPDATE frees a confirmed slot, so F3+F4's widened promotion must
-- still fire for a plain cancelling UPDATE (this is the pre-existing path,
-- re-asserted here since it shares this fixture).
select is(
  (select status::text from public.participants
    where id = 'cccccccc-2222-2222-2222-222222222222'),
  'confirmed',
  'cancelling via direct host UPDATE still promotes the waitlisted participant'
);

-- F1b: setting checked_in_at on an already-cancelled row must not stick --
-- the BEFORE trigger fires on UPDATE too, not just on the transition into
-- 'cancelled'.
update public.participants
   set checked_in_at = now()
 where id = 'cccccccc-3333-3333-3333-333333333333';

select is(
  (select checked_in_at from public.participants
    where id = 'cccccccc-3333-3333-3333-333333333333'),
  null,
  'checking in an already-cancelled participant does not stick'
);

-- F3: demoting a confirmed participant to waiting_list must promote the
-- OTHER, longest-waiting participant -- not silently hand the seat straight
-- back to the demoted participant. Deliberately does NOT assert against
-- host_set_participant_status's own RETURNING value: that reflects the row
-- as of the UPDATE statement itself, before the AFTER ROW trigger's own
-- (possibly self-reverting) UPDATE to that same row runs -- asserting
-- against it would pass even with the self-reversion bug reintroduced.
-- Both assertions re-read the row from the table instead.
select public.host_set_participant_status(
  'cccccccc-4444-4444-4444-444444444444', 'waiting_list');

select is(
  (select status::text from public.participants
    where id = 'cccccccc-4444-4444-4444-444444444444'),
  'waiting_list',
  'the demoted participant (earliest registered_at) is not self-promoted back to confirmed'
);

select is(
  (select status::text from public.participants
    where id = 'cccccccc-5555-5555-5555-555555555555'),
  'confirmed',
  'demoting a confirmed participant promotes the other, longest-waiting participant instead'
);

-- F4: a host DELETEing a confirmed participant frees a slot exactly like a
-- cancellation does, and must promote someone too.
delete from public.participants
 where id = 'cccccccc-6666-6666-6666-666666666666';

select is(
  (select count(*)::int from public.participants
    where id = 'cccccccc-6666-6666-6666-666666666666'),
  0,
  'the host delete removed the confirmed participant'
);

select is(
  (select status::text from public.participants
    where id = 'cccccccc-7777-7777-7777-777777777777'),
  'confirmed',
  'deleting a confirmed participant promotes the waitlisted participant'
);

-- F1c (re-review fix): checked_in_at is only meaningful for a confirmed
-- participant. Demoting a checked-in, confirmed participant to
-- waiting_list must clear checked_in_at, not just clear it on a
-- transition to 'cancelled' -- otherwise guard_match_player (which only
-- checks checked_in_at is null plus session match) would still let a
-- waitlisted participant be added to a match.
select public.host_set_participant_status(
  'cccccccc-8888-8888-8888-888888888888', 'waiting_list');

select is(
  (select checked_in_at from public.participants
    where id = 'cccccccc-8888-8888-8888-888888888888'),
  null,
  'demoting a checked-in confirmed participant to waiting_list clears checked_in_at'
);

select throws_ok(
  $$ insert into public.match_players (match_id, participant_id, team)
     values ('dddddddd-0000-0000-0000-000000000001',
             'cccccccc-8888-8888-8888-888888888888', 1) $$,
  'JB005',
  null,
  'a demoted (no longer checked-in) participant cannot be added to a match'
);

select * from finish();
rollback;
