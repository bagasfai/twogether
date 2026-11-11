-- Avatars Storage bucket and storage.objects policies
-- (20261111000001_avatars_storage.sql).
-- Rows are written to storage.objects directly as `authenticated` with JWT
-- claims, which is what storage-api does under the caller's role.
-- storage.protect_delete rejects direct DELETEs unless
-- storage.allow_delete_query = 'true'; it is set below.

begin;
select plan(22);

insert into auth.users (id, email) values
  ('11111111-5353-5353-5353-535353535353', 'a-053@test.local'),
  ('22222222-5353-5353-5353-535353535353', 'b-053@test.local'),
  ('33333333-5353-5353-5353-535353535353', 'admin-053@test.local');

update public.profiles set role = 'admin'
 where id = '33333333-5353-5353-5353-535353535353';

insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('avatars', '22222222-5353-5353-5353-535353535353/avatar.webp',
   '22222222-5353-5353-5353-535353535353', '22222222-5353-5353-5353-535353535353'),
  ('avatars', '22222222-5353-5353-5353-535353535353/avatar.jpg',
   '22222222-5353-5353-5353-535353535353', '22222222-5353-5353-5353-535353535353');

-- ======== bucket ========

select is(
  (select count(*)::int from storage.buckets where id = 'avatars'),
  1,
  'the avatars bucket exists'
);

select ok(
  (select public from storage.buckets where id = 'avatars'),
  'the avatars bucket is public'
);

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  524288::bigint,
  'the avatars bucket limits files to 512 KB'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/webp', 'image/jpeg', 'image/png']::text[],
  'the avatars bucket accepts webp, jpeg and png only'
);

-- ======== policies present ========

select is(
  (select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_insert'),
  'INSERT',
  'avatars_insert is an INSERT policy on storage.objects'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_update'),
  'UPDATE',
  'avatars_update is an UPDATE policy on storage.objects'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_select'),
  'SELECT',
  'avatars_select is a SELECT policy on storage.objects'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_delete'),
  'DELETE',
  'avatars_delete is a DELETE policy on storage.objects'
);

-- ======== INSERT ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-5353-5353-5353-535353535353","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('avatars', '11111111-5353-5353-5353-535353535353/avatar.webp',
             '11111111-5353-5353-5353-535353535353', '11111111-5353-5353-5353-535353535353') $$,
  'a user can upload their own avatar.webp'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('avatars', '11111111-5353-5353-5353-535353535353/avatar.jpg',
             '11111111-5353-5353-5353-535353535353', '11111111-5353-5353-5353-535353535353') $$,
  'a user can upload their own avatar.jpg'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('avatars', '11111111-5353-5353-5353-535353535353/other.png',
             '11111111-5353-5353-5353-535353535353', '11111111-5353-5353-5353-535353535353') $$,
  '42501',
  null,
  'a different filename in the own folder is denied'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('avatars', '11111111-5353-5353-5353-535353535353/sub/avatar.webp',
             '11111111-5353-5353-5353-535353535353', '11111111-5353-5353-5353-535353535353') $$,
  '42501',
  null,
  'a nested path in the own folder is denied'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('avatars', '22222222-5353-5353-5353-535353535353/avatar.png',
             '11111111-5353-5353-5353-535353535353', '11111111-5353-5353-5353-535353535353') $$,
  '42501',
  null,
  'writing into another user''s folder is denied'
);

-- ======== UPDATE (upsert overwrite) ========

select results_eq(
  $$ with u as (update storage.objects set updated_at = now()
                 where bucket_id = 'avatars'
                   and name = '11111111-5353-5353-5353-535353535353/avatar.webp'
                 returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'a user can overwrite their own avatar'
);

select results_eq(
  $$ with u as (update storage.objects set updated_at = now()
                 where bucket_id = 'avatars'
                   and name = '22222222-5353-5353-5353-535353535353/avatar.webp'
                 returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a user cannot overwrite another user''s avatar'
);

-- ======== SELECT ========

select is(
  (select count(*)::int from storage.objects
    where name = '22222222-5353-5353-5353-535353535353/avatar.jpg'),
  0,
  'a member cannot see another member''s object'
);

select is(
  (select count(*)::int from storage.objects
    where name = '11111111-5353-5353-5353-535353535353/avatar.jpg'),
  1,
  'the owner sees their own object'
);

set local request.jwt.claims = '{"sub":"33333333-5353-5353-5353-535353535353","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects
    where name = '22222222-5353-5353-5353-535353535353/avatar.jpg'),
  1,
  'an admin sees any avatar object'
);

-- ======== anon ========

set local role anon;
set local request.jwt.claims = '';

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '11111111-5353-5353-5353-535353535353/avatar.webp') $$,
  '42501',
  null,
  'anon cannot upload'
);

-- ======== DELETE ========

set local role authenticated;
set local storage.allow_delete_query = 'true';
set local request.jwt.claims = '{"sub":"11111111-5353-5353-5353-535353535353","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'avatars'
                   and name = '22222222-5353-5353-5353-535353535353/avatar.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a user cannot delete another user''s avatar'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'avatars'
                   and name = '11111111-5353-5353-5353-535353535353/avatar.jpg'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'a user can delete their own avatar'
);

set local request.jwt.claims = '{"sub":"33333333-5353-5353-5353-535353535353","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'avatars'
                   and name = '22222222-5353-5353-5353-535353535353/avatar.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'an admin can delete any avatar'
);

select * from finish();
rollback;
