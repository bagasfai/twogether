-- Covers migration 20260917000001_guest_participants.sql:
-- register_guest_for_session / cancel_guest_registration, the
-- participants_member_xor_guest constraint, and the registered_by branch of
-- participants_select_self_host_or_public.

begin;
select plan(19);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'other-member@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

-- one seat, one waitlist slot
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Closed Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 8, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'closed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select status::text from public.register_guest_for_session(
     'aaaaaaaa-0000-0000-0000-000000000001', 'Guest One', '0812')),
  'confirmed',
  'the first guest takes the only seat'
);

select isnt(
  (select consented_at from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       and guest_name = 'Guest One'),
  null,
  'a guest registration stamps consented_at immediately, same as self-registration'
);

select is(
  (select status::text from public.register_guest_for_session(
     'aaaaaaaa-0000-0000-0000-000000000001', 'Guest Two', null)),
  'waiting_list',
  'a second guest brought by the same member is waitlisted (no unique-key conflict on null user_id)'
);

select throws_ok(
  $$ select public.register_guest_for_session('aaaaaaaa-0000-0000-0000-000000000002', 'Guest Three') $$,
  'JB001',
  null,
  'registering a guest on a closed session raises JB001'
);

select throws_ok(
  $$ select public.register_guest_for_session('aaaaaaaa-0000-0000-0000-000000000001', '   ') $$,
  'JB011',
  null,
  'a blank guest name raises JB011'
);

-- an authenticated caller with no sub claim is rejected by the same internal
-- guard as register_for_session/cancel_registration (010_registration.test.sql)
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok(
  $$ select public.register_guest_for_session('aaaaaaaa-0000-0000-0000-000000000001', 'Nobody') $$,
  'JB004',
  null,
  'register_guest_for_session rejects a null auth.uid() caller'
);
select throws_ok(
  $$ select public.cancel_guest_registration('00000000-0000-0000-0000-000000000000') $$,
  'JB004',
  null,
  'cancel_guest_registration rejects a null auth.uid() caller'
);

-- past both caps: a third guest from a different member
set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'member2@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ select public.register_guest_for_session('aaaaaaaa-0000-0000-0000-000000000001', 'Guest Four') $$,
  'JB002',
  null,
  'registering a guest past both caps raises JB002'
);

-- This session is scheduled + was open, so session_is_public makes every
-- non-cancelled row visible to any authenticated member regardless of who
-- brought it -- that's the existing public-roster behavior, not something
-- this migration changes. It doesn't exercise the new registered_by branch
-- distinctly; that's proven below on a non-public draft session instead.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(
  (select count(*)::int from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       and guest_name = 'Guest One'),
  1,
  'any member can see a guest row on a public scheduled session, same as any other participant'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       and guest_name = 'Guest One'),
  1,
  'the session host can see a guest row via is_session_host, same as any participant'
);

-- A draft session is not public (session_is_public excludes 'draft') and not
-- reachable through the registration RPCs (registration_state/status guard),
-- so this fixture is inserted directly as table owner -- the same pattern
-- 013_profiles_private.test.sql uses for its host_add_participant fixture.
-- This is what actually isolates the registered_by branch of the policy.
set local role postgres;
set local request.jwt.claims = '';
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Draft Session',
   now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 8, 2, '22222222-2222-2222-2222-222222222222',
   'draft', 'closed');
insert into public.participants (session_id, guest_name, registered_by, status, consented_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Draft Guest',
   '11111111-1111-1111-1111-111111111111', 'confirmed', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select count(*)::int from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000003'
       and guest_name = 'Draft Guest'),
  1,
  'on a non-public draft session, the registering member still sees their guest row via registered_by'
);

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(
  (select count(*)::int from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000003'
       and guest_name = 'Draft Guest'),
  0,
  'an unrelated member cannot see a guest row on a non-public session they did not register'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000003'
       and guest_name = 'Draft Guest'),
  1,
  'the host of the draft session can see the guest row via is_session_host'
);

-- cancellation: the registering member cancels their own guest, freeing the
-- seat for the waitlisted second guest (on the original open session)
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_guest_registration(
       (select id from public.participants
          where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and guest_name = 'Guest One')) $$,
  'the registering member can cancel their own guest'
);

select is(
  (select status::text from public.participants
     where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
       and guest_name = 'Guest Two'),
  'confirmed',
  'cancelling a guest promotes the next waiter, same trigger as a member cancellation'
);

select throws_ok(
  $$ select public.cancel_guest_registration(
       (select id from public.participants
          where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and guest_name = 'Guest One')) $$,
  'JB003',
  null,
  'cancelling an already-cancelled guest raises JB003'
);

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select public.cancel_guest_registration(
       (select id from public.participants
          where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
            and guest_name = 'Guest Two')) $$,
  'JB003',
  null,
  'a member cannot cancel a guest they did not bring (registered_by mismatch)'
);

-- the xor constraint itself: this runs as the table owner (postgres), which
-- bypasses RLS but not check constraints -- direct inserts here prove the
-- constraint exists independent of any RPC ever calling it correctly.
set local role postgres;
set local request.jwt.claims = '';
select throws_ok(
  $$ insert into public.participants (session_id, user_id, guest_name, status)
       values ('aaaaaaaa-0000-0000-0000-000000000001',
               '11111111-1111-1111-1111-111111111111', 'Both set', 'confirmed') $$,
  '23514',
  null,
  'a row with both user_id and guest_name set violates participants_member_xor_guest'
);
select throws_ok(
  $$ insert into public.participants (session_id, status)
       values ('aaaaaaaa-0000-0000-0000-000000000001', 'confirmed') $$,
  '23514',
  null,
  'a row with neither user_id nor guest_name set violates participants_member_xor_guest'
);

select * from finish();
rollback;
