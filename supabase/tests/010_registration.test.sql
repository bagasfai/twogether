begin;
select plan(8);

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

select * from finish();
rollback;
