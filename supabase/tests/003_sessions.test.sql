begin;
select plan(6);

select has_table('public', 'sessions', 'sessions table exists');
select has_table('public', 'session_hosts', 'session_hosts table exists');
select col_default_is('public', 'sessions', 'waitlist_capacity', 0, 'waitlist_capacity defaults to 0');
select col_not_null('public', 'sessions', 'waitlist_capacity', 'waitlist_capacity is not null');

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222');

select is(
  (select role::text from public.session_hosts
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  'owner',
  'creator is recorded as the session owner'
);

select throws_ok(
  $$ insert into public.sessions
       (title, starts_at, ends_at, location, max_participants, created_by)
     values ('Backwards', now() + interval '2 days', now() + interval '1 day',
             'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222') $$,
  '23514',
  null,
  'ends_at must be after starts_at'
);

select * from finish();
rollback;
