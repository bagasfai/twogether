begin;
select plan(9);

select has_column('public', 'profiles_private', 'gender', 'profiles_private.gender exists');

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'mg-member@test.local'),
  ('dddddddd-0000-0000-0000-000000000002', 'mg-host@test.local'),
  ('dddddddd-0000-0000-0000-000000000003', 'mg-other@test.local'),
  ('dddddddd-0000-0000-0000-000000000004', 'mg-norow@test.local');

update public.profiles set role = 'host' where id = 'dddddddd-0000-0000-0000-000000000002';

-- seeded as table owner (bypasses RLS); other member's row exists with a known value
update public.profiles_private set gender = 'male'
  where user_id = 'dddddddd-0000-0000-0000-000000000003';
-- user with no profiles_private row (handle_new_user created one; remove it)
delete from public.profiles_private where user_id = 'dddddddd-0000-0000-0000-000000000004';

set local role authenticated;

-- (a) member updates own gender
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$update public.profiles_private set gender = 'female'
    where user_id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'member can update own gender');
select is(
  (select gender::text from public.profiles_private
    where user_id = 'dddddddd-0000-0000-0000-000000000001'),
  'female', 'own gender update took effect');

-- (b) member cannot change another member's gender (RLS filters row, 0 rows)
update public.profiles_private set gender = 'female'
  where user_id = 'dddddddd-0000-0000-0000-000000000003';
reset role;
select is(
  (select gender::text from public.profiles_private
    where user_id = 'dddddddd-0000-0000-0000-000000000003'),
  'male', 'member direct update of another member gender changed nothing');
set local role authenticated;

-- (d) plain member calling the RPC
select throws_ok(
  $$select public.host_set_member_gender('dddddddd-0000-0000-0000-000000000003', 'female')$$,
  '42501', null, 'plain member cannot call host_set_member_gender');

-- (c) host sets value, (e) host creates missing row
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.host_set_member_gender('dddddddd-0000-0000-0000-000000000003', 'female')$$,
  'host can call host_set_member_gender');
select lives_ok(
  $$select public.host_set_member_gender('dddddddd-0000-0000-0000-000000000004', 'male')$$,
  'host can set gender for user without row');

reset role;
select is(
  (select gender::text from public.profiles_private
    where user_id = 'dddddddd-0000-0000-0000-000000000003'),
  'female', 'host rpc set other member gender');
select is(
  (select gender::text from public.profiles_private
    where user_id = 'dddddddd-0000-0000-0000-000000000004'),
  'male', 'rpc inserted missing profiles_private row');

select * from finish();
rollback;
