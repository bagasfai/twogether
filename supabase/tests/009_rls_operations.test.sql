begin;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

update public.profiles set role = 'admin'
 where id = '33333333-3333-3333-3333-333333333333';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled');

insert into public.courts (session_id, court_number)
values ('aaaaaaaa-0000-0000-0000-000000000001', 1);

-- A gallery with a NULL session_id, as it would be after its session is
-- deleted (galleries.session_id is `on delete set null`). It has no
-- linked host, so galleries_write's `session_id is not null and
-- is_session_host(...)` branch can never be satisfied for it — only
-- is_admin() can. Created directly with session_id null (rather than by
-- deleting a session) to isolate the policy behavior from the FK trigger.
insert into public.galleries (id, title, created_by)
values ('eeeeeeee-0000-0000-0000-000000000001', 'Session photos',
        '33333333-3333-3333-3333-333333333333');

-- A session-scoped draft (published_at is null), owned by the session's host.
-- announcements_select must hide this from everyone except that session's
-- hosts — the `published_at is not null` branch excludes it from the public
-- path entirely, regardless of session_is_public().
insert into public.announcements (id, session_id, title, body, created_by, published_at)
values ('ffffffff-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Draft notice', 'Court 2 closed for maintenance',
        '22222222-2222-2222-2222-222222222222', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.courts),
  1,
  'a member can read courts of a public session'
);

select throws_ok(
  $$ insert into public.courts (session_id, court_number)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 2) $$,
  '42501',
  null,
  'a member cannot add a court'
);

select throws_ok(
  $$ insert into public.announcements (title, body, created_by)
     values ('Fake', 'Community-wide', '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot post a community-wide announcement'
);

select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000001'),
  0,
  'a member cannot see another host''s session-scoped draft announcement'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000001'),
  1,
  'the session''s host can see their own draft announcement'
);

-- Orphaned gallery: an UPDATE whose USING clause excludes every candidate
-- row does not raise 42501 — it silently matches and affects zero rows (the
-- same shape as 008's cohost self-promotion regression) — so this is
-- asserted via before/after value rather than throws_ok.
select lives_ok(
  $$ update public.galleries set title = 'Hijacked'
      where id = 'eeeeeeee-0000-0000-0000-000000000001' $$,
  'an ordinary host''s write to an orphaned gallery runs without error'
);

set local role postgres;
reset request.jwt.claims;
select is(
  (select title from public.galleries
    where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'Session photos',
  'the ordinary host''s write to the orphaned gallery did not take effect'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select lives_ok(
  $$ update public.galleries set title = 'Curated by admin'
      where id = 'eeeeeeee-0000-0000-0000-000000000001' $$,
  'an admin can write to an orphaned gallery'
);

set local role postgres;
reset request.jwt.claims;
select is(
  (select title from public.galleries
    where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'Curated by admin',
  'the admin''s write to the orphaned gallery took effect'
);

set local role anon;
set local request.jwt.claims = '';
select is(
  (select count(*)::int from public.galleries),
  1,
  'an anonymous visitor can read galleries'
);

select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000001'),
  0,
  'an anonymous visitor cannot see the session-scoped draft announcement'
);

select * from finish();
rollback;
