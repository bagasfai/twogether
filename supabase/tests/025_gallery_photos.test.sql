-- Gallery photo moderation (docs/superpowers/specs/2026-10-21-gallery-design.md).
-- Sections are appended by later gallery tasks; keep plan() in step.
--   1. visibility and grants   (gallery_photos columns, privileges, policies)
--   2. can_review_gallery
--   3. can_upload_to_gallery
--   4. add_gallery_photo
-- Fixture rows in gallery_photos are inserted as postgres: direct INSERT is
-- revoked from authenticated (rows come only from add_gallery_photo).

begin;
select plan(81);

-- ---- fixtures ----

insert into auth.users (id, email) values
  ('11111111-6666-6666-6666-666666666666', 'host1-025@test.local'),
  ('22222222-6666-6666-6666-666666666666', 'host2-025@test.local'),
  ('33333333-6666-6666-6666-666666666666', 'uploader-025@test.local'),
  ('44444444-6666-6666-6666-666666666666', 'member-025@test.local'),
  ('55555555-6666-6666-6666-666666666666', 'admin-025@test.local');

update public.profiles set role = 'admin'
 where id = '55555555-6666-6666-6666-666666666666';
update public.profiles set role = 'host'
 where id in ('11111111-6666-6666-6666-666666666666',
              '22222222-6666-6666-6666-666666666666');

-- S1 is owned by H1, S2 by H2 (owners are auto-added to session_hosts), so H1
-- is not a host of S2.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a1a1a1a1-6666-6666-6666-666666666666', 'Session One',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '11111111-6666-6666-6666-666666666666', 'scheduled'),
  ('a2a2a2a2-6666-6666-6666-666666666666', 'Session Two',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-6666-6666-6666-666666666666', 'scheduled');

insert into public.galleries (id, session_id, title) values
  ('b1b1b1b1-6666-6666-6666-666666666666',
   'a1a1a1a1-6666-6666-6666-666666666666', 'Album One'),
  ('b2b2b2b2-6666-6666-6666-666666666666',
   'a2a2a2a2-6666-6666-6666-666666666666', 'Album Two');

-- A1: p11 approved (no uploader), p12 pending by U, p13 pending (no uploader),
-- p14 approved by U.  A2: p21 approved, p22 pending (no uploader).
insert into public.gallery_photos
  (id, gallery_id, storage_path, status, uploaded_by, caption, sort_order)
values
  ('c0000011-6666-6666-6666-666666666666', 'b1b1b1b1-6666-6666-6666-666666666666',
   'a1/p11.jpg', 'approved', null, 'orig', 0),
  ('c0000012-6666-6666-6666-666666666666', 'b1b1b1b1-6666-6666-6666-666666666666',
   'a1/p12.jpg', 'pending', '33333333-6666-6666-6666-666666666666', 'orig', 0),
  ('c0000013-6666-6666-6666-666666666666', 'b1b1b1b1-6666-6666-6666-666666666666',
   'a1/p13.jpg', 'pending', null, 'orig', 0),
  ('c0000014-6666-6666-6666-666666666666', 'b1b1b1b1-6666-6666-6666-666666666666',
   'a1/p14.jpg', 'approved', '33333333-6666-6666-6666-666666666666', 'orig', 0),
  ('c0000021-6666-6666-6666-666666666666', 'b2b2b2b2-6666-6666-6666-666666666666',
   'a2/p21.jpg', 'approved', null, 'orig', 0),
  ('c0000022-6666-6666-6666-666666666666', 'b2b2b2b2-6666-6666-6666-666666666666',
   'a2/p22.jpg', 'pending', null, 'orig', 0);

-- ======== 1. visibility and grants ========

-- anon
set local role anon;
set local request.jwt.claims = '';

select is(
  (select count(*)::int from public.gallery_photos),
  3,
  'anon sees approved photos only'
);

select is(
  (select count(*)::int from public.gallery_photos where status = 'pending'),
  0,
  'anon sees no pending photo'
);

-- uploader U
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*)::int from public.gallery_photos),
  4,
  'the uploader sees approved photos plus their own pending one'
);

select is(
  (select count(*)::int from public.gallery_photos
    where id = 'c0000012-6666-6666-6666-666666666666'),
  1,
  'the uploader sees their own pending photo'
);

-- other member M
set local request.jwt.claims = '{"sub":"44444444-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*)::int from public.gallery_photos),
  3,
  'another member sees approved photos only'
);

-- host H1
set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*)::int from public.gallery_photos
    where gallery_id = 'b1b1b1b1-6666-6666-6666-666666666666'),
  4,
  'the host sees every photo of their own album'
);

select is(
  (select count(*)::int from public.gallery_photos
    where gallery_id = 'b2b2b2b2-6666-6666-6666-666666666666'
      and status = 'pending'),
  0,
  'the host sees no pending photo of another session''s album'
);

-- admin
set local request.jwt.claims = '{"sub":"55555555-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*)::int from public.gallery_photos),
  6,
  'the admin sees every photo'
);

-- direct insert is revoked
select throws_ok(
  $$ insert into public.gallery_photos (gallery_id, storage_path)
     values ('b1b1b1b1-6666-6666-6666-666666666666', 'a1/admin.jpg') $$,
  '42501', null,
  'an admin cannot insert a gallery photo directly'
);

select throws_ok(
  $$ update public.gallery_photos set status = 'approved'
      where id = 'c0000012-6666-6666-6666-666666666666' $$,
  '42501', null,
  'an admin cannot update status directly'
);

set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';

select throws_ok(
  $$ insert into public.gallery_photos (gallery_id, storage_path)
     values ('b1b1b1b1-6666-6666-6666-666666666666', 'a1/host.jpg') $$,
  '42501', null,
  'a host cannot insert a gallery photo directly'
);

select throws_ok(
  $$ update public.gallery_photos set storage_path = 'a1/moved.jpg'
      where id = 'c0000011-6666-6666-6666-666666666666' $$,
  '42501', null,
  'a host cannot update storage_path'
);

select throws_ok(
  $$ update public.gallery_photos
        set reviewed_by = '11111111-6666-6666-6666-666666666666'
      where id = 'c0000011-6666-6666-6666-666666666666' $$,
  '42501', null,
  'a host cannot update reviewed_by'
);

-- column-granted update: caption and sort_order
select lives_ok(
  $$ update public.gallery_photos set caption = 'edited', sort_order = 7
      where gallery_id = 'b1b1b1b1-6666-6666-6666-666666666666' $$,
  'the host can update caption and sort_order on their album''s photos'
);

select is(
  (select count(*)::int from public.gallery_photos
    where gallery_id = 'b1b1b1b1-6666-6666-6666-666666666666'
      and caption = 'edited' and sort_order = 7),
  4,
  'the host''s caption and sort_order update hit all 4 album rows'
);

select lives_ok(
  $$ update public.gallery_photos set caption = 'hijacked'
      where gallery_id = 'b2b2b2b2-6666-6666-6666-666666666666' $$,
  'the host''s update of another album''s photos runs without error'
);

reset role;

select is(
  (select count(*)::int from public.gallery_photos
    where gallery_id = 'b2b2b2b2-6666-6666-6666-666666666666'
      and caption = 'orig'),
  2,
  'the host''s update of another album''s photos affected 0 rows'
);

-- uploader cannot edit own caption
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-6666-6666-6666-666666666666","role":"authenticated"}';

select lives_ok(
  $$ update public.gallery_photos set caption = 'mine'
      where id = 'c0000012-6666-6666-6666-666666666666' $$,
  'the uploader''s caption update runs without error'
);

reset role;

select is(
  (select caption from public.gallery_photos
    where id = 'c0000012-6666-6666-6666-666666666666'),
  'edited',
  'the uploader cannot update their own caption (0 rows)'
);

-- deletes
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';
delete from public.gallery_photos where id = 'c0000013-6666-6666-6666-666666666666';
delete from public.gallery_photos where gallery_id = 'b2b2b2b2-6666-6666-6666-666666666666';

set local request.jwt.claims = '{"sub":"33333333-6666-6666-6666-666666666666","role":"authenticated"}';
delete from public.gallery_photos where id = 'c0000012-6666-6666-6666-666666666666';
delete from public.gallery_photos where id = 'c0000014-6666-6666-6666-666666666666';

set local request.jwt.claims = '{"sub":"44444444-6666-6666-6666-666666666666","role":"authenticated"}';
delete from public.gallery_photos;

reset role;

select is(
  (select count(*)::int from public.gallery_photos
    where id = 'c0000013-6666-6666-6666-666666666666'),
  0,
  'the host can delete a pending photo of their album'
);

select is(
  (select count(*)::int from public.gallery_photos
    where id = 'c0000012-6666-6666-6666-666666666666'),
  0,
  'the uploader can delete their own pending photo'
);

select is(
  (select count(*)::int from public.gallery_photos
    where id = 'c0000014-6666-6666-6666-666666666666'),
  1,
  'the uploader cannot delete their own approved photo'
);

select is(
  (select count(*)::int from public.gallery_photos),
  4,
  'a member delete removed nothing (4 rows remain: p11, p14, p21, p22)'
);

select is(
  (select count(*)::int from public.gallery_photos
    where gallery_id = 'b2b2b2b2-6666-6666-6666-666666666666'),
  2,
  'the host cannot delete another session''s photos'
);

-- unique storage_path
select throws_ok(
  $$ insert into public.gallery_photos (gallery_id, storage_path)
     values ('b1b1b1b1-6666-6666-6666-666666666666', 'a1/p11.jpg') $$,
  '23505', null,
  'storage_path is unique'
);

-- ======== 2. can_review_gallery ========

reset role;

select lives_ok(
  $$ insert into public.galleries (id, session_id, title)
     values ('b3b3b3b3-6666-6666-6666-666666666666', null, 'Unlinked Album') $$,
  'fixture: unlinked album (session_id null)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  public.can_review_gallery('b1b1b1b1-6666-6666-6666-666666666666'),
  'a host can review their own session''s album'
);

select ok(
  not public.can_review_gallery('b2b2b2b2-6666-6666-6666-666666666666'),
  'a host cannot review another session''s album'
);

set local request.jwt.claims = '{"sub":"44444444-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  not public.can_review_gallery('b1b1b1b1-6666-6666-6666-666666666666'),
  'a member cannot review an album'
);

set local request.jwt.claims = '{"sub":"55555555-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  public.can_review_gallery('b2b2b2b2-6666-6666-6666-666666666666'),
  'an admin can review any album'
);

select ok(
  public.can_review_gallery('b3b3b3b3-6666-6666-6666-666666666666'),
  'an admin can review an unlinked album'
);

select throws_ok(
  $$ update public.gallery_photos set reviewed_at = now() $$,
  '42501', null,
  'an admin cannot update reviewed_at directly'
);

set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  not public.can_review_gallery('b3b3b3b3-6666-6666-6666-666666666666'),
  'a host cannot review an unlinked album'
);

select throws_ok(
  $$ update public.gallery_photos set reviewed_at = now() $$,
  '42501', null,
  'a host cannot update reviewed_at directly'
);

reset role;

select ok(
  has_function_privilege('authenticated', 'public.can_review_gallery(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.can_review_gallery(uuid)', 'execute'),
  'can_review_gallery is executable by authenticated and not by anon'
);

-- ======== 3. can_upload_to_gallery ========
-- SE: ends now (inside the window), owned by H1, with co-host C.
-- SW_in / SW_out: ended 7 days minus / plus one minute ago.
-- Participants of SE: U confirmed+checked in, M confirmed not checked in,
-- W waiting_list+checked in, X cancelled+checked in (the enforce-check-in
-- trigger would null it, so it is disabled for that one insert).

select lives_ok(
  $$ insert into auth.users (id, email) values
       ('66666666-6666-6666-6666-666666666666', 'cohost-025@test.local'),
       ('77777777-6666-6666-6666-666666666666', 'waiter-025@test.local'),
       ('88888888-6666-6666-6666-666666666666', 'canceller-025@test.local') $$,
  'fixture: extra users'
);

select lives_ok(
  $$ insert into public.sessions
       (id, title, starts_at, ends_at, location, max_participants, created_by, status)
     values
       ('a3a3a3a3-6666-6666-6666-666666666666', 'Session Now',
        now() - interval '2 hours', now(), 'GOR Jakbar', 16,
        '11111111-6666-6666-6666-666666666666', 'scheduled'),
       ('a4a4a4a4-6666-6666-6666-666666666666', 'Session Edge In',
        now() - interval '7 days 2 hours',
        now() - interval '7 days' + interval '1 minute', 'GOR Jakbar', 16,
        '22222222-6666-6666-6666-666666666666', 'scheduled'),
       ('a5a5a5a5-6666-6666-6666-666666666666', 'Session Edge Out',
        now() - interval '7 days 2 hours',
        now() - interval '7 days' - interval '1 minute', 'GOR Jakbar', 16,
        '22222222-6666-6666-6666-666666666666', 'scheduled') $$,
  'fixture: sessions'
);

select lives_ok(
  $$ insert into public.session_hosts (session_id, user_id, role)
     values ('a3a3a3a3-6666-6666-6666-666666666666',
             '66666666-6666-6666-6666-666666666666', 'cohost') $$,
  'fixture: co-host'
);

select lives_ok(
  $$ insert into public.galleries (id, session_id, title) values
       ('b4b4b4b4-6666-6666-6666-666666666666',
        'a3a3a3a3-6666-6666-6666-666666666666', 'Album Now'),
       ('b5b5b5b5-6666-6666-6666-666666666666',
        'a4a4a4a4-6666-6666-6666-666666666666', 'Album Edge In'),
       ('b6b6b6b6-6666-6666-6666-666666666666',
        'a5a5a5a5-6666-6666-6666-666666666666', 'Album Edge Out') $$,
  'fixture: albums'
);

select lives_ok(
  $$ insert into public.participants (session_id, user_id, status, checked_in_at) values
       ('a3a3a3a3-6666-6666-6666-666666666666',
        '33333333-6666-6666-6666-666666666666', 'confirmed', now()),
       ('a3a3a3a3-6666-6666-6666-666666666666',
        '44444444-6666-6666-6666-666666666666', 'confirmed', null),
       ('a3a3a3a3-6666-6666-6666-666666666666',
        '77777777-6666-6666-6666-666666666666', 'waiting_list', now()),
       ('a4a4a4a4-6666-6666-6666-666666666666',
        '33333333-6666-6666-6666-666666666666', 'confirmed', now()),
       ('a5a5a5a5-6666-6666-6666-666666666666',
        '33333333-6666-6666-6666-666666666666', 'confirmed', now()) $$,
  'fixture: participants'
);

alter table public.participants disable trigger participants_enforce_checkin;

select lives_ok(
  $$ insert into public.participants
       (session_id, user_id, status, checked_in_at, cancelled_at)
     values ('a3a3a3a3-6666-6666-6666-666666666666',
             '88888888-6666-6666-6666-666666666666', 'cancelled', now(), now()) $$,
  'fixture: cancelled participant that is still checked in'
);

alter table public.participants enable trigger participants_enforce_checkin;

set local role authenticated;

-- admin
set local request.jwt.claims = '{"sub":"55555555-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'an admin can upload to any album'
);

select ok(
  public.can_upload_to_gallery('b3b3b3b3-6666-6666-6666-666666666666'),
  'an admin can upload to an unlinked album'
);

-- owner host H1
set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'the owner host can upload to their session''s album'
);

select ok(
  not public.can_upload_to_gallery('b3b3b3b3-6666-6666-6666-666666666666'),
  'a host cannot upload to an unlinked album'
);

-- co-host
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'a co-host can upload to the session''s album'
);

-- unrelated host H2 (not a host of the Session Now album)
set local request.jwt.claims = '{"sub":"22222222-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  not public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'an unrelated host cannot upload to another session''s album'
);

-- participants
set local request.jwt.claims = '{"sub":"33333333-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'a confirmed, checked-in participant can upload'
);

select ok(
  public.can_upload_to_gallery('b5b5b5b5-6666-6666-6666-666666666666'),
  'the window is open 1 minute before the 7-day cutoff'
);

select ok(
  not public.can_upload_to_gallery('b6b6b6b6-6666-6666-6666-666666666666'),
  'the window is closed 1 minute after the 7-day cutoff'
);

select ok(
  not public.can_upload_to_gallery('b3b3b3b3-6666-6666-6666-666666666666'),
  'a checked-in participant cannot upload to an unlinked album'
);

set local request.jwt.claims = '{"sub":"44444444-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  not public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'a confirmed participant who is not checked in cannot upload'
);

select ok(
  not public.can_upload_to_gallery('00000000-0000-0000-0000-000000000000'),
  'an unknown album id returns false'
);

set local request.jwt.claims = '{"sub":"77777777-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  not public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'a waiting_list participant who is checked in cannot upload'
);

set local request.jwt.claims = '{"sub":"88888888-6666-6666-6666-666666666666","role":"authenticated"}';

select ok(
  not public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'a cancelled participant with checked_in_at set cannot upload'
);

-- no claims
set local request.jwt.claims = '';

select ok(
  not public.can_upload_to_gallery('b4b4b4b4-6666-6666-6666-666666666666'),
  'a caller without claims gets false'
);

reset role;

select ok(
  has_function_privilege('authenticated', 'public.can_upload_to_gallery(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.can_upload_to_gallery(uuid)', 'execute'),
  'can_upload_to_gallery is executable by authenticated and not by anon'
);

-- ======== 4. add_gallery_photo ========
-- Uses Album Now (b4, session a3: U confirmed+checked in, M not checked in,
-- H1 owner, C co-host) and Album Edge Out (b6: U checked in, window closed).
-- V is a second confirmed, checked-in member of a3, for the per-user cap.
-- storage.objects rows are inserted as postgres with both owner (uuid) and
-- owner_id (text) set, which is what the local Storage API (storage-api
-- v1.72.1) writes on upload. The gallery bucket is created on conflict do
-- nothing so this keeps working once the bucket migration lands.

select lives_ok(
  $$ insert into auth.users (id, email) values
       ('99999999-6666-6666-6666-666666666666', 'member2-025@test.local');
     insert into public.participants (session_id, user_id, status, checked_in_at)
     values ('a3a3a3a3-6666-6666-6666-666666666666',
             '99999999-6666-6666-6666-666666666666', 'confirmed', now()) $$,
  'fixture: second checked-in member V'
);

select lives_ok(
  $$ insert into storage.buckets (id, name) values ('gallery', 'gallery')
     on conflict (id) do nothing $$,
  'fixture: gallery bucket'
);

-- Album Now already holds a photo, so the next sort_order is 42. H1 also
-- already has 20 pending rows there, so the cap exemption is really exercised.
select lives_ok(
  $$ insert into public.gallery_photos
       (gallery_id, storage_path, status, sort_order)
     values ('b4b4b4b4-6666-6666-6666-666666666666',
             'b4b4b4b4-6666-6666-6666-666666666666/seed.webp', 'approved', 41);
     insert into public.gallery_photos
       (gallery_id, storage_path, status, uploaded_by)
     select 'b4b4b4b4-6666-6666-6666-666666666666',
            format('b4b4b4b4-6666-6666-6666-666666666666/seed-h-%s.webp', i),
            'pending', '11111111-6666-6666-6666-666666666666'
       from generate_series(1, 20) as i $$,
  'fixture: existing photos in Album Now (max sort_order 41, 20 pending by H1)'
);

create function pg_temp.put_object(p_name text, p_owner uuid)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name, owner, owner_id)
  values ('gallery', p_name, p_owner, p_owner::text);
$$;

select lives_ok(
  $$ select pg_temp.put_object('b4b4b4b4-6666-6666-6666-666666666666/' || n, o::uuid)
       from (values
         ('a1.webp',        '55555555-6666-6666-6666-666666666666'),
         ('h1.webp',        '11111111-6666-6666-6666-666666666666'),
         ('h2.webp',        '22222222-6666-6666-6666-666666666666'),
         ('u1.webp',        '33333333-6666-6666-6666-666666666666'),
         ('u-null.webp',    '33333333-6666-6666-6666-666666666666'),
         ('u-blank.webp',   '33333333-6666-6666-6666-666666666666'),
         ('u-trim.webp',    '33333333-6666-6666-6666-666666666666'),
         ('u-after.webp',   '33333333-6666-6666-6666-666666666666'),
         ('m1.webp',        '44444444-6666-6666-6666-666666666666'),
         ('foreign.webp',   '44444444-6666-6666-6666-666666666666')
       ) as t(n, o);
     select pg_temp.put_object('b5b5b5b5-6666-6666-6666-666666666666/u.webp',
                               '33333333-6666-6666-6666-666666666666');
     select pg_temp.put_object('b6b6b6b6-6666-6666-6666-666666666666/u.webp',
                               '33333333-6666-6666-6666-666666666666');
     select pg_temp.put_object(
              format('b4b4b4b4-6666-6666-6666-666666666666/cap-v-%s.webp', i),
              '99999999-6666-6666-6666-666666666666')
       from generate_series(1, 21) as i;
     select pg_temp.put_object(
              format('b4b4b4b4-6666-6666-6666-666666666666/cap-h-%s.webp', i),
              '11111111-6666-6666-6666-666666666666')
       from generate_series(1, 21) as i $$,
  'fixture: storage objects'
);

set local role authenticated;

-- no claims
set local request.jwt.claims = '';

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/u1.webp', null) $$,
  'JB004', null,
  'a caller without claims gets JB004'
);

-- admin: approved immediately, sort_order = max + 1
set local request.jwt.claims = '{"sub":"55555555-6666-6666-6666-666666666666","role":"authenticated"}';

select throws_ok(
  $$ select public.add_gallery_photo('00000000-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000/a.webp', null) $$,
  'JB012', null,
  'an unknown album gets JB012, even for an admin'
);

select results_eq(
  $$ select status::text, uploaded_by, reviewed_by, reviewed_at is not null, sort_order
       from public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
              'b4b4b4b4-6666-6666-6666-666666666666/a1.webp', 'by admin') $$,
  $$ values ('approved', '55555555-6666-6666-6666-666666666666'::uuid,
             '55555555-6666-6666-6666-666666666666'::uuid, true, 42) $$,
  'an admin upload is approved, reviewed by the admin, sort_order max + 1'
);

-- host: approved immediately
set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';

select results_eq(
  $$ select status::text, uploaded_by, reviewed_by, reviewed_at is not null, sort_order
       from public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
              'b4b4b4b4-6666-6666-6666-666666666666/h1.webp', null) $$,
  $$ values ('approved', '11111111-6666-6666-6666-666666666666'::uuid,
             '11111111-6666-6666-6666-666666666666'::uuid, true, 43) $$,
  'a host upload is approved, reviewed by the host, sort_order max + 1'
);

-- member U: pending
set local request.jwt.claims = '{"sub":"33333333-6666-6666-6666-666666666666","role":"authenticated"}';

select results_eq(
  $$ select status::text, uploaded_by, reviewed_by is null, reviewed_at is null, sort_order
       from public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
              'b4b4b4b4-6666-6666-6666-666666666666/u1.webp', 'smash') $$,
  $$ values ('pending', '33333333-6666-6666-6666-666666666666'::uuid, true, true, 44) $$,
  'a member upload is pending, uploaded by the member, not reviewed'
);

select is(
  (select caption from public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
     'b4b4b4b4-6666-6666-6666-666666666666/u-null.webp', null)),
  null,
  'a null caption is stored as null'
);

select is(
  (select caption from public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
     'b4b4b4b4-6666-6666-6666-666666666666/u-blank.webp', '   ')),
  null,
  'a blank-only caption is stored as null'
);

select is(
  (select caption from public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
     'b4b4b4b4-6666-6666-6666-666666666666/u-trim.webp', '  rally  ')),
  'rally',
  'a caption is trimmed'
);

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/u1.webp', null) $$,
  'JB015', null,
  'the same path twice gets JB015'
);

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/missing.webp', null) $$,
  'JB015', null,
  'a path with no storage object gets JB015'
);

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/foreign.webp', null) $$,
  'JB015', null,
  'a storage object owned by another user gets JB015'
);

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b5b5b5b5-6666-6666-6666-666666666666/u.webp', null) $$,
  'JB015', null,
  'a path not prefixed with the album id gets JB015 (even if the caller owns it)'
);

select throws_ok(
  $$ select public.add_gallery_photo('b6b6b6b6-6666-6666-6666-666666666666',
       'b6b6b6b6-6666-6666-6666-666666666666/u.webp', null) $$,
  'JB013', null,
  'a checked-in member after the 7-day window gets JB013'
);

-- not eligible
set local request.jwt.claims = '{"sub":"44444444-6666-6666-6666-666666666666","role":"authenticated"}';

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/m1.webp', null) $$,
  'JB012', null,
  'a confirmed member who is not checked in gets JB012'
);

set local request.jwt.claims = '{"sub":"22222222-6666-6666-6666-666666666666","role":"authenticated"}';

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/h2.webp', null) $$,
  'JB012', null,
  'an unrelated host gets JB012'
);

-- pending cap: V uploads 20, the 21st is refused
set local request.jwt.claims = '{"sub":"99999999-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*)::int
     from generate_series(1, 20) as i,
          lateral public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
            format('b4b4b4b4-6666-6666-6666-666666666666/cap-v-%s.webp', i), null) as p
    where p.status = 'pending'),
  20,
  'a member can hold 20 pending photos in one album'
);

select throws_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/cap-v-21.webp', null) $$,
  'JB014', null,
  'the 21st pending photo gets JB014'
);

-- another user's pending photos do not count against the caller
set local request.jwt.claims = '{"sub":"33333333-6666-6666-6666-666666666666","role":"authenticated"}';

select lives_ok(
  $$ select public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
       'b4b4b4b4-6666-6666-6666-666666666666/u-after.webp', null) $$,
  'another member''s 20 pending photos do not consume the caller''s cap'
);

-- reviewers are exempt from the cap
set local request.jwt.claims = '{"sub":"11111111-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*)::int
     from generate_series(1, 21) as i,
          lateral public.add_gallery_photo('b4b4b4b4-6666-6666-6666-666666666666',
            format('b4b4b4b4-6666-6666-6666-666666666666/cap-h-%s.webp', i), null)),
  21,
  'a host with 20 pending photos can still upload 21 more (reviewers are exempt from the cap)'
);

reset role;

select ok(
  has_function_privilege('authenticated', 'public.add_gallery_photo(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.add_gallery_photo(uuid, text, text)', 'execute'),
  'add_gallery_photo is executable by authenticated and not by anon'
);

select * from finish();
rollback;
