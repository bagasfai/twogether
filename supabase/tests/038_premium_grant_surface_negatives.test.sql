-- Negative grant-surface pins for the premium membership feature
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md, section 5),
-- following 022_grant_surface_negatives.test.sql. The explicit
-- `revoke ... from public, anon` on each function and the absence of write
-- grants on the RPC-only tables are the authorization boundary; RLS only
-- filters rows. A migration that re-grants any of these would pass every
-- positive pin unchanged, so the absence is pinned here.
--
-- Catalog-privilege checks need no fixtures. The last block is the one
-- behavioural check: a member writing the premium columns on their own
-- participants row is refused by the column-level grant.

begin;
select plan(39);

-- ---------------------------------------------------------------------
-- admin RPCs: no EXECUTE for anon or PUBLIC
-- ---------------------------------------------------------------------

select ok(
  not has_function_privilege('anon',
    'public.admin_grant_membership(uuid, uuid, timestamptz, integer, integer, integer)', 'EXECUTE'),
  'anon lacks EXECUTE on admin_grant_membership'
);
select ok(
  not has_function_privilege('public',
    'public.admin_grant_membership(uuid, uuid, timestamptz, integer, integer, integer)', 'EXECUTE'),
  'PUBLIC lacks EXECUTE on admin_grant_membership'
);
select ok(
  not has_function_privilege('anon', 'public.admin_cancel_membership(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on admin_cancel_membership'
);
select ok(
  not has_function_privilege('public', 'public.admin_cancel_membership(uuid)', 'EXECUTE'),
  'PUBLIC lacks EXECUTE on admin_cancel_membership'
);

-- ---------------------------------------------------------------------
-- internal helpers and trigger functions: no EXECUTE for anon, PUBLIC or
-- authenticated (they are called only from security definer code)
-- ---------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.lock_current_membership(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on lock_current_membership'
);
select ok(
  not has_function_privilege('public', 'public.lock_current_membership(uuid)', 'EXECUTE'),
  'PUBLIC lacks EXECUTE on lock_current_membership'
);
select ok(
  not has_function_privilege('authenticated', 'public.lock_current_membership(uuid)', 'EXECUTE'),
  'authenticated lacks EXECUTE on lock_current_membership'
);
select ok(
  not has_function_privilege('anon', 'public.membership_quota_left(uuid)', 'EXECUTE'),
  'anon lacks EXECUTE on membership_quota_left'
);
select ok(
  not has_function_privilege('public', 'public.membership_quota_left(uuid)', 'EXECUTE'),
  'PUBLIC lacks EXECUTE on membership_quota_left'
);
select ok(
  not has_function_privilege('authenticated', 'public.membership_quota_left(uuid)', 'EXECUTE'),
  'authenticated lacks EXECUTE on membership_quota_left'
);
select ok(
  not has_function_privilege('anon', 'public.refund_usage_on_cancel()', 'EXECUTE'),
  'anon lacks EXECUTE on refund_usage_on_cancel'
);
select ok(
  not has_function_privilege('public', 'public.refund_usage_on_cancel()', 'EXECUTE'),
  'PUBLIC lacks EXECUTE on refund_usage_on_cancel'
);
select ok(
  not has_function_privilege('authenticated', 'public.refund_usage_on_cancel()', 'EXECUTE'),
  'authenticated lacks EXECUTE on refund_usage_on_cancel'
);
select ok(
  not has_function_privilege('anon', 'public.refund_usages_on_session_change()', 'EXECUTE'),
  'anon lacks EXECUTE on refund_usages_on_session_change'
);
select ok(
  not has_function_privilege('public', 'public.refund_usages_on_session_change()', 'EXECUTE'),
  'PUBLIC lacks EXECUTE on refund_usages_on_session_change'
);
select ok(
  not has_function_privilege('authenticated', 'public.refund_usages_on_session_change()', 'EXECUTE'),
  'authenticated lacks EXECUTE on refund_usages_on_session_change'
);

-- ---------------------------------------------------------------------
-- RPC-only tables: no INSERT / UPDATE / DELETE for anon or authenticated
-- ---------------------------------------------------------------------

select ok(not has_table_privilege('anon', 'public.memberships', 'insert'),
  'anon lacks INSERT on memberships');
select ok(not has_table_privilege('anon', 'public.memberships', 'update'),
  'anon lacks UPDATE on memberships');
select ok(not has_table_privilege('anon', 'public.memberships', 'delete'),
  'anon lacks DELETE on memberships');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'insert'),
  'authenticated lacks INSERT on memberships');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'update'),
  'authenticated lacks UPDATE on memberships');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'delete'),
  'authenticated lacks DELETE on memberships');

select ok(not has_table_privilege('anon', 'public.membership_usages', 'insert'),
  'anon lacks INSERT on membership_usages');
select ok(not has_table_privilege('anon', 'public.membership_usages', 'update'),
  'anon lacks UPDATE on membership_usages');
select ok(not has_table_privilege('anon', 'public.membership_usages', 'delete'),
  'anon lacks DELETE on membership_usages');
select ok(not has_table_privilege('authenticated', 'public.membership_usages', 'insert'),
  'authenticated lacks INSERT on membership_usages');
select ok(not has_table_privilege('authenticated', 'public.membership_usages', 'update'),
  'authenticated lacks UPDATE on membership_usages');
select ok(not has_table_privilege('authenticated', 'public.membership_usages', 'delete'),
  'authenticated lacks DELETE on membership_usages');

select ok(not has_table_privilege('anon', 'public.bump_notifications', 'insert'),
  'anon lacks INSERT on bump_notifications');
select ok(not has_table_privilege('anon', 'public.bump_notifications', 'update'),
  'anon lacks UPDATE on bump_notifications');
select ok(not has_table_privilege('anon', 'public.bump_notifications', 'delete'),
  'anon lacks DELETE on bump_notifications');
select ok(not has_table_privilege('authenticated', 'public.bump_notifications', 'insert'),
  'authenticated lacks INSERT on bump_notifications');
select ok(not has_table_privilege('authenticated', 'public.bump_notifications', 'update'),
  'authenticated lacks UPDATE on bump_notifications');
select ok(not has_table_privilege('authenticated', 'public.bump_notifications', 'delete'),
  'authenticated lacks DELETE on bump_notifications');

-- ---------------------------------------------------------------------
-- participants premium columns: not client-writable
-- ---------------------------------------------------------------------

select ok(
  not has_column_privilege('authenticated', 'public.participants', 'is_premium', 'UPDATE'),
  'authenticated lacks UPDATE on participants.is_premium'
);
select ok(
  not has_column_privilege('authenticated', 'public.participants', 'membership_id', 'UPDATE'),
  'authenticated lacks UPDATE on participants.membership_id'
);

-- Regression (Task 1 review): a member cannot self-grant premium on their
-- own registration row, whatever RLS would allow.
insert into auth.users (id, email) values
  ('00000001-0036-0036-0036-000000000000', 'host-036@test.local'),
  ('00000002-0036-0036-0036-000000000000', 'member-036@test.local');
update public.profiles set role = 'host'
 where id = '00000001-0036-0036-0036-000000000000';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a3600001-0000-0000-0000-000000000000', 'Session 036',
   now() + interval '3 days', now() + interval '3 days 2 hours', 'GOR',
   8, '00000001-0036-0036-0036-000000000000', 'scheduled');

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at)
values
  ('e3600002-0000-0000-0000-000000000000', '00000002-0036-0036-0036-000000000000',
   0, 5, 30, now(), now() + interval '30 days');

insert into public.participants (id, session_id, user_id, status)
values ('b3600002-0000-0000-0000-000000000000', 'a3600001-0000-0000-0000-000000000000',
        '00000002-0036-0036-0036-000000000000', 'confirmed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0036-0036-0036-000000000000","role":"authenticated"}';

select throws_ok(
  $$ update public.participants set is_premium = true
      where id = 'b3600002-0000-0000-0000-000000000000' $$,
  '42501', null,
  'a member cannot set is_premium on their own participants row'
);
select throws_ok(
  $$ update public.participants set membership_id = 'e3600002-0000-0000-0000-000000000000'
      where id = 'b3600002-0000-0000-0000-000000000000' $$,
  '42501', null,
  'a member cannot set membership_id on their own participants row'
);

reset role;

select results_eq(
  $$ select is_premium, membership_id from public.participants
      where id = 'b3600002-0000-0000-0000-000000000000' $$,
  $$ values (false, null::uuid) $$,
  'the participants row is still non-premium'
);

select * from finish();
rollback;
