-- Covers migration 20260914000001_participant_consent.sql: consented_at
-- distinguishes "a participant row exists" from "the member knows about it".
-- The profiles_private phone-visibility side of this is covered in
-- 013_profiles_private.test.sql; this file covers the RPCs that set the flag.

begin;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'other-member@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 8, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

set local role authenticated;

-- self-registration is consent by construction
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001');
select isnt(
  (select consented_at from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       and user_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'register_for_session stamps consented_at immediately'
);

-- host_add_participant leaves consent unset -- the whole point of this
-- migration
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select consented_at from public.host_add_participant(
     'aaaaaaaa-0000-0000-0000-000000000001',
     '33333333-3333-3333-3333-333333333333',
     'confirmed')),
  null,
  'host_add_participant leaves consented_at null'
);

-- the member host_add_participant actually added can confirm their own row
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select isnt(
  (select consented_at from public.member_confirm_participation('aaaaaaaa-0000-0000-0000-000000000001')),
  null,
  'the added member can confirm their own participation'
);

-- confirming again is a no-op success, not an error (idempotent -- guards a
-- double click)
select lives_ok(
  $$ select public.member_confirm_participation('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'confirming an already-consented row does not raise'
);

-- a member with no participant row at all gets JB008
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select public.member_confirm_participation('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB008',
  null,
  'confirming with no participant row raises JB008'
);

-- re-adding after a cancellation resets consent to null even though the
-- member previously self-consented -- a host action is never consent
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_registration('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'the added member cancels after confirming'
);
select isnt(
  (select consented_at from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       and user_id = '33333333-3333-3333-3333-333333333333'),
  null,
  'fixture: consented_at survives a cancellation untouched'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select consented_at from public.host_add_participant(
     'aaaaaaaa-0000-0000-0000-000000000001',
     '33333333-3333-3333-3333-333333333333',
     'confirmed')),
  null,
  're-adding a previously self-consented member after cancellation resets consented_at to null'
);

-- registering again after being host-added (a member can always self-register
-- over a cancelled row) restores consent, same as a first-time registration
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_registration('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'the re-added member cancels the host-added row'
);
select isnt(
  (select status::text from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001')),
  null,
  'the member re-registers themselves over the cancelled row'
);
select isnt(
  (select consented_at from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       and user_id = '33333333-3333-3333-3333-333333333333'),
  null,
  'self-registering over a cancelled, unconsented row sets consented_at again'
);

select * from finish();
rollback;
