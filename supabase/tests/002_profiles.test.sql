begin;
select plan(9);

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
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'JB004',
  null,
  'anon may not promote a profile to admin'
);

select * from finish();
rollback;
