begin;
select plan(12);

select has_table('public', 'profiles', 'profiles table exists');
select col_type_is('public', 'profiles', 'role', 'user_role', 'role is user_role');
select col_has_default('public', 'profiles', 'role', 'role has a default');

-- the auth.users trigger creates a profile automatically
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

select is(
  (select count(*)::int from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'profile row is created on auth.users insert'
);

update public.profiles set role = 'admin'
 where id = '33333333-3333-3333-3333-333333333333';

-- a member may edit their own name
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ update public.profiles set full_name = 'Member One'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'member may edit their own profile'
);

select throws_ok(
  $$ update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'JB004',
  null,
  'member may not promote themselves'
);

select is(public.is_admin(), false, 'is_admin() is false for a member');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(public.is_admin(), true, 'is_admin() is true for an admin');

-- regression: an anon-role caller has a null auth.uid() (no "sub" claim)
-- but still holds a real PostgREST JWT, so it must NOT be exempt from
-- the role-change guard.
--
-- Since Task 8 fix round 2, this migration REVOKEs the default privileges
-- Supabase grants anon on public.profiles and grants back only select,
-- update, delete to authenticated (not anon). So anon now has no UPDATE
-- privilege on profiles at all, and the write is refused at the grant
-- layer (42501) before RLS or the trigger are ever reached. The property
-- under test ("an anonymous caller cannot change anybody's role") still
-- holds either way; assert both the refusal and, via a privileged
-- read-back, that the role truly did not change.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'anon has no grant to update profiles at all'
);

set local role postgres;
set local request.jwt.claims = '';

select is(
  (select role::text from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'member',
  'the anon caller could not change the role'
);

-- regression: PostgREST issues `set local role anon` even on a request
-- that carries no decodable token, so request.jwt.claims can be entirely
-- unset while the session is still acting as anon (not a direct
-- connection). Same outcome: the grant-layer refusal doesn't depend on
-- jwt.claims being set at all.
set local role anon;
reset request.jwt.claims;

select throws_ok(
  $$ update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'anon with no jwt.claims set still has no grant to update profiles'
);

set local role postgres;
set local request.jwt.claims = '';

select is(
  (select role::text from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'member',
  'the anon caller with no jwt.claims set could not change the role'
);

select * from finish();
rollback;
