begin;
select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'cohost@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Draft Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'draft');

insert into public.session_hosts (session_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444', 'cohost');

set local role authenticated;

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'the owner is a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'the owner is the session owner');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'a cohost is a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), false,
          'a cohost is not the session owner');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(public.session_is_public('aaaaaaaa-0000-0000-0000-000000000002'), false,
          'a draft session is not public');

select * from finish();
rollback;
