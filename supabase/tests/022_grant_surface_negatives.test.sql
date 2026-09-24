-- core-schema-follow-ups.md, "Should fix soon": "Grant-surface test pins cover
-- the positive half only; a regression re-granting EXECUTE to PUBLIC would
-- slip past. (The final review found exactly this class of bug in
-- is_admin.)"
--
-- This file is the negative half. Every SECURITY DEFINER RPC and every
-- restricted table/column in this schema relies on an explicit
-- `revoke ... from public, anon` (or a column-level grant instead of a
-- table-level one) as the actual authorization boundary -- not RLS, which
-- only filters rows and does nothing to stop a grant that shouldn't exist.
-- A migration that re-grants EXECUTE/UPDATE/etc. to PUBLIC or anon, or that
-- forgets the anon-specific revoke Supabase's default per-function grant
-- requires (see 20260911000012_invariant_fixes.sql's comment), would pass
-- every existing positive-grant pin and every RLS test unchanged. Only a
-- pin on the *absence* of the privilege catches that regression.
--
-- Some of this ground is already covered by positive/negative pairs in
-- other files (007_rls_helpers, 010_registration, 013_profiles_private) --
-- this file does not re-assert those. It closes what was still open:
-- the match-scheduling and guest-participant RPCs (revoked from public+anon
-- in their own migrations but never pinned), the full participants
-- column-grant surface (only `status` was ever exercised, via throws_ok in
-- 012, not the rest of the disallowed columns), and the two profiles_private
-- privilege types 013 didn't pin (anon UPDATE, anon DELETE).
--
-- These are all catalog-privilege checks (has_function_privilege /
-- has_column_privilege / has_table_privilege), so no fixtures or role
-- switching are needed -- the privilege exists or it doesn't, independent
-- of any row.

begin;
select plan(28);

-- ---------------------------------------------------------------------
-- SECURITY DEFINER RPCs: match scheduling (20260913000001_match_scheduling.sql)
-- revokes these `from public, anon` in the same statement (no separate
-- anon-specific revoke needed, unlike registration.sql's two-step fix) --
-- pin that anon actually ends up with nothing.
-- ---------------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon', 'public.create_match(uuid, uuid, uuid[], uuid[])', 'EXECUTE'),
  'anon lacks EXECUTE on create_match'
);
select ok(
  not has_function_privilege('anon', 'public.start_match(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on start_match'
);
select ok(
  not has_function_privilege('anon', 'public.complete_match(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on complete_match'
);

-- ---------------------------------------------------------------------
-- SECURITY DEFINER RPCs: guest participants (20260917000001_guest_participants.sql)
-- ---------------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon', 'public.register_guest_for_session(uuid, text, text)', 'EXECUTE'),
  'anon lacks EXECUTE on register_guest_for_session'
);
select ok(
  not has_function_privilege(
    'anon', 'public.cancel_guest_registration(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on cancel_guest_registration'
);

-- ---------------------------------------------------------------------
-- profiles_private (20260912000014_profiles_private.sql): 013 already pins
-- authenticated-lacks-insert/delete and anon-lacks-select/insert. Close the
-- remaining two privilege types on the anon side of the same
-- `revoke all ... from anon, authenticated; grant select, update to
-- authenticated` statement.
-- ---------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.profiles_private', 'update'),
  'anon has no UPDATE grant on profiles_private'
);
select ok(
  not has_table_privilege('anon', 'public.profiles_private', 'delete'),
  'anon has no DELETE grant on profiles_private'
);

-- ---------------------------------------------------------------------
-- participants column-grant surface
-- (20260917000004_participants_update_column_grant.sql,
-- 20260917000006_participant_paid_at.sql,
-- 20260924000001_participant_no_show_at.sql): the only UPDATE this schema
-- ever intends `authenticated` to hold on this table is on three specific
-- columns. 012's F1a exercises `status` with a real UPDATE + throws_ok;
-- this pins the whole column list, including columns added by later
-- migrations that never got a matching negative test.
-- ---------------------------------------------------------------------

-- the three columns that are meant to be directly updatable
select ok(
  has_column_privilege('authenticated', 'public.participants', 'checked_in_at', 'UPDATE'),
  'authenticated has UPDATE on participants.checked_in_at'
);
select ok(
  has_column_privilege('authenticated', 'public.participants', 'paid_at', 'UPDATE'),
  'authenticated has UPDATE on participants.paid_at'
);
select ok(
  has_column_privilege('authenticated', 'public.participants', 'no_show_at', 'UPDATE'),
  'authenticated has UPDATE on participants.no_show_at'
);

-- everything else: status transitions, waitlist ordering, the
-- over-capacity audit trail, consent, and guest attribution all go through
-- SECURITY DEFINER RPCs -- a plain authenticated UPDATE must not reach any
-- of them.
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'id', 'UPDATE'),
  'authenticated lacks UPDATE on participants.id'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'session_id', 'UPDATE'),
  'authenticated lacks UPDATE on participants.session_id'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'user_id', 'UPDATE'),
  'authenticated lacks UPDATE on participants.user_id'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'status', 'UPDATE'),
  'authenticated lacks UPDATE on participants.status'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'registered_at', 'UPDATE'),
  'authenticated lacks UPDATE on participants.registered_at'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'cancelled_at', 'UPDATE'),
  'authenticated lacks UPDATE on participants.cancelled_at'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'added_by', 'UPDATE'),
  'authenticated lacks UPDATE on participants.added_by'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'created_at', 'UPDATE'),
  'authenticated lacks UPDATE on participants.created_at'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'updated_at', 'UPDATE'),
  'authenticated lacks UPDATE on participants.updated_at'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'consented_at', 'UPDATE'),
  'authenticated lacks UPDATE on participants.consented_at'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'guest_name', 'UPDATE'),
  'authenticated lacks UPDATE on participants.guest_name'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'guest_phone', 'UPDATE'),
  'authenticated lacks UPDATE on participants.guest_phone'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'registered_by', 'UPDATE'),
  'authenticated lacks UPDATE on participants.registered_by'
);

-- authenticated also has no table-level INSERT on participants at all --
-- every insert path (self-registration, guest registration, host add) goes
-- through a SECURITY DEFINER RPC owned by the table owner, not a grant on
-- the calling role.
select ok(
  not has_table_privilege('authenticated', 'public.participants', 'insert'),
  'authenticated lacks INSERT on participants (RPC-only)'
);

-- anon holds no grant on participants whatsoever -- unlike sessions
-- (anon-readable) or announcements/galleries (anon-readable), participant
-- rosters were never granted to anon at the table level in
-- 20260911000008_rls_core.sql.
select ok(
  not has_table_privilege('anon', 'public.participants', 'select'),
  'anon lacks SELECT on participants'
);
select ok(
  not has_table_privilege('anon', 'public.participants', 'insert'),
  'anon lacks INSERT on participants'
);
select ok(
  not has_table_privilege('anon', 'public.participants', 'update'),
  'anon lacks UPDATE on participants'
);
select ok(
  not has_table_privilege('anon', 'public.participants', 'delete'),
  'anon lacks DELETE on participants'
);

select * from finish();
rollback;
