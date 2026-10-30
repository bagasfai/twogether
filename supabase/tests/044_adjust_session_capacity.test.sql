-- Covers migration 20261028000005_adjust_session_capacity.sql.

begin;
select plan(46);

-- Users: 01 host; 02 member (non-host); 11..16 fillers; 21..23 waitlisters
-- (23 premium, registered last); 31..33 fillers for S7.
insert into auth.users (id, email)
select ('000000' || lpad(n::text, 2, '0') || '-0044-0044-0044-000000000000')::uuid,
       'u' || n || '-044@test.local'
  from generate_series(1, 40) n;

update public.profiles set role = 'host'
 where id = '00000001-0044-0044-0044-000000000000';

-- (id, kind, coaches, seats, status): max = coaches * seats, courts = coaches.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   court_count, kind, coach_count, seats_per_coach, created_by, status, registration_state)
select s.id::uuid, 'S', now() + interval '3 days', now() + interval '3 days 2 hours', 'GOR',
       coalesce(s.coaches * s.seats, 6), 10, coalesce(s.coaches, 1),
       s.kind::public.session_kind, s.coaches, s.seats,
       '00000001-0044-0044-0044-000000000000', s.status::public.session_status, 'open'
  from (values
    ('a4400001-0000-0000-0000-000000000000', 'drilling',  1, 6, 'scheduled'), -- S1 raise basics
    ('a4400002-0000-0000-0000-000000000000', 'drilling',  1, 6, 'scheduled'), -- S2 beyond waitlist
    ('a4400003-0000-0000-0000-000000000000', 'drilling',  1, 2, 'scheduled'), -- S3 premium first
    ('a4400004-0000-0000-0000-000000000000', 'drilling',  1, 2, 'scheduled'), -- S4 never bumps
    ('a4400005-0000-0000-0000-000000000000', 'drilling',  1, 6, 'live'),      -- S5 live
    ('a4400006-0000-0000-0000-000000000000', 'drilling',  1, 6, 'draft'),     -- S6 draft
    ('a4400007-0000-0000-0000-000000000000', 'drilling',  2, 6, 'scheduled'), -- S7 noop
    ('a4400008-0000-0000-0000-000000000000', 'drilling',  2, 2, 'scheduled'), -- S8 below confirmed
    ('a4400009-0000-0000-0000-000000000000', 'drilling',  3, 2, 'scheduled'), -- S9 lower removes courts
    ('a4400010-0000-0000-0000-000000000000', 'drilling',  2, 6, 'scheduled'), -- S10 busy court
    ('a4400011-0000-0000-0000-000000000000', 'open_play', null::int, null::int, 'scheduled'), -- S11 open play
    ('a4400012-0000-0000-0000-000000000000', 'drilling',  1, 6, 'completed'), -- S12
    ('a4400013-0000-0000-0000-000000000000', 'drilling',  1, 6, 'cancelled'), -- S13
    ('a4400014-0000-0000-0000-000000000000', 'drilling',  2, 2, 'scheduled'), -- S14 gapped courts
    ('a4400015-0000-0000-0000-000000000000', 'drilling',  2, 2, 'scheduled'), -- S15 JB024 boundary
    ('a4400016-0000-0000-0000-000000000000', 'drilling',  1, 2, 'draft')      -- S16 draft + waitlister
  ) as s(id, kind, coaches, seats, status);

insert into public.courts (session_id, court_number, status) values
  ('a4400001-0000-0000-0000-000000000000', 1, 'idle'),
  ('a4400009-0000-0000-0000-000000000000', 1, 'idle'),
  ('a4400009-0000-0000-0000-000000000000', 2, 'idle'),
  ('a4400009-0000-0000-0000-000000000000', 3, 'unavailable'),
  ('a4400010-0000-0000-0000-000000000000', 1, 'in_use'),
  ('a4400010-0000-0000-0000-000000000000', 2, 'in_use'),
  ('a4400014-0000-0000-0000-000000000000', 3, 'idle'),
  ('a4400014-0000-0000-0000-000000000000', 4, 'in_use');

insert into public.participants (session_id, user_id, status, registered_at) values
  ('a4400015-0000-0000-0000-000000000000', '00000031-0044-0044-0044-000000000000', 'confirmed', now() - interval '3 hours'),
  ('a4400015-0000-0000-0000-000000000000', '00000032-0044-0044-0044-000000000000', 'confirmed', now() - interval '2 hours'),
  ('a4400016-0000-0000-0000-000000000000', '00000021-0044-0044-0044-000000000000', 'waiting_list', now() - interval '3 hours');

-- S2: 6 confirmed + 3 waiting (premium registered last).
insert into public.participants (session_id, user_id, status, registered_at)
select 'a4400002-0000-0000-0000-000000000000',
       ('000000' || lpad(n::text, 2, '0') || '-0044-0044-0044-000000000000')::uuid,
       'confirmed', now() - interval '10 hours' + n * interval '1 minute'
  from generate_series(11, 16) n;
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at) values
  ('b4400021-0000-0000-0000-000000000000', 'a4400002-0000-0000-0000-000000000000', '00000021-0044-0044-0044-000000000000', 'waiting_list', false, now() - interval '5 hours'),
  ('b4400022-0000-0000-0000-000000000000', 'a4400002-0000-0000-0000-000000000000', '00000022-0044-0044-0044-000000000000', 'waiting_list', false, now() - interval '4 hours'),
  ('b4400023-0000-0000-0000-000000000000', 'a4400002-0000-0000-0000-000000000000', '00000023-0044-0044-0044-000000000000', 'waiting_list', true,  now() - interval '3 hours');

-- S3: 2 confirmed, 3 waiting (premium last); raise to 2 coaches = 4 seats.
insert into public.participants (session_id, user_id, status, registered_at) values
  ('a4400003-0000-0000-0000-000000000000', '00000011-0044-0044-0044-000000000000', 'confirmed', now() - interval '10 hours'),
  ('a4400003-0000-0000-0000-000000000000', '00000012-0044-0044-0044-000000000000', 'confirmed', now() - interval '9 hours');
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at) values
  ('b4400321-0000-0000-0000-000000000000', 'a4400003-0000-0000-0000-000000000000', '00000021-0044-0044-0044-000000000000', 'waiting_list', false, now() - interval '5 hours'),
  ('b4400322-0000-0000-0000-000000000000', 'a4400003-0000-0000-0000-000000000000', '00000022-0044-0044-0044-000000000000', 'waiting_list', false, now() - interval '4 hours'),
  ('b4400323-0000-0000-0000-000000000000', 'a4400003-0000-0000-0000-000000000000', '00000023-0044-0044-0044-000000000000', 'waiting_list', true,  now() - interval '3 hours');

-- S4: 2 non-premium confirmed, 1 premium waiting; raise must not bump.
insert into public.participants (session_id, user_id, status, registered_at) values
  ('a4400004-0000-0000-0000-000000000000', '00000011-0044-0044-0044-000000000000', 'confirmed', now() - interval '10 hours'),
  ('a4400004-0000-0000-0000-000000000000', '00000012-0044-0044-0044-000000000000', 'confirmed', now() - interval '9 hours');
insert into public.participants (session_id, user_id, status, is_premium, registered_at) values
  ('a4400004-0000-0000-0000-000000000000', '00000023-0044-0044-0044-000000000000', 'waiting_list', true, now() - interval '3 hours');

-- S5: live, 1 waiting. S7: noop, 1 waiting (seats are open but untouched).
insert into public.participants (session_id, user_id, status, registered_at) values
  ('a4400005-0000-0000-0000-000000000000', '00000021-0044-0044-0044-000000000000', 'waiting_list', now() - interval '3 hours'),
  ('a4400007-0000-0000-0000-000000000000', '00000021-0044-0044-0044-000000000000', 'waiting_list', now() - interval '3 hours');

-- S8: 2 coaches x 2 seats = 4, 3 confirmed; lowering to 1 coach = 2 < 3.
insert into public.participants (session_id, user_id, status, registered_at) values
  ('a4400008-0000-0000-0000-000000000000', '00000031-0044-0044-0044-000000000000', 'confirmed', now() - interval '3 hours'),
  ('a4400008-0000-0000-0000-000000000000', '00000032-0044-0044-0044-000000000000', 'confirmed', now() - interval '2 hours'),
  ('a4400008-0000-0000-0000-000000000000', '00000033-0044-0044-0044-000000000000', 'confirmed', now() - interval '1 hour');

-- S9: 1 confirmed, lower 3 -> 1 coach.
insert into public.participants (session_id, user_id, status, registered_at) values
  ('a4400009-0000-0000-0000-000000000000', '00000031-0044-0044-0044-000000000000', 'confirmed', now() - interval '3 hours');

-- ======== host calls ========
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0044-0044-0044-000000000000","role":"authenticated"}';

create temp table r1 on commit drop as
  select * from public.adjust_session_capacity('a4400001-0000-0000-0000-000000000000', 3);
grant all on r1 to public;

select is((select (coach_count, max_participants, court_count)::text from r1), '(3,18,3)',
  'raise_sets_max_participants_and_court_count_and_creates_courts: returned row');
select is(
  (select (coach_count, max_participants, court_count)::text from public.sessions
    where id = 'a4400001-0000-0000-0000-000000000000'),
  '(3,18,3)',
  'raise_sets_max_participants_and_court_count_and_creates_courts: stored row');
select is(
  (select array_agg(court_number order by court_number) from public.courts
    where session_id = 'a4400001-0000-0000-0000-000000000000'),
  array[1, 2, 3],
  'raise_sets_max_participants_and_court_count_and_creates_courts: courts 1..3');
select is(
  (select count(*)::int from public.courts
    where session_id = 'a4400001-0000-0000-0000-000000000000' and status = 'idle'),
  3, 'raise_sets_max_participants_and_court_count_and_creates_courts: all courts idle');

-- Review Focus 5: S2, raise 1 -> 2 coaches (12 seats), 3 waiting.
select public.adjust_session_capacity('a4400002-0000-0000-0000-000000000000', 2);
select is(
  (select count(*)::int from public.participants
    where session_id = 'a4400002-0000-0000-0000-000000000000' and status = 'confirmed'),
  9, 'raise_beyond_waitlist_length_leaves_seats_open: 9 confirmed');
select is(
  (select count(*)::int from public.participants
    where session_id = 'a4400002-0000-0000-0000-000000000000' and status = 'waiting_list'),
  0, 'raise_beyond_waitlist_length_leaves_seats_open: waitlist empty');
select is(
  (select max_participants from public.sessions where id = 'a4400002-0000-0000-0000-000000000000')
  - (select count(*)::int from public.participants
      where session_id = 'a4400002-0000-0000-0000-000000000000' and status = 'confirmed'),
  3, 'raise_beyond_waitlist_length_leaves_seats_open: 3 seats open, no error');
select is(
  (select status::text from public.participants where id = 'b4400023-0000-0000-0000-000000000000'),
  'confirmed', 'raise_beyond_waitlist_length_leaves_seats_open: premium waitlister confirmed');

-- S3: raise 1 -> 2 coaches (4 seats): 2 seats free, premium P then oldest W1.
select public.adjust_session_capacity('a4400003-0000-0000-0000-000000000000', 2);
select is(
  (select status::text from public.participants where id = 'b4400323-0000-0000-0000-000000000000'),
  'confirmed', 'raise_promotes_premium_first_then_oldest: premium registered last is promoted');
select is(
  (select status::text from public.participants where id = 'b4400321-0000-0000-0000-000000000000'),
  'confirmed', 'raise_promotes_premium_first_then_oldest: oldest non-premium promoted second');
select is(
  (select status::text from public.participants where id = 'b4400322-0000-0000-0000-000000000000'),
  'waiting_list', 'raise_promotes_premium_first_then_oldest: next non-premium stays waiting');
select is(
  (select count(*)::int from public.participants
    where session_id = 'a4400003-0000-0000-0000-000000000000' and status = 'confirmed'),
  4, 'raise_promotes_premium_first_then_oldest: session is full, loop stops');

-- S4: never bumps.
select public.adjust_session_capacity('a4400004-0000-0000-0000-000000000000', 2);
select is(
  (select count(*)::int from public.participants
    where session_id = 'a4400004-0000-0000-0000-000000000000'
      and (bumped_at is not null or status = 'cancelled')),
  0, 'raise_never_bumps_anyone: no bumped or cancelled rows');
reset role;
select is(
  (select count(*)::int from public.bump_notifications b
     join public.participants p on p.id = b.participant_id
    where p.session_id = 'a4400004-0000-0000-0000-000000000000'),
  0, 'raise_never_bumps_anyone: no bump notification');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0044-0044-0044-000000000000","role":"authenticated"}';
select is(
  (select count(*)::int from public.participants
    where session_id = 'a4400004-0000-0000-0000-000000000000' and status = 'confirmed'),
  3, 'raise_never_bumps_anyone: both original seats kept, premium waiter promoted');

-- S5 live, S6 draft.
select is(
  (select (max_participants, court_count)::text
     from public.adjust_session_capacity('a4400005-0000-0000-0000-000000000000', 2)),
  '(12,2)', 'raise_on_live_session_works: row updated');
select is(
  (select status::text from public.participants
    where session_id = 'a4400005-0000-0000-0000-000000000000'),
  'confirmed', 'raise_on_live_session_works: waitlister promoted');
select is(
  (select (max_participants, court_count)::text
     from public.adjust_session_capacity('a4400006-0000-0000-0000-000000000000', 4)),
  '(24,4)', 'raise_on_draft_session_works: row updated');
select is(
  (select count(*)::int from public.courts where session_id = 'a4400006-0000-0000-0000-000000000000'),
  4, 'raise_on_draft_session_works: courts created');

-- S7 noop.
select is(
  (select (coach_count, max_participants, court_count)::text
     from public.adjust_session_capacity('a4400007-0000-0000-0000-000000000000', 2)),
  '(2,12,2)', 'same_count_is_a_noop: returns the row');
select is(
  (select status::text from public.participants where session_id = 'a4400007-0000-0000-0000-000000000000'),
  'waiting_list', 'same_count_is_a_noop: waitlister untouched');
select is(
  (select count(*)::int from public.courts where session_id = 'a4400007-0000-0000-0000-000000000000'),
  0, 'same_count_is_a_noop: no courts created');

-- Raise with gapped court numbers {3,4}: court 4 is above the new count (3)
-- but a raise must never delete anything.
select is(
  (select coach_count from public.adjust_session_capacity('a4400014-0000-0000-0000-000000000000', 3)),
  3, 'raise_with_gapped_courts_keeps_busy_court_above_count: no error');
select is(
  (select status::text from public.courts
    where session_id = 'a4400014-0000-0000-0000-000000000000' and court_number = 4),
  'in_use', 'raise_with_gapped_courts_keeps_busy_court_above_count: court 4 survives');

-- JB024 boundary: lowering to exactly the confirmed count succeeds.
select is(
  (select max_participants from public.adjust_session_capacity('a4400015-0000-0000-0000-000000000000', 1)),
  2, 'lower_to_exactly_confirmed_count_succeeds');

-- Draft raise: waitlisted row is not promoted.
select public.adjust_session_capacity('a4400016-0000-0000-0000-000000000000', 2);
select is(
  (select status::text from public.participants where session_id = 'a4400016-0000-0000-0000-000000000000'),
  'waiting_list', 'raise_on_draft_session_does_not_promote');

-- S8 JB024.
select throws_ok(
  $$ select public.adjust_session_capacity('a4400008-0000-0000-0000-000000000000', 1) $$,
  'JB024', null, 'lower_below_confirmed_gets_JB024');
select is(
  (select (coach_count, max_participants)::text from public.sessions
    where id = 'a4400008-0000-0000-0000-000000000000'),
  '(2,4)', 'lower_below_confirmed_gets_JB024: session unchanged');

-- S9 lower: highest-numbered courts go, even a non-idle-but-not-busy? court 3 is
-- unavailable, so lowering must be refused first.
select throws_ok(
  $$ select public.adjust_session_capacity('a4400009-0000-0000-0000-000000000000', 1) $$,
  'JB025', null, 'lower_with_unavailable_removed_court_gets_JB025');
reset role;
update public.courts set status = 'idle'
 where session_id = 'a4400009-0000-0000-0000-000000000000' and court_number = 3;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0044-0044-0044-000000000000","role":"authenticated"}';
select is(
  (select (max_participants, court_count)::text
     from public.adjust_session_capacity('a4400009-0000-0000-0000-000000000000', 1)),
  '(2,1)', 'lower_removes_highest_numbered_idle_courts: row updated');
select is(
  (select array_agg(court_number) from public.courts
    where session_id = 'a4400009-0000-0000-0000-000000000000'),
  array[1], 'lower_removes_highest_numbered_idle_courts: only court 1 remains');

-- S10 busy removed court.
select throws_ok(
  $$ select public.adjust_session_capacity('a4400010-0000-0000-0000-000000000000', 1) $$,
  'JB025', null, 'lower_with_busy_removed_court_gets_JB025');
select is(
  (select (coach_count, max_participants, court_count)::text from public.sessions
    where id = 'a4400010-0000-0000-0000-000000000000'),
  '(2,12,2)', 'lower_with_busy_removed_court_gets_JB025: session unchanged');
select is(
  (select count(*)::int from public.courts where session_id = 'a4400010-0000-0000-0000-000000000000'),
  2, 'lower_with_busy_removed_court_gets_JB025: courts unchanged');

-- JB026.
select throws_ok(
  $$ select public.adjust_session_capacity('a4400011-0000-0000-0000-000000000000', 2) $$,
  'JB026', null, 'open_play_session_gets_JB026');
select throws_ok(
  $$ select public.adjust_session_capacity('a4400012-0000-0000-0000-000000000000', 2) $$,
  'JB026', null, 'completed_or_cancelled_session_gets_JB026: completed');
select throws_ok(
  $$ select public.adjust_session_capacity('a4400013-0000-0000-0000-000000000000', 2) $$,
  'JB026', null, 'completed_or_cancelled_session_gets_JB026: cancelled');

-- Input validation and lookup.
select throws_ok(
  $$ select public.adjust_session_capacity('a4400001-0000-0000-0000-000000000000', 0) $$,
  'JB011', null, 'coach_count_below_one_gets_JB011');
select throws_ok(
  $$ select public.adjust_session_capacity('a4400001-0000-0000-0000-000000000000', null) $$,
  'JB011', null, 'null_coach_count_gets_JB011');
select throws_ok(
  $$ select public.adjust_session_capacity(gen_random_uuid(), 2) $$,
  'JB008', null, 'unknown_session_gets_JB008');

-- ======== non-host ========
set local request.jwt.claims = '{"sub":"00000002-0044-0044-0044-000000000000","role":"authenticated"}';
select throws_ok(
  $$ select public.adjust_session_capacity('a4400001-0000-0000-0000-000000000000', 4) $$,
  'JB007', null, 'non_host_gets_JB007');
select throws_ok(
  $$ select public.adjust_session_capacity('a4400011-0000-0000-0000-000000000000', 4) $$,
  'JB007', null, 'non_host_on_open_play_gets_JB007_not_JB026');

-- ======== anon ========
-- No sub claim: auth.uid() is null.
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$ select public.adjust_session_capacity('a4400001-0000-0000-0000-000000000000', 4) $$,
  'JB004', null, 'anon_gets_JB004');
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select public.adjust_session_capacity('a4400001-0000-0000-0000-000000000000', 4) $$,
  '42501', null, 'anon_role_has_no_execute_privilege');
reset role;

-- Grant surface.
select is(
  has_function_privilege('anon', 'public.adjust_session_capacity(uuid, int)', 'execute'),
  false, 'grant surface: anon cannot execute');
select is(
  has_function_privilege('authenticated', 'public.adjust_session_capacity(uuid, int)', 'execute'),
  true, 'grant surface: authenticated can execute');

select * from finish();
rollback;
