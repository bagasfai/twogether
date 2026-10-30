-- Socials, featured posts and partner inquiries: schema checks, RLS, column
-- grants, social_link_* RPCs and the featured-posts storage policies
-- (20261029000001_socials_partner.sql,
-- docs/superpowers/specs/2026-10-29-socials-partner-design.md "Database").
--
-- partner_inquiries: anon has no privilege at all (42501). Members share the
-- `authenticated` role with admins, so they hold the same SELECT and
-- UPDATE (status) grants; RLS (is_admin()) is what hides every row from them,
-- so a member sees 0 rows and updates 0 rows rather than raising 42501.
--
-- Storage cases write storage.objects directly under the caller's role, like
-- 027_gallery_storage.test.sql. storage.allow_delete_query is set so the
-- DELETE policy, not storage.protect_delete, decides the rowcount.
--   1. schema
--   2. social_links RLS
--   3. featured_posts RLS
--   4. partner_inquiries RLS and column grants
--   5. check constraints
--   6. social_link_* RPCs
--   7. featured-posts storage

begin;
select plan(70);

-- ---- fixtures (as postgres) ----

insert into auth.users (id, email) values
  ('11111111-4747-4747-4747-474747474747', 'admin-047@test.local'),
  ('22222222-4747-4747-4747-474747474747', 'host-047@test.local'),
  ('33333333-4747-4747-4747-474747474747', 'member-047@test.local');

update public.profiles set role = 'admin'
 where id = '11111111-4747-4747-4747-474747474747';
update public.profiles set role = 'host'
 where id = '22222222-4747-4747-4747-474747474747';

insert into public.social_links (id, platform, url, label, sort_order, is_visible) values
  ('a0000001-4747-4747-4747-474747474747', 'instagram',
   'https://instagram.com/jakbartwogether', '@jakbartwogether', 1, true),
  ('a0000002-4747-4747-4747-474747474747', 'tiktok',
   'https://tiktok.com/@jakbartwogether', '@jakbartwogether', 2, false),
  ('a0000003-4747-4747-4747-474747474747', 'ayo',
   'https://ayo.co.id/jakbar', 'Jakbar Twogether di AYO', 3, true);

insert into public.featured_posts
  (id, platform, post_url, image_path, caption_en, caption_id, kind, is_visible)
values
  ('b0000001-4747-4747-4747-474747474747', 'instagram',
   'https://instagram.com/p/1', 'p1.webp', 'Caption 1', 'Keterangan 1', 'schedule', true),
  ('b0000002-4747-4747-4747-474747474747', 'tiktok',
   'https://tiktok.com/v/2', 'p2.webp', 'Caption 2', 'Keterangan 2', 'video', false);

insert into public.partner_inquiries
  (id, name, organisation, email, whatsapp, inquiry_type, message, ip_hash)
values
  ('c0000001-4747-4747-4747-474747474747', 'Budi', 'Acme', 'budi@acme.test',
   '+628123456789', 'sponsorship', 'We would like to sponsor a session.', 'hash-1');

-- Holds ids the admin creates through social_link_create.
create temp table made (k int primary key, id uuid not null);
grant all on made to authenticated, anon;

-- ======== 1. schema ========

select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.social_links'::regclass,
                  'public.featured_posts'::regclass,
                  'public.partner_inquiries'::regclass)),
  'RLS is enabled on all three tables'
);

select is(
  (select count(*)::int from pg_trigger
    where tgrelid in ('public.social_links'::regclass,
                      'public.featured_posts'::regclass,
                      'public.partner_inquiries'::regclass)
      and tgfoid = 'public.set_updated_at()'::regprocedure
      and not tgisinternal),
  3,
  'all three tables have a set_updated_at trigger'
);

select ok(
  (select condeferrable and not condeferred from pg_constraint
    where conname = 'social_links_sort_order_key'
      and conrelid = 'public.social_links'::regclass),
  'social_links_sort_order_key is deferrable initially immediate'
);

select is(
  public.social_links_lock_key(),
  hashtextextended('social_links', 0),
  'social_links_lock_key returns hashtextextended(''social_links'', 0)'
);

select ok(
  (select bool_and(prosecdef) from pg_proc
    where oid in ('public.social_link_create(public.social_platform,text,text,boolean)'::regprocedure,
                  'public.social_link_move(uuid,text)'::regprocedure,
                  'public.social_link_delete(uuid)'::regprocedure)),
  'all three social_link_* RPCs are security definer'
);

select ok(
  (select bool_and(proconfig @> array['search_path=""']) from pg_proc
    where oid in ('public.social_link_create(public.social_platform,text,text,boolean)'::regprocedure,
                  'public.social_link_move(uuid,text)'::regprocedure,
                  'public.social_link_delete(uuid)'::regprocedure)),
  'all three social_link_* RPCs pin an empty search_path'
);

-- ======== 2. social_links RLS ========

set local role anon;
set local request.jwt.claims = '';

select is(
  (select array_agg(id order by sort_order) from public.social_links),
  array['a0000001-4747-4747-4747-474747474747',
        'a0000003-4747-4747-4747-474747474747']::uuid[],
  'anon sees only visible social links'
);

select throws_ok(
  $$ insert into public.social_links (platform, url, label, sort_order)
     values ('other', 'https://x.test', 'x', 99) $$,
  '42501', null, 'anon cannot insert social_links');

select throws_ok(
  $$ update public.social_links set label = 'x' $$,
  '42501', null, 'anon cannot update social_links');

select throws_ok(
  $$ delete from public.social_links $$,
  '42501', null, 'anon cannot delete social_links');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-4747-4747-4747-474747474747","role":"authenticated"}';

select is(
  (select array_agg(id order by sort_order) from public.social_links),
  array['a0000001-4747-4747-4747-474747474747',
        'a0000003-4747-4747-4747-474747474747']::uuid[],
  'a member sees only visible social links'
);

select throws_ok(
  $$ insert into public.social_links (platform, url, label, sort_order)
     values ('other', 'https://x.test', 'x', 99) $$,
  '42501', null, 'a member cannot insert social_links');

select results_eq(
  $$ with u as (update public.social_links set label = 'hacked' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a member updates 0 social_links rows');

select throws_ok(
  $$ delete from public.social_links $$,
  '42501', null, 'a member cannot delete social_links');

select throws_ok(
  $$ update public.social_links set sort_order = 50 $$,
  '42501', null, 'sort_order is not directly updatable (only via social_link_move)');

-- host is not admin
set local request.jwt.claims = '{"sub":"22222222-4747-4747-4747-474747474747","role":"authenticated"}';

select results_eq(
  $$ with u as (update public.social_links set label = 'hacked' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a host updates 0 social_links rows');

-- admin
set local request.jwt.claims = '{"sub":"11111111-4747-4747-4747-474747474747","role":"authenticated"}';

select is(
  (select count(*)::int from public.social_links),
  3,
  'admin sees hidden social links too'
);

select results_eq(
  $$ with u as (update public.social_links
                   set platform = 'other', url = 'https://ayo.co.id/x',
                       label = 'AYO', is_visible = false
                 where id = 'a0000003-4747-4747-4747-474747474747'
                 returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'admin can update platform, url, label and is_visible');

select throws_ok(
  $$ insert into public.social_links (platform, url, label, sort_order)
     values ('other', 'https://x.test', 'x', 99) $$,
  '42501', null, 'admin cannot insert social_links directly (only via social_link_create)');

select throws_ok(
  $$ delete from public.social_links $$,
  '42501', null, 'admin cannot delete social_links directly (only via social_link_delete)');

reset role;

-- ======== 3. featured_posts RLS ========

set local role anon;
set local request.jwt.claims = '';

select is(
  (select array_agg(id) from public.featured_posts),
  array['b0000001-4747-4747-4747-474747474747']::uuid[],
  'anon sees only visible featured posts'
);

select throws_ok(
  $$ insert into public.featured_posts (platform, post_url, image_path, caption_en, caption_id, kind)
     values ('other', 'https://x.test', 'x.webp', 'c', 'c', 'other') $$,
  '42501', null, 'anon cannot insert featured_posts');

select throws_ok(
  $$ update public.featured_posts set caption_en = 'x' $$,
  '42501', null, 'anon cannot update featured_posts');

select throws_ok(
  $$ delete from public.featured_posts $$,
  '42501', null, 'anon cannot delete featured_posts');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-4747-4747-4747-474747474747","role":"authenticated"}';

select is(
  (select array_agg(id) from public.featured_posts),
  array['b0000001-4747-4747-4747-474747474747']::uuid[],
  'a member sees only visible featured posts'
);

select throws_ok(
  $$ insert into public.featured_posts (platform, post_url, image_path, caption_en, caption_id, kind)
     values ('other', 'https://x.test', 'x.webp', 'c', 'c', 'other') $$,
  '42501', null, 'a member cannot insert featured_posts (RLS)');

select results_eq(
  $$ with u as (update public.featured_posts set caption_en = 'hacked' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a member updates 0 featured_posts rows');

select results_eq(
  $$ with d as (delete from public.featured_posts returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a member deletes 0 featured_posts rows');

-- admin
set local request.jwt.claims = '{"sub":"11111111-4747-4747-4747-474747474747","role":"authenticated"}';

select is(
  (select count(*)::int from public.featured_posts),
  2,
  'admin sees hidden featured posts too'
);

select lives_ok(
  $$ insert into public.featured_posts
       (platform, post_url, image_path, caption_en, caption_id, kind, created_by)
     values ('whatsapp', 'https://wa.me/p3',
             'p3.webp', 'C3', 'K3', 'match', '11111111-4747-4747-4747-474747474747') $$,
  'admin can insert featured_posts');

select results_eq(
  $$ with u as (update public.featured_posts set caption_en = 'Edited', is_visible = false
                 where id = 'b0000001-4747-4747-4747-474747474747' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'admin can update featured_posts');

select results_eq(
  $$ with d as (delete from public.featured_posts
                 where id = 'b0000002-4747-4747-4747-474747474747' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'admin can delete featured_posts');

reset role;

select is(
  (select posted_at from public.featured_posts where post_url = 'https://wa.me/p3'),
  (now() at time zone 'Asia/Jakarta')::date,
  'posted_at defaults to today in Asia/Jakarta'
);

-- ======== 4. partner_inquiries ========

set local role anon;
set local request.jwt.claims = '';

select throws_ok(
  $$ select count(*) from public.partner_inquiries $$,
  '42501', null, 'anon cannot select partner_inquiries');

select throws_ok(
  $$ insert into public.partner_inquiries
       (name, organisation, email, whatsapp, inquiry_type, message, ip_hash)
     values ('A', 'B', 'a@b.test', '+628123456789', 'other', 'Hello there!', 'h') $$,
  '42501', null, 'anon cannot insert partner_inquiries');

select throws_ok(
  $$ update public.partner_inquiries set status = 'closed' $$,
  '42501', null, 'anon cannot update partner_inquiries');

select throws_ok(
  $$ delete from public.partner_inquiries $$,
  '42501', null, 'anon cannot delete partner_inquiries');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-4747-4747-4747-474747474747","role":"authenticated"}';

select is(
  (select count(*)::int from public.partner_inquiries),
  0,
  'a member sees no partner_inquiries rows'
);

select results_eq(
  $$ with u as (update public.partner_inquiries set status = 'closed' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a member updates 0 partner_inquiries rows');

select throws_ok(
  $$ insert into public.partner_inquiries
       (name, organisation, email, whatsapp, inquiry_type, message, ip_hash)
     values ('A', 'B', 'a@b.test', '+628123456789', 'other', 'Hello there!', 'h') $$,
  '42501', null, 'a member cannot insert partner_inquiries');

select throws_ok(
  $$ delete from public.partner_inquiries $$,
  '42501', null, 'a member cannot delete partner_inquiries');

-- host is not admin
set local request.jwt.claims = '{"sub":"22222222-4747-4747-4747-474747474747","role":"authenticated"}';

select is(
  (select count(*)::int from public.partner_inquiries),
  0,
  'a host sees no partner_inquiries rows'
);

-- admin
set local request.jwt.claims = '{"sub":"11111111-4747-4747-4747-474747474747","role":"authenticated"}';

select is(
  (select count(*)::int from public.partner_inquiries),
  1,
  'admin can select partner_inquiries'
);

select results_eq(
  $$ with u as (update public.partner_inquiries set status = 'replied' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'admin can update partner_inquiries.status');

select throws_ok(
  $$ update public.partner_inquiries set message = 'x' $$,
  '42501', null, 'admin cannot update partner_inquiries.message');

select throws_ok(
  $$ update public.partner_inquiries set email_sent_at = now() $$,
  '42501', null, 'admin cannot update partner_inquiries.email_sent_at');

select throws_ok(
  $$ insert into public.partner_inquiries
       (name, organisation, email, whatsapp, inquiry_type, message, ip_hash)
     values ('A', 'B', 'a@b.test', '+628123456789', 'other', 'Hello there!', 'h') $$,
  '42501', null, 'admin cannot insert partner_inquiries');

select throws_ok(
  $$ delete from public.partner_inquiries $$,
  '42501', null, 'admin cannot delete partner_inquiries');

reset role;

select is(
  (select status::text from public.partner_inquiries
    where id = 'c0000001-4747-4747-4747-474747474747'),
  'replied',
  'the admin status change persisted'
);

-- ======== 5. check constraints (as postgres) ========

select throws_ok(
  $$ insert into public.social_links (platform, url, label, sort_order)
     values ('other', 'http://x.com', 'x', 100) $$,
  '23514', null, 'a non-https social link url is rejected');

select throws_ok(
  $$ insert into public.featured_posts (platform, post_url, image_path, caption_en, caption_id, kind)
     values ('other', 'http://x.com', 'x.webp', 'c', 'c', 'other') $$,
  '23514', null, 'a non-https featured post url is rejected');

select throws_ok(
  $$ insert into public.partner_inquiries
       (name, organisation, email, whatsapp, inquiry_type, message, ip_hash)
     values ('A', 'B', 'a@b.test', '12ab', 'other', 'Hello there!', 'h') $$,
  '23514', null, 'a malformed whatsapp number is rejected');

-- ======== 6. social_link_* RPCs ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-4747-4747-4747-474747474747","role":"authenticated"}';

select throws_ok(
  $$ select public.social_link_create('other', 'https://x.test', 'x', true) $$,
  'JB007', null, 'a member cannot social_link_create');

select throws_ok(
  $$ select public.social_link_move('a0000001-4747-4747-4747-474747474747', 'down') $$,
  'JB007', null, 'a member cannot social_link_move');

select throws_ok(
  $$ select public.social_link_delete('a0000001-4747-4747-4747-474747474747') $$,
  'JB007', null, 'a member cannot social_link_delete');

set local role anon;
set local request.jwt.claims = '';

select throws_ok(
  $$ select public.social_link_create('other', 'https://x.test', 'x', true) $$,
  '42501', null, 'anon cannot social_link_create (privilege error)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-4747-4747-4747-474747474747","role":"authenticated"}';

insert into made select 1, public.social_link_create('whatsapp', 'https://wa.me/628123456789', 'WhatsApp Community', false);

select is(
  (select sort_order from public.social_links where id = (select id from made where k = 1)),
  4,
  'social_link_create appends at max(sort_order) + 1'
);

select is(
  (select is_visible from public.social_links where id = (select id from made where k = 1)),
  false,
  'social_link_create stores p_is_visible'
);

select public.social_link_move((select id from made where k = 1), 'up');

select is(
  (select array_agg(id order by sort_order) from public.social_links),
  array['a0000001-4747-4747-4747-474747474747',
        'a0000002-4747-4747-4747-474747474747',
        (select id from made where k = 1),
        'a0000003-4747-4747-4747-474747474747']::uuid[],
  'social_link_move up swaps the link with its neighbour'
);

select throws_ok(
  $$ select public.social_link_move('a0000001-4747-4747-4747-474747474747', 'sideways') $$,
  'JB011', null, 'social_link_move with an invalid direction raises JB011');

select lives_ok(
  $$ select public.social_link_delete('a0000002-4747-4747-4747-474747474747') $$,
  'admin can social_link_delete');

select is(
  (select array_agg(sort_order order by sort_order) from public.social_links),
  array[1, 2, 3],
  'positions are gapless after social_link_delete'
);

reset role;

-- ======== 7. featured-posts storage ========

select ok(
  (select public and file_size_limit = 5242880
          and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
     from storage.buckets where id = 'featured-posts'),
  'featured-posts bucket is public, 5 MB, jpeg/png/webp only'
);

insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('featured-posts', 'd0000001-4747-4747-4747-474747474747.webp',
   '11111111-4747-4747-4747-474747474747', '11111111-4747-4747-4747-474747474747'),
  ('featured-posts', 'd0000002-4747-4747-4747-474747474747.webp',
   '11111111-4747-4747-4747-474747474747', '11111111-4747-4747-4747-474747474747');

set local storage.allow_delete_query = 'true';

set local role anon;
set local request.jwt.claims = '';

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('featured-posts', 'e0000001-4747-4747-4747-474747474747.webp') $$,
  '42501', null, 'anon cannot upload to featured-posts');

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-4747-4747-4747-474747474747","role":"authenticated"}';

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('featured-posts', 'e0000002-4747-4747-4747-474747474747.webp',
             '33333333-4747-4747-4747-474747474747', '33333333-4747-4747-4747-474747474747') $$,
  '42501', null, 'a member cannot upload to featured-posts');

select results_eq(
  $$ with u as (update storage.objects set name = 'moved.webp'
                 where bucket_id = 'featured-posts' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a member updates 0 featured-posts objects');

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'featured-posts' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a member deletes 0 featured-posts objects');

-- admin
set local request.jwt.claims = '{"sub":"11111111-4747-4747-4747-474747474747","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, owner_id)
     values ('featured-posts', 'e0000003-4747-4747-4747-474747474747.webp',
             '11111111-4747-4747-4747-474747474747', '11111111-4747-4747-4747-474747474747') $$,
  'admin can upload to featured-posts');

select results_eq(
  $$ with u as (update storage.objects set name = 'd0000009-4747-4747-4747-474747474747.webp'
                 where bucket_id = 'featured-posts'
                   and name = 'd0000002-4747-4747-4747-474747474747.webp' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'admin can update a featured-posts object');

select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'featured-posts'
                   and name = 'd0000001-4747-4747-4747-474747474747.webp' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'admin can delete a featured-posts object');

reset role;

select * from finish();
rollback;
