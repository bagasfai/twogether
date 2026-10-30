begin;
select plan(21);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('11111111-1111-1111-1111-111111111111', 'm1@test.local'),
  ('11111111-1111-1111-1111-111111111112', 'm2@test.local'),
  ('11111111-1111-1111-1111-111111111113', 'm3@test.local'),
  ('11111111-1111-1111-1111-111111111114', 'm4@test.local'),
  ('11111111-1111-1111-1111-111111111115', 'm5@test.local'),
  ('11111111-1111-1111-1111-111111111116', 'm6@test.local'),
  ('11111111-1111-1111-1111-111111111117', 'm7-notcheckedin@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled', 'open');

insert into public.courts (id, session_id, court_number) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 2),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 3);

insert into public.participants (id, session_id, user_id, status, checked_in_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111112', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111113', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111114', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111115', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111116', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111117', 'confirmed', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- create_match: happy path
select lives_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000001',
       array['dddddddd-0000-0000-0000-000000000001']::uuid[],
       array['dddddddd-0000-0000-0000-000000000002']::uuid[]) $$,
  'host can create a match between two checked-in players on an idle court'
);

select is(
  (select status::text from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'scheduled',
  'the new match is scheduled'
);

select is(
  (select count(*)::int from public.match_players mp
    join public.matches m on m.id = mp.match_id
   where m.court_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  2,
  'both players were inserted'
);

-- reservation race guard: the same court cannot take a second active match
select throws_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000001',
       array['dddddddd-0000-0000-0000-000000000003']::uuid[],
       array['dddddddd-0000-0000-0000-000000000004']::uuid[]) $$,
  'JB009',
  null,
  'a court already reserved by a scheduled match cannot be reserved again'
);

-- authorization: a non-host cannot create a match
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000002',
       array['dddddddd-0000-0000-0000-000000000003']::uuid[],
       array['dddddddd-0000-0000-0000-000000000004']::uuid[]) $$,
  'JB007',
  null,
  'a non-host cannot create a match'
);
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- checked-in guard fires through the RPC, and leaves no orphan match row
select throws_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000002',
       array['dddddddd-0000-0000-0000-000000000003']::uuid[],
       array['dddddddd-0000-0000-0000-000000000007']::uuid[]) $$,
  'JB005',
  null,
  'a non-checked-in participant cannot be added, even via the RPC'
);

select is(
  (select count(*)::int from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0,
  'the failed create_match call left no orphan match row on the court'
);

-- mismatched team sizes are rejected before any insert
select throws_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000002',
       array['dddddddd-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004']::uuid[],
       array['dddddddd-0000-0000-0000-000000000005']::uuid[]) $$,
  'JB005',
  null,
  'mismatched team sizes are rejected by the RPC, not just zod'
);

-- second, independent match on court 2 for the start/complete lifecycle
select lives_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000002',
       array['dddddddd-0000-0000-0000-000000000003']::uuid[],
       array['dddddddd-0000-0000-0000-000000000004']::uuid[]) $$,
  'host can create a second match on a different idle court'
);

-- authorization: a non-host cannot start a match
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.start_match((select id from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000002')) $$,
  'JB007',
  null,
  'a non-host cannot start a match'
);
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- start_match on court 1's match: flips both match and court atomically
select lives_ok(
  $$ select public.start_match((select id from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000001')) $$,
  'host can start a scheduled match'
);

select is(
  (select status::text from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'in_progress',
  'the match is now in progress'
);

select is(
  (select status::text from public.courts where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'in_use',
  'the court is now in use'
);

-- starting it again is rejected
select throws_ok(
  $$ select public.start_match((select id from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000001')) $$,
  'JB009',
  null,
  'starting an already in-progress match is rejected'
);

-- authorization: a non-host cannot complete a match
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.complete_match((select id from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000001')) $$,
  'JB007',
  null,
  'a non-host cannot complete a match'
);
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- complete_match: flips both match and court atomically
select lives_ok(
  $$ select public.complete_match((select id from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000001')) $$,
  'host can complete an in-progress match'
);

select is(
  (select status::text from public.matches where court_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'completed',
  'the match is now completed'
);

select is(
  (select status::text from public.courts where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'idle',
  'the court is idle again'
);

-- court-delete gap: a court with an active match cannot be deleted
select lives_ok(
  $$ select public.create_match('aaaaaaaa-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000003',
       array['dddddddd-0000-0000-0000-000000000005']::uuid[],
       array['dddddddd-0000-0000-0000-000000000006']::uuid[]) $$,
  'host can create a match on the third court'
);

select throws_ok(
  $$ delete from public.courts where id = 'bbbbbbbb-0000-0000-0000-000000000003' $$,
  'JB010',
  null,
  'a court with a scheduled match cannot be deleted'
);

update public.matches set status = 'cancelled'
 where court_id = 'bbbbbbbb-0000-0000-0000-000000000003';

select lives_ok(
  $$ delete from public.courts where id = 'bbbbbbbb-0000-0000-0000-000000000003' $$,
  'once the match is cancelled, the court can be deleted'
);

select * from finish();
rollback;
