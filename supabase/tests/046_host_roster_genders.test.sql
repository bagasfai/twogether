-- Covers 20261028000006_host_roster_genders.sql: a host reads roster gender
-- without participant consent, and nobody else does.

begin;
select plan(7);

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'hrg-member@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'hrg-host@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'hrg-added@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'hrg-otherhost@test.local'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'hrg-cancelled@test.local');

update public.profiles set role = 'host'
 where id in ('eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000004');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('eeeeeeee-1111-0000-0000-000000000001', 'Gender Read',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 8, 2, 'eeeeeeee-0000-0000-0000-000000000002',
   'scheduled', 'open');

update public.profiles_private set gender = 'male'
 where user_id = 'eeeeeeee-0000-0000-0000-000000000003';
update public.profiles_private set gender = 'female'
 where user_id = 'eeeeeeee-0000-0000-0000-000000000005';

set local role authenticated;

-- host adds a member (consent stays unset) and a second, then cancels the second
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}';
select public.host_add_participant('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000003', 'confirmed');
select public.host_add_participant('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000005', 'confirmed');
select public.host_set_participant_status(
  (select id from public.participants
    where session_id = 'eeeeeeee-1111-0000-0000-000000000001'
      and user_id = 'eeeeeeee-0000-0000-0000-000000000005'),
  'cancelled');

select is(
  (select consented_at from public.participants
    where session_id = 'eeeeeeee-1111-0000-0000-000000000001'
      and user_id = 'eeeeeeee-0000-0000-0000-000000000003'),
  null, 'precondition: host-added participant has no consent');

select results_eq(
  $$select user_id::text, gender::text from public.host_roster_genders('eeeeeeee-1111-0000-0000-000000000001')$$,
  $$values ('eeeeeeee-0000-0000-0000-000000000003', 'male')$$,
  'session host reads unconsented gender; cancelled participant excluded');

select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'eeeeeeee-0000-0000-0000-000000000003'),
  0, 'phone-bearing profiles_private row is still hidden from the host without consent');

-- a host of a different session is denied
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$select * from public.host_roster_genders('eeeeeeee-1111-0000-0000-000000000001')$$,
  '42501', null, 'host of another session is denied');

-- a plain member is denied
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select * from public.host_roster_genders('eeeeeeee-1111-0000-0000-000000000001')$$,
  '42501', null, 'plain member is denied');

-- no profile row at all fails closed
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-0000000000ff","role":"authenticated"}';
select throws_ok(
  $$select * from public.host_roster_genders('eeeeeeee-1111-0000-0000-000000000001')$$,
  '42501', null, 'caller with no profiles row is denied');

-- anon cannot execute
reset role;
set local role anon;
select throws_ok(
  $$select * from public.host_roster_genders('eeeeeeee-1111-0000-0000-000000000001')$$,
  '42501', null, 'anon cannot execute');

select * from finish();
rollback;
