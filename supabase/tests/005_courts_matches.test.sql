begin;
select plan(5);

select has_table('public', 'courts', 'courts table exists');
select has_table('public', 'matches', 'matches table exists');
select has_table('public', 'match_players', 'match_players table exists');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222');

insert into public.courts (id, session_id, court_number)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 1);

insert into public.matches (id, session_id, court_id)
values ('cccccccc-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.participants (id, session_id, user_id, status)
values ('dddddddd-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed');

select throws_ok(
  $$ insert into public.match_players (match_id, participant_id, team)
     values ('cccccccc-0000-0000-0000-000000000001',
             'dddddddd-0000-0000-0000-000000000001', 1) $$,
  'JB005',
  null,
  'a participant who is not checked in cannot be put on a court'
);

update public.participants set checked_in_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000001';

select lives_ok(
  $$ insert into public.match_players (match_id, participant_id, team)
     values ('cccccccc-0000-0000-0000-000000000001',
             'dddddddd-0000-0000-0000-000000000001', 1) $$,
  'a checked-in participant can be put on a court'
);

select * from finish();
rollback;
