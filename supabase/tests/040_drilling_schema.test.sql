begin;
select plan(13);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('11111111-1111-1111-1111-111111111111', 'm1@test.local');

-- Open-play session with a participant, and an empty one.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Has rows',
   now() + interval '1 day', now() + interval '1 day 2 hours', 'GOR', 8,
   '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Empty',
   now() + interval '1 day', now() + interval '1 day 2 hours', 'GOR', 8,
   '22222222-2222-2222-2222-222222222222');

insert into public.participants (id, session_id, user_id, status) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'cancelled');

select is((select kind::text from public.sessions where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'open_play', 'kind defaults to open_play');

select throws_ok(
  $$ insert into public.sessions (title, starts_at, ends_at, location, max_participants, court_count, kind, created_by)
     values ('d', now(), now() + interval '1 hour', 'GOR', 12, 2, 'drilling', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'drilling_requires_coach_and_seats');

select throws_ok(
  $$ insert into public.sessions (title, starts_at, ends_at, location, max_participants, coach_count, seats_per_coach, created_by)
     values ('o', now(), now() + interval '1 hour', 'GOR', 12, 2, 6, '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'open_play_rejects_coach_columns');

select throws_ok(
  $$ insert into public.sessions (title, starts_at, ends_at, location, max_participants, court_count, coach_count, seats_per_coach, kind, created_by)
     values ('d', now(), now() + interval '1 hour', 'GOR', 11, 2, 2, 6, 'drilling', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'drilling max_participants must equal coaches * seats');

select throws_ok(
  $$ insert into public.sessions (title, starts_at, ends_at, location, max_participants, court_count, coach_count, seats_per_coach, kind, created_by)
     values ('d', now(), now() + interval '1 hour', 'GOR', 12, 1, 2, 6, 'drilling', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'drilling court_count must equal coaches');

select lives_ok(
  $$ insert into public.sessions (title, starts_at, ends_at, location, max_participants, court_count, coach_count, seats_per_coach, kind, created_by)
     values ('d', now(), now() + interval '1 hour', 'GOR', 12, 2, 2, 6, 'drilling', '22222222-2222-2222-2222-222222222222') $$,
  'drilling_capacity_is_derived: 12 seats and 2 courts succeed');

select throws_ok(
  $$ update public.sessions set premium_surcharge_idr = -1 where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '23514', null, 'surcharge_not_negative');

select throws_ok(
  $$ update public.sessions set premium_surcharge_idr = 25000 where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '23514', null, 'open_play_rejects_surcharge');

select lives_ok(
  $$ insert into public.sessions (title, starts_at, ends_at, location, max_participants, court_count, coach_count, seats_per_coach, kind, premium_surcharge_idr, created_by)
     values ('d', now(), now() + interval '1 hour', 'GOR', 12, 2, 2, 6, 'drilling', 25000, '22222222-2222-2222-2222-222222222222') $$,
  'drilling_accepts_surcharge');

select throws_ok(
  $$ update public.sessions set kind = 'drilling', coach_count = 1, seats_per_coach = 8, court_count = 1
     where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'JB020', null, 'kind_change_blocked_with_participant_row (cancelled row counts)');

select lives_ok(
  $$ update public.sessions set kind = 'drilling', coach_count = 1, seats_per_coach = 8, court_count = 1
     where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'kind_change_allowed_on_empty_session');

select is(
  has_column_privilege('authenticated', 'public.participants', 'replaced_by', 'update'),
  false, 'authenticated cannot update replaced_by');

select is(
  has_column_privilege('authenticated', 'public.participants', 'paid_by_user_id', 'update'),
  false, 'authenticated cannot update paid_by_user_id');

select * from finish();
rollback;
