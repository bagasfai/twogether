-- Final whole-branch review fixes: F1 (checked_in_at/status invariant) and
-- F3+F4 (promotion fires on every way a confirmed slot is freed).
begin;
select plan(8);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'p1@test.local'),
  ('aaaaaaaa-2222-2222-2222-222222222222', 'p2@test.local'),
  ('aaaaaaaa-3333-3333-3333-333333333333', 'p3@test.local'),
  ('aaaaaaaa-4444-4444-4444-444444444444', 'p4@test.local'),
  ('aaaaaaaa-5555-5555-5555-555555555555', 'p5@test.local'),
  ('aaaaaaaa-6666-6666-6666-666666666666', 'p6@test.local'),
  ('aaaaaaaa-7777-7777-7777-777777777777', 'p7@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

-- Three one-seat, one-waitlist-slot sessions: one per scenario, so the
-- fixtures cannot interact with each other's promotion trigger firing.
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
   'scheduled', 'open');

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

-- F3 fixture: P4 confirmed, P5 waiting. P5's registered_at is set earlier
-- than P4's own registration so that, once demotion puts both rows at
-- status = 'waiting_list', promote_from_waitlist's
-- `order by registered_at, id` deterministically picks P5 rather than
-- tying (registered_at otherwise defaults to the same transaction-start
-- now() for both rows) and coincidentally handing the seat straight back
-- to P4.
insert into public.participants (id, session_id, user_id, status)
values
  ('cccccccc-4444-4444-4444-444444444444',
   '11111111-0000-0000-0000-000000000002',
   'aaaaaaaa-4444-4444-4444-444444444444', 'confirmed');
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

-- F3: demoting a confirmed participant to waiting_list must promote someone
-- -- host_set_participant_status is the demotion path, and prior to this
-- fix the promotion trigger's WHEN only matched a transition to 'cancelled'.
select is(
  (select status::text from public.host_set_participant_status(
     'cccccccc-4444-4444-4444-444444444444', 'waiting_list')),
  'waiting_list',
  'host_set_participant_status demotes the confirmed participant'
);

select is(
  (select status::text from public.participants
    where id = 'cccccccc-5555-5555-5555-555555555555'),
  'confirmed',
  'demoting a confirmed participant to waiting_list promotes the waitlisted participant'
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

select * from finish();
rollback;
