begin;
select plan(21);

select has_table('public', 'guest_attributes', 'guest_attributes table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.guest_attributes'::regclass),
  true, 'RLS is enabled on guest_attributes');

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'ga-member@test.local'),
  ('dddddddd-0000-0000-0000-000000000002', 'ga-host@test.local'),
  ('dddddddd-0000-0000-0000-000000000003', 'ga-admin@test.local'),
  ('dddddddd-0000-0000-0000-000000000004', 'ga-otherhost@test.local'),
  ('dddddddd-0000-0000-0000-000000000005', 'ga-bystander@test.local');

update public.profiles set role = 'host'  where id in
  ('dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004');
update public.profiles set role = 'admin' where id = 'dddddddd-0000-0000-0000-000000000003';

-- s1 private (draft), s2 public (scheduled), s3 other host's session
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('dddddddd-1000-0000-0000-000000000001', 'Private', now() + interval '1 day',
   now() + interval '1 day 2 hours', 'GOR', 8, 2,
   'dddddddd-0000-0000-0000-000000000002', 'draft', 'closed'),
  ('dddddddd-1000-0000-0000-000000000002', 'Public', now() + interval '2 days',
   now() + interval '2 days 2 hours', 'GOR', 8, 2,
   'dddddddd-0000-0000-0000-000000000002', 'scheduled', 'open'),
  ('dddddddd-1000-0000-0000-000000000003', 'Other', now() + interval '3 days',
   now() + interval '3 days 2 hours', 'GOR', 8, 2,
   'dddddddd-0000-0000-0000-000000000004', 'scheduled', 'open');

insert into public.session_hosts (session_id, user_id, role) values
  ('dddddddd-1000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'owner'),
  ('dddddddd-1000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 'owner'),
  ('dddddddd-1000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004', 'owner')
on conflict do nothing;

-- participants (as owner): guests brought by member in private + public; guest in other session; member row
insert into public.participants (id, session_id, user_id, guest_name, registered_by, status) values
  ('dddddddd-2000-0000-0000-000000000001', 'dddddddd-1000-0000-0000-000000000001', null, 'Guest Priv',
   'dddddddd-0000-0000-0000-000000000001', 'confirmed'),
  ('dddddddd-2000-0000-0000-000000000002', 'dddddddd-1000-0000-0000-000000000002', null, 'Guest Pub',
   'dddddddd-0000-0000-0000-000000000001', 'confirmed'),
  ('dddddddd-2000-0000-0000-000000000003', 'dddddddd-1000-0000-0000-000000000003', null, 'Guest Other',
   'dddddddd-0000-0000-0000-000000000001', 'confirmed'),
  ('dddddddd-2000-0000-0000-000000000004', 'dddddddd-1000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000005', null, null, 'confirmed');

-- seeded as owner (bypasses RLS)
insert into public.guest_attributes (participant_id, gender, level) values
  ('dddddddd-2000-0000-0000-000000000001', 'male', 'novice'),
  ('dddddddd-2000-0000-0000-000000000002', 'female', 'advanced');

select is(has_table_privilege('anon', 'public.guest_attributes', 'select'), false, 'anon has no select');
select is(has_table_privilege('authenticated', 'public.guest_attributes', 'delete'), false, 'no delete grant');
select is(has_column_privilege('authenticated', 'public.guest_attributes', 'participant_id', 'update'),
  false, 'participant_id is not updatable');

set local role authenticated;

-- (c) bringer sees zero, private and public; guests are visible to them via participants (non-vacuous)
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.participants
            where id in ('dddddddd-2000-0000-0000-000000000001','dddddddd-2000-0000-0000-000000000002')), 2,
  'bringer can see own guest participant rows (premise)');
select is((select count(*)::int from public.guest_attributes
            where participant_id = 'dddddddd-2000-0000-0000-000000000001'), 0,
  'bringer sees zero attributes, private session');
select is((select count(*)::int from public.guest_attributes
            where participant_id = 'dddddddd-2000-0000-0000-000000000002'), 0,
  'bringer sees zero attributes, public session');
select throws_ok(
  $$insert into public.guest_attributes (participant_id, gender) values ('dddddddd-2000-0000-0000-000000000003','male')$$,
  '42501', null, 'bringer cannot insert');

-- plain member in public session
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000005","role":"authenticated"}';
select is((select count(*)::int from public.guest_attributes), 0, 'plain member sees zero rows');

-- (a) host
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.guest_attributes
            where participant_id in ('dddddddd-2000-0000-0000-000000000001','dddddddd-2000-0000-0000-000000000002')), 2, 'host sees both attributes in own sessions');
select throws_ok(
  $$insert into public.guest_attributes (participant_id, gender) values ('dddddddd-2000-0000-0000-000000000003','male')$$,
  '42501', null, 'host cannot insert for another session''s guest');
select lives_ok(
  $$update public.guest_attributes set level = 'intermediate'
    where participant_id = 'dddddddd-2000-0000-0000-000000000001'$$, 'host can update');
select is((select level::text from public.guest_attributes
            where participant_id = 'dddddddd-2000-0000-0000-000000000001'),
  'intermediate', 'host update took effect');
select throws_ok(
  $$insert into public.guest_attributes (participant_id, gender) values ('dddddddd-2000-0000-0000-000000000004','male')$$,
  '23514', null, 'host insert for member participant fails (guest-only trigger)');
select throws_ok(
  $$insert into public.guest_attributes (participant_id, gender) values ('dddddddd-2999-0000-0000-000000000009','male')$$,
  '23514', null, 'insert for nonexistent participant denied (trigger; RLS exists-check also fails closed)');
select throws_ok(
  $$update public.guest_attributes set participant_id = 'dddddddd-2000-0000-0000-000000000004'
    where participant_id = 'dddddddd-2000-0000-0000-000000000001'$$,
  '42501', null, 'host cannot repoint participant_id (column grant)');

-- (b) other session's host
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.guest_attributes), 0, 'other host sees zero rows');
select throws_ok(
  $$insert into public.guest_attributes (participant_id, gender) values ('dddddddd-2000-0000-0000-000000000001','male')$$,
  '42501', null, 'other host insert denied');

-- admin
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.guest_attributes
            where participant_id in ('dddddddd-2000-0000-0000-000000000001','dddddddd-2000-0000-0000-000000000002')), 2, 'admin selects all seeded rows');

-- (d) cascade
reset role;
delete from public.participants where id = 'dddddddd-2000-0000-0000-000000000002';
select is((select count(*)::int from public.guest_attributes
            where participant_id = 'dddddddd-2000-0000-0000-000000000002'), 0,
  'deleting participant cascades to attributes');

select * from finish();
rollback;
