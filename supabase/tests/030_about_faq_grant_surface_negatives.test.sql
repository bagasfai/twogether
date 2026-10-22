-- Negative half of the grant-surface pins for the About/FAQ work
-- (20261022000001_about_faq.sql, 20261022000002_faq_rpcs.sql). Same rationale
-- as 026_gallery_grant_surface_negatives.test.sql: the faq_* RPCs rely on an
-- explicit `revoke execute ... from public, anon`, and faq_items.sort_order on
-- a column-level grant that omits it, as the real boundary. A regression to
-- default privileges passes every RLS and behaviour test; only a pin on the
-- *absence* of the privilege catches it.
--
-- Catalog-privilege checks only; no fixtures or role switching.

begin;
select plan(23);

-- anon lacks EXECUTE

select ok(
  not has_function_privilege('anon', 'public.faq_create(text, text, text, text)', 'EXECUTE'),
  'anon lacks EXECUTE on faq_create'
);

select ok(
  not has_function_privilege('anon', 'public.faq_move(uuid, text)', 'EXECUTE'),
  'anon lacks EXECUTE on faq_move'
);

select ok(
  not has_function_privilege('anon', 'public.faq_delete(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on faq_delete'
);

-- PUBLIC pseudo-role lacks EXECUTE (null proacl counts as granted)

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.faq_create(text, text, text, text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on faq_create'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.faq_move(uuid, text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on faq_move'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.faq_delete(uuid)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on faq_delete'
);

-- authenticated keeps EXECUTE

select ok(
  has_function_privilege('authenticated', 'public.faq_create(text, text, text, text)', 'EXECUTE'),
  'authenticated has EXECUTE on faq_create'
);

select ok(
  has_function_privilege('authenticated', 'public.faq_move(uuid, text)', 'EXECUTE'),
  'authenticated has EXECUTE on faq_move'
);

select ok(
  has_function_privilege('authenticated', 'public.faq_delete(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on faq_delete'
);

-- faq_lock_key() deliberately keeps the default PUBLIC EXECUTE: it is an
-- immutable constant (hashtextextended of a literal), leaks nothing and
-- grants no access to data. Pinned so a change is a conscious decision.

select ok(
  exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.faq_lock_key()'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'faq_lock_key keeps default PUBLIC EXECUTE (harmless constant, pinned)'
);

-- no direct INSERT/DELETE for anon or authenticated (About row is seeded; FAQ rows via RPC)

select ok(
  not has_table_privilege('anon', 'public.community_about', 'insert'),
  'anon lacks INSERT on community_about'
);

select ok(
  not has_table_privilege('anon', 'public.community_about', 'delete'),
  'anon lacks DELETE on community_about'
);

select ok(
  not has_table_privilege('anon', 'public.faq_items', 'insert'),
  'anon lacks INSERT on faq_items'
);

select ok(
  not has_table_privilege('anon', 'public.faq_items', 'delete'),
  'anon lacks DELETE on faq_items'
);

select ok(
  not has_table_privilege('authenticated', 'public.community_about', 'insert'),
  'authenticated lacks INSERT on community_about'
);

select ok(
  not has_table_privilege('authenticated', 'public.community_about', 'delete'),
  'authenticated lacks DELETE on community_about'
);

select ok(
  not has_table_privilege('authenticated', 'public.faq_items', 'insert'),
  'authenticated lacks INSERT on faq_items'
);

select ok(
  not has_table_privilege('authenticated', 'public.faq_items', 'delete'),
  'authenticated lacks DELETE on faq_items'
);

-- anon: no UPDATE

select ok(
  not has_table_privilege('anon', 'public.community_about', 'update'),
  'anon lacks UPDATE on community_about'
);

select ok(
  not has_table_privilege('anon', 'public.faq_items', 'update'),
  'anon lacks UPDATE on faq_items'
);

-- authenticated: key and ordering columns are not updatable (FAQ order only via faq_move)

select ok(
  not has_column_privilege('authenticated', 'public.faq_items', 'sort_order', 'UPDATE'),
  'authenticated lacks UPDATE on faq_items.sort_order'
);

select ok(
  not has_column_privilege('authenticated', 'public.faq_items', 'id', 'UPDATE'),
  'authenticated lacks UPDATE on faq_items.id'
);

select ok(
  not has_column_privilege('authenticated', 'public.community_about', 'id', 'UPDATE'),
  'authenticated lacks UPDATE on community_about.id'
);

select * from finish();
rollback;
