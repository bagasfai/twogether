-- Negative half of the grant-surface pins for the socials/partner work
-- (20261029000001_socials_partner.sql). Same rationale as
-- 030_about_faq_grant_surface_negatives.test.sql: the social_link_* RPCs rely
-- on an explicit `revoke execute ... from public, anon`, and
-- partner_inquiries / social_links on column-level grants, as the real
-- boundary. A regression to default privileges passes every RLS and
-- behaviour test; only a pin on the *absence* of the privilege catches it.
--
-- Catalog-privilege checks only; no fixtures or role switching.

begin;
select plan(35);

-- ---- social_link_* RPCs: anon lacks EXECUTE ----

select ok(
  not has_function_privilege('anon', 'public.social_link_create(public.social_platform, text, text, boolean)', 'EXECUTE'),
  'anon lacks EXECUTE on social_link_create'
);

select ok(
  not has_function_privilege('anon', 'public.social_link_move(uuid, text)', 'EXECUTE'),
  'anon lacks EXECUTE on social_link_move'
);

select ok(
  not has_function_privilege('anon', 'public.social_link_delete(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on social_link_delete'
);

-- PUBLIC pseudo-role lacks EXECUTE (null proacl counts as granted)

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.social_link_create(public.social_platform, text, text, boolean)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on social_link_create'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.social_link_move(uuid, text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on social_link_move'
);

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.social_link_delete(uuid)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on social_link_delete'
);

-- authenticated keeps EXECUTE (the admin check is inside)

select ok(
  has_function_privilege('authenticated', 'public.social_link_create(public.social_platform, text, text, boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.social_link_move(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.social_link_delete(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on every social_link_* RPC'
);

-- social_links_lock_key() is only called from the security definer RPCs, so
-- nobody else needs it: revoked from PUBLIC, anon and authenticated.

select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.social_links_lock_key()'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC lacks EXECUTE on social_links_lock_key'
);

select ok(
  not has_function_privilege('anon', 'public.social_links_lock_key()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.social_links_lock_key()', 'EXECUTE'),
  'anon and authenticated lack EXECUTE on social_links_lock_key'
);

-- ---- partner_inquiries: anon has nothing ----

select ok(
  not has_table_privilege('anon', 'public.partner_inquiries', 'SELECT'),
  'anon lacks SELECT on partner_inquiries'
);

select ok(
  not has_table_privilege('anon', 'public.partner_inquiries', 'INSERT'),
  'anon lacks INSERT on partner_inquiries'
);

select ok(
  not has_any_column_privilege('anon', 'public.partner_inquiries', 'UPDATE'),
  'anon lacks UPDATE on every partner_inquiries column'
);

select ok(
  not has_table_privilege('anon', 'public.partner_inquiries', 'DELETE'),
  'anon lacks DELETE on partner_inquiries'
);

-- ---- partner_inquiries: authenticated has SELECT and UPDATE (status) only ----

select ok(
  not has_table_privilege('authenticated', 'public.partner_inquiries', 'INSERT'),
  'authenticated lacks INSERT on partner_inquiries'
);

select ok(
  not has_table_privilege('authenticated', 'public.partner_inquiries', 'DELETE'),
  'authenticated lacks DELETE on partner_inquiries'
);

select ok(
  has_column_privilege('authenticated', 'public.partner_inquiries', 'status', 'UPDATE'),
  'authenticated has UPDATE on partner_inquiries.status'
);

select ok(
  not has_column_privilege('authenticated', 'public.partner_inquiries', 'message', 'UPDATE'),
  'authenticated lacks UPDATE on partner_inquiries.message'
);

select ok(
  not has_column_privilege('authenticated', 'public.partner_inquiries', 'email_sent_at', 'UPDATE'),
  'authenticated lacks UPDATE on partner_inquiries.email_sent_at'
);

select is(
  (select array_agg(column_name::text order by column_name::text)
     from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'partner_inquiries'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'),
  array['status'],
  'status is the only partner_inquiries column authenticated can update'
);

select ok(
  not has_table_privilege('authenticated', 'public.partner_inquiries', 'TRUNCATE')
  and not has_table_privilege('anon', 'public.partner_inquiries', 'TRUNCATE'),
  'nobody but the owner can truncate partner_inquiries'
);

-- ---- social_links: no direct INSERT/DELETE, sort_order only via RPC ----

select ok(
  not has_table_privilege('anon', 'public.social_links', 'INSERT')
  and not has_table_privilege('anon', 'public.social_links', 'DELETE')
  and not has_any_column_privilege('anon', 'public.social_links', 'UPDATE'),
  'anon lacks INSERT, UPDATE and DELETE on social_links'
);

select ok(
  not has_table_privilege('authenticated', 'public.social_links', 'INSERT'),
  'authenticated lacks INSERT on social_links'
);

select ok(
  not has_table_privilege('authenticated', 'public.social_links', 'DELETE'),
  'authenticated lacks DELETE on social_links'
);

select is(
  (select array_agg(column_name::text order by column_name::text)
     from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'social_links'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'),
  array['is_visible', 'label', 'platform', 'url'],
  'authenticated can update only platform, url, label and is_visible on social_links'
);

select ok(
  not has_column_privilege('authenticated', 'public.social_links', 'sort_order', 'UPDATE'),
  'authenticated lacks UPDATE on social_links.sort_order'
);

-- ---- featured_posts: anon has SELECT only ----

select ok(
  not has_table_privilege('anon', 'public.featured_posts', 'INSERT')
  and not has_table_privilege('anon', 'public.featured_posts', 'DELETE')
  and not has_any_column_privilege('anon', 'public.featured_posts', 'UPDATE'),
  'anon lacks INSERT, UPDATE and DELETE on featured_posts'
);

select ok(
  not has_column_privilege('authenticated', 'public.featured_posts', 'id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.featured_posts', 'created_by', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.featured_posts', 'created_at', 'UPDATE'),
  'authenticated lacks UPDATE on featured_posts id, created_by and created_at'
);

select ok(
  not has_column_privilege('authenticated', 'public.featured_posts', 'id', 'INSERT'),
  'authenticated lacks INSERT on featured_posts.id'
);

-- ---- featured-posts storage: no anon policies ----

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'featured_posts_%'
      and 'anon' = any(roles)),
  0,
  'no featured-posts storage policy targets anon'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'featured_posts_%'
      and 'public' = any(roles)),
  0,
  'no featured-posts storage policy targets PUBLIC'
);

select is(
  (select array_agg(cmd order by cmd) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'featured_posts_%'),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'featured-posts has exactly one storage policy per command'
);

select ok(
  (select bool_and(coalesce(qual, '') ~ 'is_admin\(\)'
                   or coalesce(with_check, '') ~ 'is_admin\(\)')
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'featured_posts_%'),
  'every featured-posts storage policy checks is_admin()'
);

-- ---- table policies never target PUBLIC ----

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('social_links', 'featured_posts', 'partner_inquiries')
      and 'public' = any(roles)),
  0,
  'no table policy on the three tables targets PUBLIC'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_inquiries'
      and 'anon' = any(roles)),
  0,
  'no partner_inquiries policy targets anon'
);

select ok(
  not has_table_privilege('authenticated', 'public.social_links', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.featured_posts', 'TRUNCATE'),
  'authenticated cannot truncate social_links or featured_posts'
);

select * from finish();
rollback;
