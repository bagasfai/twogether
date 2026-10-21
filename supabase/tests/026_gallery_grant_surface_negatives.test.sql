-- Negative half of the grant-surface pins for the gallery moderation work
-- (20261021000001_start_session_auto_album.sql,
-- 20261021000002_gallery_photos_moderation.sql). Same rationale as
-- 022_grant_surface_negatives.test.sql: every SECURITY DEFINER function and
-- the restricted gallery_photos columns rely on an explicit
-- `revoke ... from public, anon` (or a column-level grant instead of a
-- table-level one) as the real authorization boundary, not RLS. A migration
-- that regresses to default privileges would pass every RLS and behaviour
-- test unchanged; only a pin on the *absence* of the privilege catches it.
--
-- The PUBLIC check reads pg_proc.proacl via aclexplode. A null proacl means
-- the default ACL, which grants EXECUTE to PUBLIC, so coalesce() to
-- acldefault() makes a regression to default privileges fail the assertion
-- instead of silently passing. Grantee 0 is the PUBLIC pseudo-role.
--
-- Catalog-privilege checks only (has_function_privilege / has_column_privilege
-- / has_table_privilege), so no fixtures or role switching are needed.

begin;
select plan(35);

-- anon lacks EXECUTE

select ok(
  not has_function_privilege('anon', 'public.start_session(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on start_session'
);

select ok(
  not has_function_privilege('anon', 'public.can_upload_to_gallery(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on can_upload_to_gallery'
);

select ok(
  not has_function_privilege('anon', 'public.can_review_gallery(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on can_review_gallery'
);

select ok(
  not has_function_privilege('anon', 'public.add_gallery_photo(uuid, text, text)', 'EXECUTE'),
  'anon lacks EXECUTE on add_gallery_photo'
);

select ok(
  not has_function_privilege('anon', 'public.review_gallery_photo(uuid, text)', 'EXECUTE'),
  'anon lacks EXECUTE on review_gallery_photo'
);

select ok(
  not has_function_privilege('anon', 'public.create_session_gallery()', 'EXECUTE'),
  'anon lacks EXECUTE on create_session_gallery'
);

-- PUBLIC pseudo-role lacks EXECUTE (null proacl counts as granted)

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.start_session(uuid)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on start_session'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.can_upload_to_gallery(uuid)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on can_upload_to_gallery'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.can_review_gallery(uuid)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on can_review_gallery'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.add_gallery_photo(uuid, text, text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on add_gallery_photo'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.review_gallery_photo(uuid, text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on review_gallery_photo'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.create_session_gallery()'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on create_session_gallery'
);

-- trigger function is not callable by authenticated

select ok(
  not has_function_privilege('authenticated', 'public.create_session_gallery()', 'EXECUTE'),
  'authenticated lacks EXECUTE on create_session_gallery'
);

-- authenticated keeps EXECUTE on the five public RPCs/helpers

select ok(
  has_function_privilege('authenticated', 'public.start_session(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on start_session'
);

select ok(
  has_function_privilege('authenticated', 'public.can_upload_to_gallery(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on can_upload_to_gallery'
);

select ok(
  has_function_privilege('authenticated', 'public.can_review_gallery(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on can_review_gallery'
);

select ok(
  has_function_privilege('authenticated', 'public.add_gallery_photo(uuid, text, text)', 'EXECUTE'),
  'authenticated has EXECUTE on add_gallery_photo'
);

select ok(
  has_function_privilege('authenticated', 'public.review_gallery_photo(uuid, text)', 'EXECUTE'),
  'authenticated has EXECUTE on review_gallery_photo'
);

-- gallery_photos: no direct INSERT; only caption/sort_order updatable

select ok(
  not has_table_privilege('authenticated', 'public.gallery_photos', 'insert'),
  'authenticated lacks INSERT on gallery_photos (RPC-only)'
);

select ok(
  not has_column_privilege('authenticated', 'public.gallery_photos', 'status', 'UPDATE'),
  'authenticated lacks UPDATE on gallery_photos.status'
);

select ok(
  not has_column_privilege('authenticated', 'public.gallery_photos', 'reviewed_by', 'UPDATE'),
  'authenticated lacks UPDATE on gallery_photos.reviewed_by'
);

select ok(
  not has_column_privilege('authenticated', 'public.gallery_photos', 'reviewed_at', 'UPDATE'),
  'authenticated lacks UPDATE on gallery_photos.reviewed_at'
);

select ok(
  not has_column_privilege('authenticated', 'public.gallery_photos', 'storage_path', 'UPDATE'),
  'authenticated lacks UPDATE on gallery_photos.storage_path'
);

select ok(
  not has_column_privilege('authenticated', 'public.gallery_photos', 'gallery_id', 'UPDATE'),
  'authenticated lacks UPDATE on gallery_photos.gallery_id'
);

select ok(
  not has_column_privilege('authenticated', 'public.gallery_photos', 'uploaded_by', 'UPDATE'),
  'authenticated lacks UPDATE on gallery_photos.uploaded_by'
);

select ok(
  has_column_privilege('authenticated', 'public.gallery_photos', 'caption', 'UPDATE'),
  'authenticated has UPDATE on gallery_photos.caption'
);

select ok(
  has_column_privilege('authenticated', 'public.gallery_photos', 'sort_order', 'UPDATE'),
  'authenticated has UPDATE on gallery_photos.sort_order'
);

-- anon: read-only on both tables

select ok(
  not has_table_privilege('anon', 'public.gallery_photos', 'insert'),
  'anon lacks INSERT on gallery_photos'
);

select ok(
  not has_table_privilege('anon', 'public.gallery_photos', 'update'),
  'anon lacks UPDATE on gallery_photos'
);

select ok(
  not has_table_privilege('anon', 'public.gallery_photos', 'delete'),
  'anon lacks DELETE on gallery_photos'
);

select ok(
  has_table_privilege('anon', 'public.gallery_photos', 'select'),
  'anon has SELECT on gallery_photos'
);

select ok(
  not has_table_privilege('anon', 'public.galleries', 'insert'),
  'anon lacks INSERT on galleries'
);

select ok(
  not has_table_privilege('anon', 'public.galleries', 'update'),
  'anon lacks UPDATE on galleries'
);

select ok(
  not has_table_privilege('anon', 'public.galleries', 'delete'),
  'anon lacks DELETE on galleries'
);

select ok(
  has_table_privilege('anon', 'public.galleries', 'select'),
  'anon has SELECT on galleries'
);

select * from finish();
rollback;
