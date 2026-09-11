begin;
select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'cohost@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'admin@test.local');

update public.profiles set role = 'admin'
 where id = '55555555-5555-5555-5555-555555555555';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Draft Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'draft'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Cancelled Session',
   now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'cancelled');

insert into public.session_hosts (session_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444', 'cohost');

set local role authenticated;

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'the owner is a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'the owner is the session owner');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'a cohost is a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), false,
          'a cohost is not the session owner');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(public.session_is_public('aaaaaaaa-0000-0000-0000-000000000002'), false,
          'a draft session is not public');

-- session_is_public must be proven true as well as false: a stub that
-- always returned false would pass every assertion above it.
select is(public.session_is_public('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'a scheduled session is public');
select is(public.session_is_public('aaaaaaaa-0000-0000-0000-000000000003'), false,
          'a cancelled session is not public');

-- an anon-role caller has a null auth.uid() (no "sub" claim). Empirically
-- prove this collapses to false rather than NULL, and that the nested
-- is_admin() call inside these functions does not raise a permission error
-- despite is_admin()'s own EXECUTE grant being authenticated-only.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), false,
          'anon is not a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), false,
          'anon is not a session owner');

-- Lock in the grant surface: EXECUTE for both anon and authenticated on all
-- three helpers. This is the one thing that intentionally differs from
-- Task 2's authenticated-only helpers, and nothing previously pinned it.
select ok(has_function_privilege('anon', 'public.is_session_host(uuid)', 'EXECUTE'),
          'anon has EXECUTE on is_session_host');
select ok(has_function_privilege('authenticated', 'public.is_session_host(uuid)', 'EXECUTE'),
          'authenticated has EXECUTE on is_session_host');
select ok(has_function_privilege('anon', 'public.is_session_owner(uuid)', 'EXECUTE'),
          'anon has EXECUTE on is_session_owner');
select ok(has_function_privilege('authenticated', 'public.is_session_owner(uuid)', 'EXECUTE'),
          'authenticated has EXECUTE on is_session_owner');
select ok(has_function_privilege('anon', 'public.session_is_public(uuid)', 'EXECUTE'),
          'anon has EXECUTE on session_is_public');
select ok(has_function_privilege('authenticated', 'public.session_is_public(uuid)', 'EXECUTE'),
          'authenticated has EXECUTE on session_is_public');

-- Exercise the `is_admin() or ...` short-circuit: an admin who is neither a
-- host nor owner of this session must still pass both checks.
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'an admin who is not a host is still a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'an admin who is not the owner is still a session owner');

select * from finish();
rollback;
