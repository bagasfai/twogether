begin;
select plan(26);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'member2@test.local');

update public.profiles set role = 'admin'
 where id = '33333333-3333-3333-3333-333333333333';

-- Session A is the "home" session for most of this file. Session B exists
-- only to hold a checked-in participant in a DIFFERENT session, for the
-- match_players cross-session regression below.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Saturday Morning',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled');

insert into public.courts (session_id, court_number)
values ('aaaaaaaa-0000-0000-0000-000000000001', 1);

-- Checked-in participant of session A, for the legitimate match_players insert.
insert into public.participants (id, session_id, user_id, status, checked_in_at)
values ('cccccccc-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed', now());

-- Checked-in participant of session B — a DIFFERENT session than session A's
-- match below. Used only for the cross-session match_players regression.
insert into public.participants (id, session_id, user_id, status, checked_in_at)
values ('cccccccc-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000002',
        '44444444-4444-4444-4444-444444444444', 'confirmed', now());

-- A gallery with a NULL session_id, as it would be after its session is
-- deleted (galleries.session_id is `on delete set null`). It has no
-- linked host, so galleries_write's `session_id is not null and
-- is_session_host(...)` branch can never be satisfied for it — only
-- is_admin() can. Created directly with session_id null (rather than by
-- deleting a session) to isolate the policy behavior from the FK trigger.
insert into public.galleries (id, title, created_by)
values ('eeeeeeee-0000-0000-0000-000000000001', 'Session photos',
        '33333333-3333-3333-3333-333333333333');

-- A gallery linked to session A, for the gallery_photos positive-path tests.
insert into public.galleries (id, session_id, title, created_by)
values ('eeeeeeee-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Match day', '22222222-2222-2222-2222-222222222222');

-- A session-scoped draft (published_at is null), owned by the session's host.
-- announcements_select must hide this from everyone except that session's
-- hosts — the `published_at is not null` branch excludes it from the public
-- path entirely, regardless of session_is_public().
insert into public.announcements (id, session_id, title, body, created_by, published_at)
values ('ffffffff-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Draft notice', 'Court 2 closed for maintenance',
        '22222222-2222-2222-2222-222222222222', null);

-- A community-wide draft (session_id is null AND published_at is null).
-- Satisfies neither of announcements_select's first two branches, so it is
-- reachable only through the `or public.is_admin()` branch: visible to the
-- admin who wrote it, invisible to everyone else.
insert into public.announcements (id, session_id, title, body, created_by, published_at)
values ('ffffffff-0000-0000-0000-000000000002',
        null, 'Community draft', 'Season pass pricing (not yet announced)',
        '33333333-3333-3333-3333-333333333333', null);

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

select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000002'),
  0,
  'a member cannot see the admin''s community-wide draft announcement'
);

-- host of session A: positive paths for courts_write/courts_select,
-- matches_write/matches_select, match_players_write/match_players_select,
-- announcements_write, gallery_photos_write/gallery_photos_select, plus the
-- match_players cross-session regression (guard_match_player / JB005).
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000001'),
  1,
  'the session''s host can see their own draft announcement'
);

-- courts_write / courts_select: a session host can add a court and then
-- read it back. If courts_write were deleted the insert itself would throw;
-- if courts_select were deleted the subsequent count would read 0.
select lives_ok(
  $$ insert into public.courts (session_id, court_number)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 2) $$,
  'a session host can add a court'
);

select is(
  (select count(*)::int from public.courts
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  2,
  'the session host can read the court they just added'
);

-- matches_write / matches_select: a session host can create a match and
-- update its status, then read the updated row back.
select lives_ok(
  $$ insert into public.matches (id, session_id, status)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000001', 'scheduled') $$,
  'a session host can create a match'
);

select lives_ok(
  $$ update public.matches set status = 'in_progress'
      where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$,
  'a session host can update their match'
);

select is(
  (select status::text from public.matches
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'in_progress',
  'the session host can read back the match they updated'
);

-- match_players_write / match_players_select: a session host can add a
-- checked-in participant of THAT session as a match player, and read it back.
select lives_ok(
  $$ insert into public.match_players (match_id, participant_id, team)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             'cccccccc-0000-0000-0000-000000000001', 1) $$,
  'a session host can add a checked-in participant of that session as a match player'
);

select is(
  (select count(*)::int from public.match_players
    where match_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  1,
  'the session host can read the match player they just added'
);

-- Cross-session regression: match_players_write's subquery correlates
-- `m.id = match_id`, which constrains the MATCH to one the host owns but
-- places no constraint on the PARTICIPANT's session. RLS alone would allow
-- this insert; guard_match_player() (JB005) is the only thing that rejects
-- a participant belonging to a different session than the match.
select throws_ok(
  $$ insert into public.match_players (match_id, participant_id, team)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             'cccccccc-0000-0000-0000-000000000002', 2) $$,
  'JB005',
  null,
  'adding a checked-in participant from a DIFFERENT session as a match player is rejected'
);

-- announcements_write: a session host can post a session-scoped announcement.
select lives_ok(
  $$ insert into public.announcements (id, session_id, title, body, created_by)
     values ('ffffffff-0000-0000-0000-000000000003',
             'aaaaaaaa-0000-0000-0000-000000000001',
             'Court closure', 'Court 1 closed 6-7pm',
             '22222222-2222-2222-2222-222222222222') $$,
  'a session host can post a session-scoped announcement'
);

select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000003'),
  1,
  'the session host can read the announcement they just posted'
);

-- gallery_photos_write / gallery_photos_select: a session host can add a
-- photo to their session's gallery and read it back.
select lives_ok(
  $$ insert into public.gallery_photos (gallery_id, storage_path)
     values ('eeeeeeee-0000-0000-0000-000000000002', 'sessions/a/1.jpg') $$,
  'a session host can add a photo to their session''s gallery'
);

select is(
  (select count(*)::int from public.gallery_photos
    where gallery_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  1,
  'the session host can read the gallery photo they just added'
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

-- admin sees their own community-wide draft (the announcements_select fix).
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000002'),
  1,
  'the admin can see their own community-wide draft announcement'
);

set local role anon;
set local request.jwt.claims = '';
select is(
  (select count(*)::int from public.galleries),
  2,
  'an anonymous visitor can read galleries'
);

select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000001'),
  0,
  'an anonymous visitor cannot see the session-scoped draft announcement'
);

select is(
  (select count(*)::int from public.announcements
    where id = 'ffffffff-0000-0000-0000-000000000002'),
  0,
  'an anonymous visitor cannot see the community-wide draft announcement'
);

select * from finish();
rollback;
