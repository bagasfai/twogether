-- Negative half of the grant surface for the drilling migrations
-- (20261028000001..5), in the style of 022_grant_surface_negatives.test.sql.
-- A re-grant of EXECUTE to PUBLIC/anon, or of UPDATE on the new participants
-- columns to authenticated, would pass every functional test unchanged; only
-- a pin on the absence of the privilege catches it.
--
-- Catalog checks need no fixtures. The last assertion exercises the one
-- table-level path that remains: authenticated holds UPDATE on sessions
-- (RLS-gated), so sessions.kind is protected by the guard trigger, not a grant.

begin;
select plan(16);

-- transfer_participation / adjust_session_capacity: authenticated only.
select ok(
  not has_function_privilege('anon', 'public.transfer_participation(uuid, uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on transfer_participation');
select ok(
  not has_function_privilege('public', 'public.transfer_participation(uuid, uuid)', 'EXECUTE'),
  'public lacks EXECUTE on transfer_participation');
select ok(
  has_function_privilege('authenticated', 'public.transfer_participation(uuid, uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on transfer_participation');

select ok(
  not has_function_privilege('anon', 'public.adjust_session_capacity(uuid, int)', 'EXECUTE'),
  'anon lacks EXECUTE on adjust_session_capacity');
select ok(
  not has_function_privilege('public', 'public.adjust_session_capacity(uuid, int)', 'EXECUTE'),
  'public lacks EXECUTE on adjust_session_capacity');
select ok(
  has_function_privilege('authenticated', 'public.adjust_session_capacity(uuid, int)', 'EXECUTE'),
  'authenticated has EXECUTE on adjust_session_capacity');

-- Trigger function: not callable as an RPC by anyone.
select ok(
  not has_function_privilege('anon', 'public.guard_session_kind_change()', 'EXECUTE'),
  'anon lacks EXECUTE on guard_session_kind_change');
select ok(
  not has_function_privilege('public', 'public.guard_session_kind_change()', 'EXECUTE'),
  'public lacks EXECUTE on guard_session_kind_change');
select ok(
  not has_function_privilege('authenticated', 'public.guard_session_kind_change()', 'EXECUTE'),
  'authenticated lacks EXECUTE on guard_session_kind_change');

-- New participants columns are written only by SECURITY DEFINER RPCs.
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'replaced_by', 'UPDATE'),
  'authenticated lacks UPDATE on participants.replaced_by');
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'paid_by_user_id', 'UPDATE'),
  'authenticated lacks UPDATE on participants.paid_by_user_id');
select ok(
  not has_column_privilege('anon', 'public.participants', 'replaced_by', 'UPDATE'),
  'anon lacks UPDATE on participants.replaced_by');
select ok(
  not has_column_privilege('anon', 'public.participants', 'paid_by_user_id', 'UPDATE'),
  'anon lacks UPDATE on participants.paid_by_user_id');
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'replaced_by', 'INSERT')
  and not has_column_privilege('authenticated', 'public.participants', 'paid_by_user_id', 'INSERT'),
  'authenticated lacks INSERT on replaced_by and paid_by_user_id');

-- sessions.kind: a host holds table-level UPDATE on sessions, so the only
-- barrier once participants exist is guard_session_kind_change (JB020).
insert into auth.users (id, email) values
  ('00000001-0045-0045-0045-000000000000', 'host-045@test.local'),
  ('00000002-0045-0045-0045-000000000000', 'm-045@test.local');
update public.profiles set role = 'host' where id = '00000001-0045-0045-0045-000000000000';
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, court_count, kind,
   coach_count, seats_per_coach, created_by, status, registration_state)
values ('a4500001-0000-0000-0000-000000000000', 'S', now() + interval '3 days',
  now() + interval '3 days 2 hours', 'GOR', 4, 1, 'drilling', 1, 4,
  '00000001-0045-0045-0045-000000000000', 'scheduled', 'open');
insert into public.participants (session_id, user_id, status) values
  ('a4500001-0000-0000-0000-000000000000', '00000002-0045-0045-0045-000000000000', 'confirmed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0045-0045-0045-000000000000","role":"authenticated"}';
select throws_ok(
  $$update public.sessions set kind = 'open_play', coach_count = null, seats_per_coach = null
     where id = 'a4500001-0000-0000-0000-000000000000'$$,
  'JB020', null, 'host cannot change sessions.kind once participants exist');
reset role;

select ok(
  (select kind = 'drilling' from public.sessions where id = 'a4500001-0000-0000-0000-000000000000'),
  'kind unchanged after the blocked update');

select * from finish();
rollback;
