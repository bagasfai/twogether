-- core-schema-follow-ups.md, "Should fix soon": a demoted participant kept
-- their original registered_at, so they could cut back in line ahead of
-- people who had been waiting on the actual waitlist longer. Fixed in
-- 20260917000003_demotion_queue_fairness.sql by re-stamping registered_at
-- to now() whenever host_set_participant_status moves someone into
-- waiting_list from anything else.
begin;
select plan(3);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('aaaaaaaa-1111-1111-1111-111111111111', 'p1@test.local'),
  ('aaaaaaaa-2222-2222-2222-222222222222', 'p2@test.local'),
  ('aaaaaaaa-3333-3333-3333-333333333333', 'p3@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('11111111-0000-0000-0000-000000000001', 'Fairness Session',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 1, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

-- P1 holds the single seat. P2 and P3 are already queued on the waitlist,
-- P2 having waited the longest.
insert into public.participants (id, session_id, user_id, status, registered_at)
values
  ('cccccccc-1111-1111-1111-111111111111',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-1111-1111-111111111111', 'confirmed', now() - interval '3 hours'),
  ('cccccccc-2222-2222-2222-222222222222',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-2222-2222-222222222222', 'waiting_list', now() - interval '2 hours'),
  ('cccccccc-3333-3333-3333-333333333333',
   '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-3333-3333-3333-333333333333', 'waiting_list', now() - interval '1 hour');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Host demotes P1. The trigger's own self-reversion guard means P2 (the
-- longest-waiting existing waiter) takes the freed seat, not P1.
select public.host_set_participant_status(
  'cccccccc-1111-1111-1111-111111111111', 'waiting_list');

select is(
  (select status::text from public.participants
    where id = 'cccccccc-2222-2222-2222-222222222222'),
  'confirmed',
  'demoting P1 promotes P2, the longest-waiting existing waiter'
);

-- The fairness fix itself: P1's registered_at must move to the back of the
-- queue (after P3, who was already waiting before P1 got demoted), not
-- keep its original, years-earlier confirmed-at timestamp.
select ok(
  (select registered_at from public.participants
    where id = 'cccccccc-1111-1111-1111-111111111111')
  >
  (select registered_at from public.participants
    where id = 'cccccccc-3333-3333-3333-333333333333'),
  'a demoted participant''s registered_at moves behind an existing waiter''s'
);

-- Now the seat P2 holds frees up again. The next promotion must go to P3
-- (waiting on the real waitlist since before P1's demotion), not to P1
-- (only just re-queued) -- proving the timestamp reset actually changes
-- promotion order, not just the stored value.
select public.host_set_participant_status(
  'cccccccc-2222-2222-2222-222222222222', 'cancelled');

select is(
  (select status::text from public.participants
    where id = 'cccccccc-3333-3333-3333-333333333333'),
  'confirmed',
  'P3, the longer-waiting participant, is promoted ahead of the just-demoted P1'
);

select * from finish();
rollback;
