begin;
select plan(5);

select has_table('public', 'announcements', 'announcements table exists');
select has_table('public', 'galleries', 'galleries table exists');
select has_table('public', 'gallery_photos', 'gallery_photos table exists');
select col_is_null('public', 'announcements', 'session_id',
                   'session_id is nullable so an announcement can be community-wide');

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

insert into public.announcements (id, title, body, created_by)
values ('dddddddd-0000-0000-0000-000000000001',
        'Community news', 'Sunday session moved', '33333333-3333-3333-3333-333333333333');

-- Scoped to this file's own fixture id rather than a raw count(*) filtered
-- only by nullability: supabase/seed.sql (Task 13) inserts real
-- community-wide announcements for local dev, and that seed data is not
-- rolled back before this file's own begin/rollback runs, so an unscoped
-- count would be polluted by it (as fixed for sessions/courts/galleries
-- elsewhere in this suite).
select is(
  (select count(*)::int from public.announcements
    where id = 'dddddddd-0000-0000-0000-000000000001' and session_id is null),
  1,
  'a community-wide announcement can be written'
);

select * from finish();
rollback;
