begin;
select plan(5);

select has_table('public', 'participants', 'participants table exists');
select col_is_unique('public', 'participants', array['session_id','user_id'],
                     'one participant row per session per user');
select has_index('public', 'participants', 'participants_waitlist_order_idx',
                 'waitlist ordering index exists');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222');

insert into public.participants (session_id, user_id, status)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed');

select is(
  (select checked_in_at from public.participants
    where user_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'a new participant is not checked in'
);

select throws_ok(
  $$ insert into public.participants (session_id, user_id, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'waiting_list') $$,
  '23505',
  null,
  'a user cannot hold two rows for one session'
);

select * from finish();
rollback;
