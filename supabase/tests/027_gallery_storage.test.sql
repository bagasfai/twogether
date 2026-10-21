-- Gallery Storage bucket and storage.objects policies
-- (20261021000003_gallery_storage.sql, spec section "Storage").
-- Tests the policies, not the Storage API: rows are written to storage.objects
-- directly as `authenticated` with JWT claims, which is what storage-api does
-- under the caller's role.
--
-- DELETE: storage.protect_delete (a BEFORE DELETE statement trigger) rejects
-- any direct DELETE with 42501 unless storage.allow_delete_query = 'true'. It
-- is set below so the DELETE policy is what decides the rowcount.
--
-- SELECT: the migration adds gallery_select (same rule as gallery_delete)
-- because a DELETE with a WHERE clause only reaches rows that pass a SELECT
-- policy; without it every DELETE below, and storage-api's remove, affects 0
-- rows.
--   1. bucket
--   2. policies present
--   3. INSERT policy
--   4. SELECT policy
--   5. DELETE policy

begin;
select plan(31);

-- ---- fixtures (as postgres) ----

insert into auth.users (id, email) values
  ('11111111-2727-2727-2727-272727272727', 'host1-027@test.local'),
  ('22222222-2727-2727-2727-272727272727', 'host2-027@test.local'),
  ('33333333-2727-2727-2727-272727272727', 'member-027@test.local'),
  ('44444444-2727-2727-2727-272727272727', 'other-027@test.local'),
  ('55555555-2727-2727-2727-272727272727', 'admin-027@test.local');

update public.profiles set role = 'admin'
 where id = '55555555-2727-2727-2727-272727272727';
update public.profiles set role = 'host'
 where id in ('11111111-2727-2727-2727-272727272727',
              '22222222-2727-2727-2727-272727272727');

-- S1 (H1) is running now; S2 (H2) is another host's session; S3 (H1) ended
-- 8 days ago, outside the 7-day upload window.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a1a1a1a1-2727-2727-2727-272727272727', 'Storage Now',
   now() - interval '1 hour', now() + interval '1 hour', 'GOR Jakbar', 16,
   '11111111-2727-2727-2727-272727272727', 'scheduled'),
  ('a2a2a2a2-2727-2727-2727-272727272727', 'Storage Other',
   now() - interval '1 hour', now() + interval '1 hour', 'GOR Jakbar', 16,
   '22222222-2727-2727-2727-272727272727', 'scheduled'),
  ('a3a3a3a3-2727-2727-2727-272727272727', 'Storage Old',
   now() - interval '8 days 2 hours', now() - interval '8 days', 'GOR Jakbar', 16,
   '11111111-2727-2727-2727-272727272727', 'scheduled');

insert into public.galleries (id, session_id, title) values
  ('b1b1b1b1-2727-2727-2727-272727272727',
   'a1a1a1a1-2727-2727-2727-272727272727', 'Album Now'),
  ('b2b2b2b2-2727-2727-2727-272727272727',
   'a2a2a2a2-2727-2727-2727-272727272727', 'Album Other'),
  ('b3b3b3b3-2727-2727-2727-272727272727',
   'a3a3a3a3-2727-2727-2727-272727272727', 'Album Old');

-- M is a confirmed, checked-in participant of S1 and S3. O is checked in at
-- S1 too, so O is an eligible uploader but not M's object owner or a host.
insert into public.participants (session_id, user_id, status, checked_in_at) values
  ('a1a1a1a1-2727-2727-2727-272727272727',
   '33333333-2727-2727-2727-272727272727', 'confirmed', now()),
  ('a1a1a1a1-2727-2727-2727-272727272727',
   '44444444-2727-2727-2727-272727272727', 'confirmed', now()),
  ('a3a3a3a3-2727-2727-2727-272727272727',
   '33333333-2727-2727-2727-272727272727', 'confirmed', now());

-- A second bucket, to prove the policies are scoped to 'gallery'.
insert into storage.buckets (id, name, public) values ('other-027', 'other-027', true);

-- Objects for the DELETE cases, written as postgres (bypasses RLS). Storage
-- writes both owner columns; d4/d5 each set only one, to pin that the policy
-- accepts either.
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('gallery', 'b1b1b1b1-2727-2727-2727-272727272727/d1.webp',
   '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727'),
  ('gallery', 'b1b1b1b1-2727-2727-2727-272727272727/d2.webp',
   '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727'),
  ('gallery', 'b2b2b2b2-2727-2727-2727-272727272727/d3.webp',
   '22222222-2727-2727-2727-272727272727', '22222222-2727-2727-2727-272727272727'),
  ('gallery', 'b1b1b1b1-2727-2727-2727-272727272727/d4.webp',
   null, '33333333-2727-2727-2727-272727272727'),
  ('gallery', 'b1b1b1b1-2727-2727-2727-272727272727/d5.webp',
   '33333333-2727-2727-2727-272727272727', null),
  ('gallery', 'not-a-uuid/d6.webp',
   '22222222-2727-2727-2727-272727272727', '22222222-2727-2727-2727-272727272727'),
  ('gallery', 'b2b2b2b2-2727-2727-2727-272727272727/d7.webp',
   '22222222-2727-2727-2727-272727272727', '22222222-2727-2727-2727-272727272727');

-- ======== 1. bucket ========

select is(
  (select count(*)::int from storage.buckets where id = 'gallery'),
  1,
  'the gallery bucket exists'
);

select ok(
  (select public from storage.buckets where id = 'gallery'),
  'the gallery bucket is public'
);

select is(
  (select file_size_limit from storage.buckets where id = 'gallery'),
  5242880::bigint,
  'the gallery bucket limits files to 5 MB'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'gallery'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'the gallery bucket accepts jpeg, png and webp only'
);

-- ======== 2. policies present ========

select is(
  (select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'gallery_insert'),
  'INSERT',
  'gallery_insert is an INSERT policy on storage.objects'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'gallery_select'),
  'SELECT',
  'gallery_select is a SELECT policy on storage.objects'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'gallery_delete'),
  'DELETE',
  'gallery_delete is a DELETE policy on storage.objects'
);

-- ======== 3. INSERT policy ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-2727-2727-2727-272727272727","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'b1b1b1b1-2727-2727-2727-272727272727/c1c1c1c1-2727-2727-2727-272727272727.webp',
             '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727') $$,
  'a checked-in member can upload into their session''s album'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'b2b2b2b2-2727-2727-2727-272727272727/c2.webp',
             '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727') $$,
  '42501',
  null,
  'the member cannot upload into another session''s album'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'not-a-uuid/x.webp',
             '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727') $$,
  '42501',
  null,
  'a non-UUID first path segment is denied by policy, not a cast error'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'x.webp',
             '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727') $$,
  '42501',
  null,
  'a path with no folder is denied'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'B1B1B1B1-2727-2727-2727-272727272727/c3.webp',
             '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727') $$,
  '42501',
  null,
  'an upper-case album id is denied (paths use the canonical lower-case form)'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('other-027', 'b1b1b1b1-2727-2727-2727-272727272727/c4.webp',
             '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727') $$,
  '42501',
  null,
  'the gallery policy does not allow uploads into another bucket'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'b3b3b3b3-2727-2727-2727-272727272727/c5.webp',
             '33333333-2727-2727-2727-272727272727', '33333333-2727-2727-2727-272727272727') $$,
  '42501',
  null,
  'the member cannot upload after the 7-day window'
);

-- host H1 of S1 and S3 (the window applies to participants, not hosts)
set local request.jwt.claims = '{"sub":"11111111-2727-2727-2727-272727272727","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'b3b3b3b3-2727-2727-2727-272727272727/c6.webp',
             '11111111-2727-2727-2727-272727272727', '11111111-2727-2727-2727-272727272727') $$,
  'the host can upload into their album after the window'
);

-- admin
set local request.jwt.claims = '{"sub":"55555555-2727-2727-2727-272727272727","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('gallery', 'b2b2b2b2-2727-2727-2727-272727272727/c7.webp',
             '55555555-2727-2727-2727-272727272727', '55555555-2727-2727-2727-272727272727') $$,
  'an admin can upload into any album'
);

-- anon has no INSERT policy
set local role anon;
set local request.jwt.claims = '';

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('gallery', 'b1b1b1b1-2727-2727-2727-272727272727/c8.webp') $$,
  '42501',
  null,
  'anon cannot upload'
);

-- ======== 4. SELECT policy ========
-- (role is still anon here)

select is(
  (select count(*)::int from storage.objects where bucket_id = 'gallery'),
  0,
  'anon sees no gallery objects through the table'
);

set local role authenticated;

-- another member O
set local request.jwt.claims = '{"sub":"44444444-2727-2727-2727-272727272727","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects
    where name = 'b1b1b1b1-2727-2727-2727-272727272727/d1.webp'),
  0,
  'another member cannot see the member''s object'
);

-- owner M
set local request.jwt.claims = '{"sub":"33333333-2727-2727-2727-272727272727","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects
    where name = 'b1b1b1b1-2727-2727-2727-272727272727/d1.webp'),
  1,
  'the owner sees their own object'
);

-- reviewer host H1
set local request.jwt.claims = '{"sub":"11111111-2727-2727-2727-272727272727","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects
    where name = 'b1b1b1b1-2727-2727-2727-272727272727/d1.webp'),
  1,
  'the reviewer host sees objects in their album'
);

-- ======== 5. DELETE policy ========

set local role authenticated;
set local storage.allow_delete_query = 'true';

-- another member O (eligible uploader, but neither owner nor reviewer)
set local request.jwt.claims = '{"sub":"44444444-2727-2727-2727-272727272727","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-2727-2727-2727-272727272727/d1.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'another member cannot delete the member''s object'
);

-- owner M
set local request.jwt.claims = '{"sub":"33333333-2727-2727-2727-272727272727","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-2727-2727-2727-272727272727/d1.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'the owner can delete their own object'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-2727-2727-2727-272727272727/d4.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'ownership via owner_id alone is enough'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-2727-2727-2727-272727272727/d5.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'ownership via owner alone is enough'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b2b2b2b2-2727-2727-2727-272727272727/d3.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a member cannot delete an object they do not own'
);

-- reviewer host H1 (S1)
set local request.jwt.claims = '{"sub":"11111111-2727-2727-2727-272727272727","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-2727-2727-2727-272727272727/d2.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'the reviewer host can delete any object in their album'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b2b2b2b2-2727-2727-2727-272727272727/d3.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a host cannot delete objects in another host''s album'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'not-a-uuid/d6.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a non-UUID first segment is denied for a non-owner, not a cast error'
);

-- admin
set local request.jwt.claims = '{"sub":"55555555-2727-2727-2727-272727272727","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b2b2b2b2-2727-2727-2727-272727272727/d7.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'an admin can delete any gallery object'
);

reset role;

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'gallery'
      and name in ('b1b1b1b1-2727-2727-2727-272727272727/d1.webp',
                   'b1b1b1b1-2727-2727-2727-272727272727/d2.webp',
                   'b1b1b1b1-2727-2727-2727-272727272727/d4.webp',
                   'b1b1b1b1-2727-2727-2727-272727272727/d5.webp',
                   'b2b2b2b2-2727-2727-2727-272727272727/d3.webp',
                   'not-a-uuid/d6.webp',
                   'b2b2b2b2-2727-2727-2727-272727272727/d7.webp')),
  2,
  'exactly the denied deletes (d3, d6) left their objects behind'
);

select * from finish();
rollback;
