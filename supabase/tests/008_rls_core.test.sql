begin;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'cohost@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'other-cohost@test.local');

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
        '33333333-3333-3333-3333-333333333333', 'cohost');

insert into public.participants (session_id, user_id, status, cancelled_at)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed', null),
       ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'cancelled', now());

select ok(
  (select relrowsecurity from pg_class where oid = 'public.participants'::regclass),
  'RLS is enabled on participants'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.sessions),
  1,
  'a member sees the scheduled session but not the draft'
);

select throws_ok(
  $$ insert into public.participants (session_id, user_id, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'confirmed') $$,
  '42501',
  null,
  'a member cannot insert into participants directly'
);

-- the host's cancelled row exists (inserted above as postgres) but must be
-- invisible to this member; a vacuous 0 here would prove nothing
select is(
  (select count(*)::int from public.participants where status = 'cancelled'),
  0,
  'a member cannot see another user''s cancelled row'
);

-- positive assertion: without this, deleting the participants SELECT
-- policy outright would still pass every other assertion in this file,
-- since they all check denials.
select is(
  (select count(*)::int from public.participants
    where user_id = '11111111-1111-1111-1111-111111111111'
      and status = 'confirmed'),
  1,
  'a member sees their own confirmed row'
);

select throws_ok(
  $$ insert into public.sessions
       (title, starts_at, ends_at, location, max_participants, created_by)
     values ('Member Session', now() + interval '3 days',
             now() + interval '3 days 2 hours', 'GOR Jakbar', 8,
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot create a session'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.sessions),
  3,
  'the host sees their own draft and cancelled sessions too'
);

-- sessions is the one place this migration deliberately exposes data to
-- unauthenticated callers; an anon visitor should see only the scheduled
-- session, never the draft or the cancelled one.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.sessions),
  1,
  'an anon visitor sees only the scheduled session, not draft or cancelled'
);

-- cohost self-promotion regression (carry-forward from earlier task review):
-- session_hosts_update_owner and session_hosts_insert_owner key on
-- is_session_owner(session_id) — the actor's PRE-EXISTING owner status —
-- never on the role value in the row being written. A cohost writing
-- role='owner' on their own row must not be able to satisfy their own
-- check, and must not be able to insert a new session_hosts row either.
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select lives_ok(
  $$ update public.session_hosts set role = 'owner'
      where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
        and user_id = '33333333-3333-3333-3333-333333333333' $$,
  'a cohost self-promotion update is filtered by RLS rather than erroring'
);

set local role postgres;
reset request.jwt.claims;

select is(
  (select role::text from public.session_hosts
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '33333333-3333-3333-3333-333333333333'),
  'cohost',
  'the cohost could not promote themselves to owner'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ insert into public.session_hosts (session_id, user_id, role)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '44444444-4444-4444-4444-444444444444', 'cohost') $$,
  '42501',
  null,
  'a cohost cannot insert a new session_hosts row for their session'
);

select * from finish();
rollback;
