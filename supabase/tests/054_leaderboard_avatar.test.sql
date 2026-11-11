begin;
select plan(6);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('11111111-1111-1111-1111-111111111111', 'm1@test.local'),
  ('11111111-1111-1111-1111-111111111112', 'm2@test.local');

update public.profiles set full_name = 'Ani', avatar_url = 'https://example.test/a/ani.webp'
 where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set full_name = 'Budi', avatar_url = null
 where id = '11111111-1111-1111-1111-111111111112';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Public Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled', 'open');

insert into public.participants (id, session_id, user_id, guest_name, registered_by, status, checked_in_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', null, null, 'confirmed', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111112', null, null, 'confirmed', now()),
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'Tamu', '11111111-1111-1111-1111-111111111111', 'confirmed', now());

insert into public.matches (id, session_id, status, completed_at) values
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'completed', now());

insert into public.match_players (match_id, participant_id, team) values
  ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1),
  ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 2),
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 2);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111112","role":"authenticated"}';

select is(
  (select proargnames::text from pg_proc
    where proname = 'all_time_leaderboard' and pronamespace = 'public'::regnamespace),
  '{p_limit,full_name,avatar_url,games_played,is_me}',
  'leaderboard function returns name, avatar_url, count and is_me'
);

select results_eq(
  $$ select full_name, avatar_url, games_played::int, is_me from public.all_time_leaderboard() $$,
  $$ values ('Ani'::text, 'https://example.test/a/ani.webp'::text, 1, false),
            ('Budi', null::text, 1, true) $$,
  'avatar_url returned per member, null when unset, guests excluded'
);

select is(
  (select avatar_url from public.all_time_leaderboard() where full_name = 'Ani'),
  'https://example.test/a/ani.webp',
  'member with an avatar gets the url'
);

select is(
  (select avatar_url from public.all_time_leaderboard() where full_name = 'Budi'),
  null,
  'member without an avatar gets null'
);

select lives_ok(
  $$ select * from public.all_time_leaderboard() $$,
  'authenticated can call the leaderboard'
);

set local role anon;
select throws_ok(
  $$ select * from public.all_time_leaderboard() $$,
  '42501',
  null,
  'anon cannot call the leaderboard'
);

select * from finish();
rollback;
