-- Regression test for the JB006 isolation guard added to
-- register_for_session, host_add_participant, and promote_from_waitlist.
--
-- This lives in its own file, deliberately, because `set transaction
-- isolation level` must be the very first statement in a transaction (it
-- errors if any query has already run). 010_registration.test.sql already
-- runs `select plan(...)` and fixture inserts before any RPC assertion, so
-- there is no point in that file's single wrapping transaction where the
-- whole file could still be switched to repeatable read. Every pgTAP test
-- file in this project already runs as its own independent
-- begin/…/rollback (all ten reuse the same fixture UUIDs without
-- conflicting), so a second file for just this transaction shape costs
-- nothing and stays honest about what is actually being exercised: this
-- entire file runs under REPEATABLE READ, on purpose, from its first
-- statement.
begin;
set transaction isolation level repeatable read;

select plan(3);

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('11111111-1111-1111-1111-111111111111', 'member@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB006',
  null,
  'register_for_session refuses to run under repeatable read'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select public.host_add_participant('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'confirmed') $$,
  'JB006',
  null,
  'host_add_participant refuses to run under repeatable read'
);

-- Seed a confirmed participant directly (register_for_session/
-- host_add_participant can't be used for setup here -- they'd both raise
-- JB006 immediately, which is the whole point) so a direct cancellation can
-- fire the promotion trigger.
set local role postgres;
set local request.jwt.claims = '';
insert into public.participants (session_id, user_id, status, registered_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'confirmed', clock_timestamp());

-- Run as postgres, not authenticated: since
-- 20260917000004_participants_update_column_grant.sql, participants_update_host
-- is column-restricted to checked_in_at, so a host can no longer issue a
-- status-changing UPDATE at all -- this fixture only needs *a* direct
-- status UPDATE to prove promote_from_waitlist's own isolation guard fires,
-- not that a host specifically can trigger it that way.
set local role postgres;
set local request.jwt.claims = '';

select throws_ok(
  $$ update public.participants set status = 'cancelled', cancelled_at = now()
      where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
        and user_id = '11111111-1111-1111-1111-111111111111'
        and status = 'confirmed' $$,
  'JB006',
  null,
  'promote_from_waitlist (trigger) refuses to run under repeatable read'
);

select * from finish();
rollback;
