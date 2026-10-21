-- Gallery photo moderation (docs/superpowers/specs/2026-10-21-gallery-design.md).
-- Sections are appended by later gallery tasks; keep plan() in step.
--   1. visibility and grants   (gallery_photos columns, privileges, policies)
--   2. can_review_gallery
-- Fixture rows in gallery_photos are inserted as postgres: direct INSERT is
-- revoked from authenticated (rows come only from add_gallery_photo).

begin;
select plan(30);

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

reset role;

select ok(
  has_function_privilege('authenticated', 'public.can_review_gallery(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.can_review_gallery(uuid)', 'execute'),
  'can_review_gallery is executable by authenticated and not by anon'
);

select * from finish();
rollback;
