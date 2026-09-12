begin;
select plan(18);

select has_table('public', 'profiles_private', 'profiles_private table exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles_private'::regclass),
  true,
  'RLS is enabled on profiles_private'
);

select hasnt_column('public', 'profiles', 'phone', 'phone no longer lives on profiles');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pp-member@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'pp-other@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'pp-host@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'pp-otherhost@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'pp-admin@test.local');

select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'a profiles_private row is created alongside the profile'
);

update public.profiles set role = 'host'
 where id in ('aaaaaaaa-0000-0000-0000-000000000003',
              'aaaaaaaa-0000-0000-0000-000000000004');
update public.profiles set role = 'admin'
 where id = 'aaaaaaaa-0000-0000-0000-000000000005';

update public.profiles_private set phone = '+628111000001'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by,
   status, registration_state)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Hosted session',
   now() + interval '1 day', now() + interval '1 day 2 hours', 'GOR A', 8,
   'aaaaaaaa-0000-0000-0000-000000000003', 'scheduled', 'open'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Unrelated session',
   now() + interval '2 days', now() + interval '2 days 2 hours', 'GOR B', 8,
   'aaaaaaaa-0000-0000-0000-000000000004', 'scheduled', 'open');

-- direct insert: this test runs as the table owner, which bypasses RLS.
-- Application code must never do this (the RPCs are the only write path).
insert into public.participants (session_id, user_id, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'confirmed'),
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'cancelled');

set local role authenticated;

-- self
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select phone from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '+628111000001',
  'a member can read their own phone'
);
select lives_ok(
  $$ update public.profiles_private set phone = '+628111000099'
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'a member can update their own phone'
);
-- lives_ok only proves the statement didn't error -- a policy-filtered
-- UPDATE can affect zero rows and still "live". Confirm the value actually
-- changed, or a deleted/degenerate USING clause would pass the check above
-- for free.
select is(
  (select phone from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '+628111000099',
  'the self update actually landed'
);

-- the WITH CHECK half: a member may not reassign their row to someone
-- else's user_id. USING alone would already stop this (the target row is
-- still their own before the update), but WITH CHECK is what stops the new
-- row from landing under a different owner if USING were ever loosened to
-- something that still matches the caller's own row.
select throws_ok(
  $$ update public.profiles_private set user_id = 'aaaaaaaa-0000-0000-0000-000000000002'
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'a member cannot reassign their profiles_private row to another user'
);

-- another member
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'another member cannot read that phone'
);

-- host of a session the member is confirmed in
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'a host can read the phone of a participant in their session'
);

-- the grant is table-wide (`grant update ... to authenticated`), and this
-- host can already SELECT this participant's row -- so the SELECT policy
-- alone would not stop a write here. Only the UPDATE policy's own USING
-- clause (owner-only) does. Assert via a before/after read-back, since a
-- USING-excluded UPDATE silently matches zero rows instead of raising.
update public.profiles_private set phone = '+62900000000'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  (select phone from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '+628111000099',
  'a host cannot overwrite the phone of a participant in their session (the update silently no-ops)'
);

select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0,
  'a host cannot read the phone of a cancelled participant'
);

-- host of an unrelated session
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'a host of an unrelated session cannot read that phone'
);

-- admin
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'an admin can read any phone'
);

reset role;

select ok(
  not has_table_privilege('authenticated', 'public.profiles_private', 'insert'),
  'authenticated has no INSERT grant on profiles_private'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles_private', 'delete'),
  'authenticated has no DELETE grant on profiles_private'
);

select ok(
  not has_table_privilege('anon', 'public.profiles_private', 'select'),
  'anon has no SELECT grant on profiles_private'
);

select ok(
  not has_table_privilege('anon', 'public.profiles_private', 'insert'),
  'anon has no INSERT grant on profiles_private'
);

select * from finish();
rollback;
