begin;
select plan(5);

select has_table('public', 'announcements', 'announcements table exists');
select has_table('public', 'galleries', 'galleries table exists');
select has_table('public', 'gallery_photos', 'gallery_photos table exists');
select col_is_null('public', 'announcements', 'session_id',
                   'session_id is nullable so an announcement can be community-wide');

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

insert into public.announcements (title, body, created_by)
values ('Community news', 'Sunday session moved', '33333333-3333-3333-3333-333333333333');

select is(
  (select count(*)::int from public.announcements where session_id is null),
  1,
  'a community-wide announcement can be written'
);

select * from finish();
rollback;
