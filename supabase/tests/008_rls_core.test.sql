begin;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Draft Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'draft');

insert into public.participants (session_id, user_id, status, cancelled_at)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed', null),
       ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'cancelled', now());

select ok(
  (select relrowsecurity from pg_class where oid = 'public.participants'::regclass),
  'RLS is enabled on participants'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.sessions),
  1,
  'a member sees the scheduled session but not the draft'
);

select throws_ok(
  $$ insert into public.participants (session_id, user_id, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'confirmed') $$,
  '42501',
  null,
  'a member cannot insert into participants directly'
);

-- the host's cancelled row exists (inserted above as postgres) but must be
-- invisible to this member; a vacuous 0 here would prove nothing
select is(
  (select count(*)::int from public.participants where status = 'cancelled'),
  0,
  'a member cannot see another user''s cancelled row'
);

select throws_ok(
  $$ insert into public.sessions
       (title, starts_at, ends_at, location, max_participants, created_by)
     values ('Member Session', now() + interval '3 days',
             now() + interval '3 days 2 hours', 'GOR Jakbar', 8,
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot create a session'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.sessions),
  2,
  'the host sees their own draft session'
);

select * from finish();
rollback;
