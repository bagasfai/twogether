-- Covers migration 20261117000002_gallery_delete_approved.sql.
-- The owner branch of gallery_delete no longer reaches the file behind an
-- approved photo. Rows are written to storage.objects directly as
-- `authenticated` with JWT claims, which is what storage-api does under the
-- caller's role. storage.protect_delete rejects direct DELETEs unless
-- storage.allow_delete_query = 'true'; it is set below.

begin;
select plan(5);

insert into auth.users (id, email) values
  ('11111111-5656-5656-5656-565656565656', 'host-056@test.local'),
  ('33333333-5656-5656-5656-565656565656', 'member-056@test.local');

update public.profiles set role = 'host'
 where id = '11111111-5656-5656-5656-565656565656';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a1a1a1a1-5656-5656-5656-565656565656', 'Storage Now',
   now() - interval '1 hour', now() + interval '1 hour', 'GOR Jakbar', 16,
   '11111111-5656-5656-5656-565656565656', 'scheduled');

insert into public.galleries (id, session_id, title) values
  ('b1b1b1b1-5656-5656-5656-565656565656',
   'a1a1a1a1-5656-5656-5656-565656565656', 'Album Now');

insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('gallery', 'b1b1b1b1-5656-5656-5656-565656565656/approved.webp',
   '33333333-5656-5656-5656-565656565656', '33333333-5656-5656-5656-565656565656'),
  ('gallery', 'b1b1b1b1-5656-5656-5656-565656565656/approved2.webp',
   '33333333-5656-5656-5656-565656565656', '33333333-5656-5656-5656-565656565656'),
  ('gallery', 'b1b1b1b1-5656-5656-5656-565656565656/pending.webp',
   '33333333-5656-5656-5656-565656565656', '33333333-5656-5656-5656-565656565656'),
  ('gallery', 'b1b1b1b1-5656-5656-5656-565656565656/orphan.webp',
   '33333333-5656-5656-5656-565656565656', '33333333-5656-5656-5656-565656565656');

insert into public.gallery_photos (gallery_id, storage_path, uploaded_by, status) values
  ('b1b1b1b1-5656-5656-5656-565656565656',
   'b1b1b1b1-5656-5656-5656-565656565656/approved.webp',
   '33333333-5656-5656-5656-565656565656', 'approved'),
  ('b1b1b1b1-5656-5656-5656-565656565656',
   'b1b1b1b1-5656-5656-5656-565656565656/approved2.webp',
   '33333333-5656-5656-5656-565656565656', 'approved'),
  ('b1b1b1b1-5656-5656-5656-565656565656',
   'b1b1b1b1-5656-5656-5656-565656565656/pending.webp',
   '33333333-5656-5656-5656-565656565656', 'pending');

set local role authenticated;
set local storage.allow_delete_query = 'true';

-- owner M
set local request.jwt.claims = '{"sub":"33333333-5656-5656-5656-565656565656","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-5656-5656-5656-565656565656/approved.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'the owner cannot delete the file behind their approved photo'
);

select is(
  (select count(*)::int from storage.objects
    where name = 'b1b1b1b1-5656-5656-5656-565656565656/approved.webp'),
  1,
  'the owner still sees the file behind their approved photo'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-5656-5656-5656-565656565656/pending.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'the owner can delete the file behind their pending photo'
);

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-5656-5656-5656-565656565656/orphan.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'the owner can delete a file with no photo row'
);

-- reviewer host H
set local request.jwt.claims = '{"sub":"11111111-5656-5656-5656-565656565656","role":"authenticated"}';

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'gallery'
                   and name = 'b1b1b1b1-5656-5656-5656-565656565656/approved2.webp'
                 returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'a reviewer can delete the file behind an approved photo'
);

reset role;

select * from finish();
rollback;
