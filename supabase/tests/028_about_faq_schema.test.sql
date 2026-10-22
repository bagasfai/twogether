-- About / FAQ schema, RLS and grants (docs/superpowers/specs/2026-10-22-about-faq-design.md).
-- Writes are admin-only: authenticated has column-level UPDATE only, no
-- INSERT/DELETE. Hosts are deliberately not admins here.

begin;
select plan(67);

-- ---- fixtures ----

insert into auth.users (id, email) values
  ('11111111-7777-7777-7777-777777777777', 'admin-028@test.local'),
  ('22222222-7777-7777-7777-777777777777', 'host-028@test.local'),
  ('33333333-7777-7777-7777-777777777777', 'member-028@test.local');

update public.profiles set role = 'admin'
 where id = '11111111-7777-7777-7777-777777777777';
update public.profiles set role = 'host'
 where id = '22222222-7777-7777-7777-777777777777';

insert into public.faq_items
  (id, question_en, question_id, answer_en, answer_id, sort_order)
values
  ('f0000001-7777-7777-7777-777777777777', 'Q1 en', 'Q1 id', 'A1 en', 'A1 id', 1),
  ('f0000002-7777-7777-7777-777777777777', 'Q2 en', 'Q2 id', 'A2 en', 'A2 id', 2);

select is(
  (select count(*)::int from public.community_about),
  1,
  'the migration seeded exactly one community_about row'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.community_about'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.faq_items'::regclass),
  'RLS is enabled on both tables'
);

select is(
  public.faq_lock_key(),
  hashtextextended('faq_items', 0),
  'faq_lock_key returns hashtextextended(''faq_items'', 0)'
);

select is(
  (select provolatile::text from pg_proc where oid = 'public.faq_lock_key()'::regprocedure),
  'i',
  'faq_lock_key is immutable'
);

select is(
  (select count(*)::int from pg_trigger
    where tgrelid in ('public.community_about'::regclass, 'public.faq_items'::regclass)
      and tgfoid = 'public.set_updated_at()'::regprocedure
      and not tgisinternal),
  2,
  'both tables have a set_updated_at trigger'
);

select ok(
  (select condeferrable and not condeferred from pg_constraint
    where conname = 'faq_items_sort_order_key'
      and conrelid = 'public.faq_items'::regclass),
  'faq_items_sort_order_key is deferrable initially immediate'
);

-- ======== visibility ========

set local role anon;
set local request.jwt.claims = '';

select is(
  (select count(*)::int from public.community_about), 1,
  'anon can select community_about'
);

select is(
  (select count(*)::int from public.faq_items), 2,
  'anon can select faq_items'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-7777-7777-7777-777777777777","role":"authenticated"}';

select is(
  (select count(*)::int from public.community_about), 1,
  'a member can select community_about'
);

select is(
  (select count(*)::int from public.faq_items), 2,
  'a member can select faq_items'
);

reset role;

-- ======== privileges ========

select ok(
  not has_table_privilege('authenticated', 'public.community_about', 'insert')
  and not has_table_privilege('authenticated', 'public.community_about', 'delete'),
  'authenticated has no insert or delete on community_about'
);

select ok(
  not has_table_privilege('authenticated', 'public.faq_items', 'insert')
  and not has_table_privilege('authenticated', 'public.faq_items', 'delete'),
  'authenticated has no insert or delete on faq_items'
);

select ok(
  not has_table_privilege('anon', 'public.community_about', 'insert')
  and not has_table_privilege('anon', 'public.community_about', 'delete')
  and not has_table_privilege('anon', 'public.community_about', 'update'),
  'anon has no insert, update or delete on community_about'
);

select ok(
  not has_table_privilege('anon', 'public.faq_items', 'insert')
  and not has_table_privilege('anon', 'public.faq_items', 'delete')
  and not has_table_privilege('anon', 'public.faq_items', 'update'),
  'anon has no insert, update or delete on faq_items'
);

select ok(
  not has_column_privilege('authenticated', 'public.faq_items', 'sort_order', 'update'),
  'authenticated lacks update on faq_items.sort_order'
);

select ok(
  has_column_privilege('authenticated', 'public.faq_items', 'question_en', 'update')
  and has_column_privilege('authenticated', 'public.faq_items', 'answer_id', 'update'),
  'authenticated has update on the faq text columns'
);

select ok(
  not has_column_privilege('authenticated', 'public.faq_items', 'id', 'update')
  and not has_column_privilege('authenticated', 'public.faq_items', 'created_at', 'update')
  and not has_column_privilege('authenticated', 'public.faq_items', 'updated_at', 'update'),
  'authenticated lacks update on faq_items id, created_at and updated_at'
);

select ok(
  has_column_privilege('authenticated', 'public.community_about', 'title_en', 'update')
  and has_column_privilege('authenticated', 'public.community_about', 'body_id', 'update')
  and has_column_privilege('authenticated', 'public.community_about', 'updated_by', 'update'),
  'authenticated has update on the community_about text columns and updated_by'
);

select ok(
  not has_column_privilege('authenticated', 'public.community_about', 'id', 'update')
  and not has_column_privilege('authenticated', 'public.community_about', 'updated_at', 'update'),
  'authenticated lacks update on community_about id and updated_at'
);

-- ======== second About row ========

select throws_ok(
  $$ insert into public.community_about (id, title_en, title_id, body_en, body_id)
     values (false, 't', 't', 'b', 'b') $$,
  '23514', null,
  'a community_about row with id = false is rejected'
);

select throws_ok(
  $$ insert into public.community_about (id, title_en, title_id, body_en, body_id)
     values (true, 't', 't', 'b', 'b') $$,
  '23505', null,
  'a second community_about row with id = true is rejected'
);

-- ======== text checks (as admin, so only the constraints can reject) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-7777-7777-7777-777777777777","role":"authenticated"}';

select throws_ok(
  $$ update public.community_about set title_en = '' where id = true $$,
  '23514', null,
  'community_about.title_en: blank is rejected'
);

select throws_ok(
  $$ update public.community_about set title_en = '   ' where id = true $$,
  '23514', null,
  'community_about.title_en: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.community_about set title_en = repeat('x', 121) where id = true $$,
  '23514', null,
  'community_about.title_en: over-length (121 chars) is rejected'
);

select throws_ok(
  $$ update public.community_about set title_id = '' where id = true $$,
  '23514', null,
  'community_about.title_id: blank is rejected'
);

select throws_ok(
  $$ update public.community_about set title_id = '   ' where id = true $$,
  '23514', null,
  'community_about.title_id: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.community_about set title_id = repeat('x', 121) where id = true $$,
  '23514', null,
  'community_about.title_id: over-length (121 chars) is rejected'
);

select throws_ok(
  $$ update public.community_about set body_en = '' where id = true $$,
  '23514', null,
  'community_about.body_en: blank is rejected'
);

select throws_ok(
  $$ update public.community_about set body_en = '   ' where id = true $$,
  '23514', null,
  'community_about.body_en: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.community_about set body_en = repeat('x', 8001) where id = true $$,
  '23514', null,
  'community_about.body_en: over-length (8001 chars) is rejected'
);

select throws_ok(
  $$ update public.community_about set body_id = '' where id = true $$,
  '23514', null,
  'community_about.body_id: blank is rejected'
);

select throws_ok(
  $$ update public.community_about set body_id = '   ' where id = true $$,
  '23514', null,
  'community_about.body_id: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.community_about set body_id = repeat('x', 8001) where id = true $$,
  '23514', null,
  'community_about.body_id: over-length (8001 chars) is rejected'
);

select throws_ok(
  $$ update public.faq_items set question_en = '' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.question_en: blank is rejected'
);

select throws_ok(
  $$ update public.faq_items set question_en = '   ' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.question_en: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.faq_items set question_en = repeat('x', 201) where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.question_en: over-length (201 chars) is rejected'
);

select throws_ok(
  $$ update public.faq_items set question_id = '' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.question_id: blank is rejected'
);

select throws_ok(
  $$ update public.faq_items set question_id = '   ' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.question_id: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.faq_items set question_id = repeat('x', 201) where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.question_id: over-length (201 chars) is rejected'
);

select throws_ok(
  $$ update public.faq_items set answer_en = '' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.answer_en: blank is rejected'
);

select throws_ok(
  $$ update public.faq_items set answer_en = '   ' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.answer_en: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.faq_items set answer_en = repeat('x', 4001) where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.answer_en: over-length (4001 chars) is rejected'
);

select throws_ok(
  $$ update public.faq_items set answer_id = '' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.answer_id: blank is rejected'
);

select throws_ok(
  $$ update public.faq_items set answer_id = '   ' where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.answer_id: whitespace-only is rejected'
);

select throws_ok(
  $$ update public.faq_items set answer_id = repeat('x', 4001) where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '23514', null,
  'faq_items.answer_id: over-length (4001 chars) is rejected'
);

-- boundary: exactly at the cap is accepted
select lives_ok(
  $$ update public.community_about
        set title_en = repeat('x', 120), body_en = repeat('x', 8000) $$,
  'community_about accepts values exactly at the caps'
);

select lives_ok(
  $$ update public.faq_items
        set question_en = repeat('x', 200), answer_en = repeat('x', 4000)
      where id = 'f0000001-7777-7777-7777-777777777777' $$,
  'faq_items accepts values exactly at the caps'
);

-- ======== admin writes ========

select lives_ok(
  $$ update public.community_about
        set title_en = 'New title', body_en = 'New body',
            updated_by = '11111111-7777-7777-7777-777777777777' $$,
  'an admin can update community_about'
);

select lives_ok(
  $$ update public.faq_items set question_en = 'Admin edit'
      where id = 'f0000001-7777-7777-7777-777777777777' $$,
  'an admin can update a faq_items row'
);

select throws_ok(
  $$ insert into public.community_about (id, title_en, title_id, body_en, body_id)
     values (true, 't', 't', 'b', 'b') $$,
  '42501', null,
  'an admin cannot insert into community_about'
);

select throws_ok(
  $$ insert into public.faq_items (question_en, question_id, answer_en, answer_id, sort_order)
     values ('q', 'q', 'a', 'a', 99) $$,
  '42501', null,
  'an admin cannot insert into faq_items'
);

select throws_ok(
  $$ delete from public.community_about $$,
  '42501', null,
  'an admin cannot delete from community_about'
);

select throws_ok(
  $$ delete from public.faq_items $$,
  '42501', null,
  'an admin cannot delete from faq_items'
);

select throws_ok(
  $$ update public.faq_items set sort_order = 50
      where id = 'f0000001-7777-7777-7777-777777777777' $$,
  '42501', null,
  'an admin cannot update faq_items.sort_order directly'
);

reset role;

select results_eq(
  $$ select title_en, body_en, updated_by from public.community_about $$,
  $$ values ('New title', 'New body', '11111111-7777-7777-7777-777777777777'::uuid) $$,
  'the admin update of community_about took effect'
);

select is(
  (select question_en from public.faq_items
    where id = 'f0000001-7777-7777-7777-777777777777'),
  'Admin edit',
  'the admin update of the faq row took effect'
);

-- ======== non-admin writes: zero rows or permission denied ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-7777-7777-7777-777777777777","role":"authenticated"}';

select lives_ok(
  $$ update public.community_about set title_en = 'member hack' $$,
  'a member update of community_about runs (0 rows)'
);

select lives_ok(
  $$ update public.faq_items set question_en = 'member hack' $$,
  'a member update of faq_items runs (0 rows)'
);

set local request.jwt.claims = '{"sub":"22222222-7777-7777-7777-777777777777","role":"authenticated"}';

select lives_ok(
  $$ update public.community_about set title_en = 'host hack' $$,
  'a host update of community_about runs (0 rows)'
);

select lives_ok(
  $$ update public.faq_items set question_en = 'host hack' $$,
  'a host update of faq_items runs (0 rows)'
);

set local role anon;
set local request.jwt.claims = '';

select throws_ok(
  $$ update public.community_about set title_en = 'anon hack' $$,
  '42501', null,
  'anon update of community_about is permission denied'
);

select throws_ok(
  $$ update public.faq_items set question_en = 'anon hack' $$,
  '42501', null,
  'anon update of faq_items is permission denied'
);

reset role;

select results_eq(
  $$ select title_en from public.community_about $$,
  $$ values ('New title') $$,
  'member, host and anon changed nothing in community_about'
);

select is(
  (select count(*)::int from public.faq_items where question_en like '%hack%'),
  0,
  'member, host and anon changed nothing in faq_items'
);

-- ======== sort_order ========

select throws_ok(
  $$ insert into public.faq_items (question_en, question_id, answer_en, answer_id, sort_order)
     values ('q', 'q', 'a', 'a', 1) $$,
  '23505', null,
  'a duplicate sort_order is rejected'
);

select lives_ok(
  $$ update public.faq_items
        set sort_order = case id
              when 'f0000001-7777-7777-7777-777777777777' then 2
              else 1 end $$,
  'swapping two sort_order values in one statement succeeds (deferrable)'
);

select results_eq(
  $$ select id::text from public.faq_items order by sort_order $$,
  $$ values ('f0000002-7777-7777-7777-777777777777'), ('f0000001-7777-7777-7777-777777777777') $$,
  'the swap changed the order'
);

select * from finish();
rollback;
