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
-- the role-change guard, even though Supabase's default privileges grant
-- UPDATE on public.profiles to anon.
--
-- Since Task 8, RLS on profiles has no anon-targeted UPDATE policy, so the
-- anon UPDATE now matches zero rows and returns quietly instead of ever
-- reaching the trigger. The property under test ("an anonymous caller
-- cannot change anybody's role") still holds; the enforcing layer is now
-- RLS instead of the trigger, so the assertion is on outcome, not SQLSTATE.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select lives_ok(
  $$ update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'an anon role change is filtered by RLS rather than erroring'
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
-- connection). Same outcome-based assertion: RLS filters the anon caller's
-- update to zero rows regardless of whether jwt.claims is set at all.
set local role anon;
reset request.jwt.claims;

select lives_ok(
  $$ update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'an anon caller with no jwt.claims set is filtered by RLS rather than erroring'
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
