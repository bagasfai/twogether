begin;
select plan(15);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('11111111-1111-1111-1111-111111111111', 'm1@test.local'),
  ('11111111-1111-1111-1111-111111111112', 'm2@test.local'),
  ('11111111-1111-1111-1111-111111111113', 'm3@test.local'),
  ('11111111-1111-1111-1111-111111111114', 'm4@test.local'),
  ('11111111-1111-1111-1111-111111111115', 'm5-noname@test.local'),
  ('11111111-1111-1111-1111-111111111116', 'm6-cancelled@test.local'),
  ('11111111-1111-1111-1111-111111111117', 'm7-cancelled-played@test.local');

-- m5 keeps a null full_name on purpose.
update public.profiles set full_name = 'Ani'    where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Budi M' where id = '11111111-1111-1111-1111-111111111112';
update public.profiles set full_name = 'Cici'   where id = '11111111-1111-1111-1111-111111111113';
update public.profiles set full_name = 'Dedi'   where id = '11111111-1111-1111-1111-111111111114';
update public.profiles set full_name = 'Gina'   where id = '11111111-1111-1111-1111-111111111117';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Public Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled', 'open'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Draft Night',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'draft', 'closed');

-- p1..p5 members, p6 cancelled with no games, p7 cancelled with one completed game
-- (both cancelled below, after the match seed: match_players needs a checked-in player).
insert into public.participants (id, session_id, user_id, status, checked_in_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111112', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111113', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111114', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111115', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111116', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111117', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-0000000000d4', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111114', 'confirmed', now()),
  ('dddddddd-0000-0000-0000-0000000000d5', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111115', 'confirmed', now());

-- Two guests with the same name: one plays twice, one never plays.
insert into public.participants (id, session_id, user_id, guest_name, registered_by, status, checked_in_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Budi', '11111111-1111-1111-1111-111111111111', 'confirmed', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Budi', '11111111-1111-1111-1111-111111111111', 'confirmed', now());

insert into public.matches (id, session_id, status, completed_at) values
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'completed', now()),
  ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'completed', now()),
  ('ffffffff-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cancelled', null),
  ('ffffffff-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'in_progress', null),
  ('ffffffff-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'completed', now()),
  ('ffffffff-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002', 'completed', now());

insert into public.match_players (match_id, participant_id, team) values
  -- 1: p1,p2 vs p3,g1
  ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1),
  ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 1),
  ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', 2),
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 2),
  -- 2: p1,p3 vs p2,g1
  ('ffffffff-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 1),
  ('ffffffff-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000003', 1),
  ('ffffffff-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 2),
  ('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 2),
  -- 5 (before 4: p5 may not be added to a finished match while in an active one)
  -- cancelled participant p7 vs p5, completed
  ('ffffffff-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000007', 1),
  ('ffffffff-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000005', 2),
  -- 3 cancelled and 4 in_progress: p4 vs p5, must not count
  ('ffffffff-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004', 1),
  ('ffffffff-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000005', 2),
  ('ffffffff-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004', 1),
  ('ffffffff-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000005', 2),
  -- 6: draft session, m4 vs m5
  ('ffffffff-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-0000000000d4', 1),
  ('ffffffff-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-0000000000d5', 2);

update public.participants set status = 'cancelled'
 where id in ('dddddddd-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000007');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select columns_are(
  'public', 'session_games_played',
  array['participant_id', 'session_id', 'games_played'],
  'view exposes only participant, session and count (no level or gender)'
);

select is(
  (select games_played::int from public.session_games_played
    where participant_id = 'dddddddd-0000-0000-0000-000000000001'),
  2,
  'two completed matches count as two games'
);

select is(
  (select games_played::int from public.session_games_played
    where participant_id = 'dddddddd-0000-0000-0000-000000000004'),
  0,
  'cancelled and in_progress matches do not count'
);

select is(
  (select count(*)::int from public.session_games_played v
     join public.participants p on p.id = v.participant_id
    where p.guest_name = 'Budi'),
  2,
  'two guests with the same name stay separate rows'
);

select is(
  (select count(*)::int from public.session_games_played
    where participant_id = 'dddddddd-0000-0000-0000-000000000006'),
  0,
  'cancelled participant with no games has no row'
);

select is(
  (select games_played::int from public.session_games_played
    where participant_id = 'dddddddd-0000-0000-0000-000000000007'),
  1,
  'cancelled participant with a completed game still has a row'
);

select is(
  (select count(*)::int from public.session_games_played
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  8,
  'public session lists p1-p5, p7 and both guests'
);

select is(
  (select proargnames::text from pg_proc
    where proname = 'all_time_leaderboard' and pronamespace = 'public'::regnamespace),
  '{p_limit,full_name,games_played,is_me}',
  'leaderboard function returns only name, count and is_me'
);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111112","role":"authenticated"}';

select results_eq(
  $$ select full_name, games_played::int, is_me from public.all_time_leaderboard() $$,
  $$ values ('Ani'::text, 2, false), ('Budi M', 2, true), ('Cici', 2, false),
            ('Member', 2, false), ('Dedi', 1, false), ('Gina', 1, false) $$,
  'all-time board: members only, null name shown as Member, is_me only on caller'
);

select is(
  (select count(*)::int from public.all_time_leaderboard(2)),
  2,
  'p_limit caps the rows'
);

select is(
  (select count(*)::int from public.session_games_played
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'a non-host member sees no per-session counts even for a public session'
);

select is(
  (select count(*)::int from public.session_games_played
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000002' and games_played > 0),
  0,
  'a member cannot see game counts of a draft session'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.session_games_played
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000002' and games_played > 0),
  2,
  'the session host does see them'
);

set local role anon;
select throws_ok(
  $$ select * from public.session_games_played $$,
  '42501',
  null,
  'anon cannot read the per-session view'
);

select throws_ok(
  $$ select * from public.all_time_leaderboard() $$,
  '42501',
  null,
  'anon cannot call the all-time leaderboard'
);

select * from finish();
rollback;
