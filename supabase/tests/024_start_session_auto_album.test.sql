-- Gallery prerequisite: start_session flips scheduled -> live (host only),
-- and the sessions_create_gallery trigger creates exactly one album per
-- session on that transition. Also covers the replaced galleries write
-- policies (insert/delete admin-only, update host-of-linked-session or admin)
-- and galleries.created_by becoming nullable with on delete set null.

begin;
select plan(29);

insert into auth.users (id, email) values
  ('11111111-5555-5555-5555-555555555555', 'owner-024@test.local'),
  ('22222222-5555-5555-5555-555555555555', 'cohost-024@test.local'),
  ('33333333-5555-5555-5555-555555555555', 'other-host-024@test.local'),
  ('44444444-5555-5555-5555-555555555555', 'member-024@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'admin-024@test.local'),
  ('66666666-5555-5555-5555-555555555555', 'creator-024@test.local');

update public.profiles set role = 'admin'
 where id = '55555555-5555-5555-5555-555555555555';
update public.profiles set role = 'host'
 where id in ('11111111-5555-5555-5555-555555555555',
              '22222222-5555-5555-5555-555555555555',
              '33333333-5555-5555-5555-555555555555');

-- S1 scheduled (owner), S2 scheduled with created_by nulled afterwards,
-- S3 draft, S4 fresh scheduled for the co-host.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-5555-5555-5555-555555555555', 'Start Me',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '11111111-5555-5555-5555-555555555555', 'scheduled'),
  ('bbbbbbbb-5555-5555-5555-555555555555', 'Orphan Creator',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '11111111-5555-5555-5555-555555555555', 'scheduled'),
  ('cccccccc-5555-5555-5555-555555555555', 'Still Draft',
   now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 16, '11111111-5555-5555-5555-555555555555', 'draft'),
  ('dddddddd-5555-5555-5555-555555555555', 'Cohost Start',
   now() + interval '4 days', now() + interval '4 days 2 hours',
   'GOR Jakbar', 16, '11111111-5555-5555-5555-555555555555', 'scheduled');

update public.sessions set created_by = null
 where id = 'bbbbbbbb-5555-5555-5555-555555555555';

insert into public.session_hosts (session_id, user_id, role)
values ('dddddddd-5555-5555-5555-555555555555',
        '22222222-5555-5555-5555-555555555555', 'cohost');

-- ---- start_session ----

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok(
  $$ select public.start_session('aaaaaaaa-5555-5555-5555-555555555555') $$,
  'the owner can start a scheduled session'
);

select is(
  (select status::text from public.sessions
    where id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  'live',
  'start_session flips the session to live'
);

set local request.jwt.claims = '{"sub":"22222222-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok(
  $$ select public.start_session('dddddddd-5555-5555-5555-555555555555') $$,
  'a co-host can start a scheduled session'
);

select is(
  (select status::text from public.sessions
    where id = 'dddddddd-5555-5555-5555-555555555555'),
  'live',
  'the co-host start flips the session to live'
);

set local request.jwt.claims = '{"sub":"33333333-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$ select public.start_session('bbbbbbbb-5555-5555-5555-555555555555') $$,
  'JB007', null,
  'an unrelated host cannot start the session'
);

set local request.jwt.claims = '{"sub":"44444444-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$ select public.start_session('bbbbbbbb-5555-5555-5555-555555555555') $$,
  'JB007', null,
  'a member cannot start the session'
);

set local request.jwt.claims = '{"sub":"11111111-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$ select public.start_session('99999999-5555-5555-5555-555555555555') $$,
  'JB008', null,
  'an unknown session id raises not found'
);

set local request.jwt.claims = '{}';

select throws_ok(
  $$ select public.start_session('bbbbbbbb-5555-5555-5555-555555555555') $$,
  'JB004', null,
  'a caller with no identity raises not authenticated'
);

set local request.jwt.claims = '{"sub":"11111111-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$ select public.start_session('cccccccc-5555-5555-5555-555555555555') $$,
  'JB016', null,
  'a draft session cannot be started'
);

select throws_ok(
  $$ select public.start_session('aaaaaaaa-5555-5555-5555-555555555555') $$,
  'JB016', null,
  'an already-live session cannot be started again'
);

-- ---- auto album ----

reset role;

select is(
  (select count(*)::int from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  1,
  'starting S1 created exactly one album'
);

select is(
  (select title from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  'Start Me',
  'the album title is the session title'
);

select is(
  (select description from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  null,
  'the album description is null'
);

select is(
  (select created_by from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  '11111111-5555-5555-5555-555555555555'::uuid,
  'the album created_by is the session creator'
);

update public.sessions set status = 'scheduled'
 where id = 'aaaaaaaa-5555-5555-5555-555555555555';
update public.sessions set status = 'live'
 where id = 'aaaaaaaa-5555-5555-5555-555555555555';

select is(
  (select count(*)::int from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  1,
  'flipping the session live twice still leaves one album'
);

-- S2 has a null created_by; an admin (who passes is_session_host) starts it.
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok(
  $$ select public.start_session('bbbbbbbb-5555-5555-5555-555555555555') $$,
  'a session with a null created_by can be started'
);

reset role;

select is(
  (select created_by from public.galleries
    where session_id = 'bbbbbbbb-5555-5555-5555-555555555555'),
  null,
  'the album of a session with null created_by has null created_by'
);

-- galleries.created_by is on delete set null.
insert into public.galleries (id, title, created_by)
values ('eeeeeeee-5555-5555-5555-555555555555', 'Creator Album',
        '66666666-5555-5555-5555-555555555555');

delete from public.profiles where id = '66666666-5555-5555-5555-555555555555';

select is(
  (select created_by from public.galleries
    where id = 'eeeeeeee-5555-5555-5555-555555555555'),
  null,
  'deleting the creator profile nulls galleries.created_by'
);

-- ---- galleries policies ----

-- S5 belongs to the unrelated host; the S1 owner is not a host of it.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('c5c5c5c5-5555-5555-5555-555555555555', 'Other Host Session',
   now() + interval '5 days', now() + interval '5 days 2 hours',
   'GOR Jakbar', 16, '33333333-5555-5555-5555-555555555555', 'scheduled');

insert into public.galleries (id, session_id, title)
values ('ffffffff-5555-5555-5555-555555555555',
        'c5c5c5c5-5555-5555-5555-555555555555', 'Other Album');

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$ insert into public.galleries (title) values ('Member Album') $$,
  '42501', null,
  'a member cannot insert an album'
);

set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok(
  $$ insert into public.galleries (id, title, created_by)
     values ('12121212-5555-5555-5555-555555555555', 'Admin Album',
             '55555555-5555-5555-5555-555555555555') $$,
  'an admin can insert an unlinked album'
);

set local request.jwt.claims = '{"sub":"11111111-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok(
  $$ update public.galleries set title = 'Renamed', description = 'Fun night'
      where session_id = 'aaaaaaaa-5555-5555-5555-555555555555' $$,
  'the host can update their session''s album'
);

select is(
  (select title || '/' || description from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  'Renamed/Fun night',
  'the host''s album update took effect'
);

select throws_ok(
  $$ update public.galleries set session_id = 'dddddddd-5555-5555-5555-555555555555'
      where session_id = 'aaaaaaaa-5555-5555-5555-555555555555' $$,
  '42501', null,
  'the host cannot re-point their album at another session'
);

select lives_ok(
  $$ update public.galleries set title = 'Hijacked'
      where id = 'ffffffff-5555-5555-5555-555555555555' $$,
  'the host''s update of another session''s album runs without error'
);

select is(
  (select title from public.galleries
    where id = 'ffffffff-5555-5555-5555-555555555555'),
  'Other Album',
  'the host''s update of another session''s album affected 0 rows'
);

select lives_ok(
  $$ delete from public.galleries
      where session_id = 'aaaaaaaa-5555-5555-5555-555555555555' $$,
  'the host''s delete of their album runs without error'
);

select is(
  (select count(*)::int from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  1,
  'the host cannot delete the album'
);

set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

delete from public.galleries
 where session_id = 'aaaaaaaa-5555-5555-5555-555555555555';

select is(
  (select count(*)::int from public.galleries
    where session_id = 'aaaaaaaa-5555-5555-5555-555555555555'),
  0,
  'an admin can delete the album'
);

reset role;

select ok(
  has_function_privilege('authenticated', 'public.start_session(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.start_session(uuid)', 'execute'),
  'start_session is executable by authenticated and not by anon'
);

select * from finish();
rollback;
