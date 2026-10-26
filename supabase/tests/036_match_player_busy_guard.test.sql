begin;
select plan(6);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('11111111-1111-1111-1111-111111111111', 'm1@test.local'),
  ('11111111-1111-1111-1111-111111111112', 'm2@test.local'),
  ('11111111-1111-1111-1111-111111111113', 'm3@test.local'),
  ('11111111-1111-1111-1111-111111111114', 'm4@test.local'),
  ('11111111-1111-1111-1111-111111111115', 'm5@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled', 'open');

insert into public.courts (id, session_id, court_number) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 2);

insert into public.participants (id, session_id, user_id, status, checked_in_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111112', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111113', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111114', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111115', 'confirmed', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000001',
       array['dddddddd-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002']::uuid[],
       array['dddddddd-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004']::uuid[]) $$,
  'first match for four players is created'
);

select throws_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000002',
       array['dddddddd-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000005']::uuid[],
       array['dddddddd-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000003']::uuid[]) $$,
  'JB017',
  'participant is already in an active match',
  'a player in a scheduled match cannot join a second match'
);

select is(
  (select count(*)::int from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0,
  'the rejected match left nothing behind on court 2'
);

update public.matches set status = 'cancelled' where court_id = 'bbbbbbbb-0000-0000-0000-000000000001';

select lives_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000002',
       array['dddddddd-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000005']::uuid[],
       array['dddddddd-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000003']::uuid[]) $$,
  'after the first match is cancelled the same players can be placed again'
);

update public.matches set status = 'completed', completed_at = now() where court_id = 'bbbbbbbb-0000-0000-0000-000000000002';

select lives_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000001',
       array['dddddddd-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000005']::uuid[],
       array['dddddddd-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000003']::uuid[]) $$,
  'after a match completes the players can be placed again'
);

-- A no-op update of an existing row must not trip the guard on itself.
select lives_ok(
  $$ update public.match_players set team = team
      where match_id = (select id from public.matches where status = 'scheduled' limit 1) $$,
  'updating a match_players row does not conflict with its own match'
);

select * from finish();
rollback;
