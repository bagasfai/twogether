-- Premium membership schema, RLS and grants
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md, sections 3 and 5).
-- All writes to memberships, membership_usages and bump_notifications are
-- RPC/trigger only; membership_plans is admin-writable through RLS.

begin;
select plan(35);

select has_table('public', 'membership_plans', 'membership_plans exists');
select has_table('public', 'memberships', 'memberships exists');
select has_table('public', 'membership_usages', 'membership_usages exists');
select has_table('public', 'bump_notifications', 'bump_notifications exists');

select has_column('public', 'participants', 'is_premium', 'participants.is_premium exists');
select has_column('public', 'participants', 'membership_id', 'participants.membership_id exists');
select has_column('public', 'participants', 'bumped_at', 'participants.bumped_at exists');

insert into auth.users (id, email) values
  ('11111111-4444-4444-4444-444444444444', 'member-a-031@test.local'),
  ('22222222-4444-4444-4444-444444444444', 'member-b-031@test.local'),
  ('33333333-4444-4444-4444-444444444444', 'admin-031@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'host-031@test.local');

update public.profiles set role = 'admin'
 where id = '33333333-4444-4444-4444-444444444444';

insert into public.membership_plans (id, name, price_idr, quota, duration_days, is_active) values
  ('a0000000-4444-4444-4444-444444444444', 'Active Plan', 100000, 8, 30, true),
  ('b0000000-4444-4444-4444-444444444444', 'Retired Plan', 90000, 4, 30, false);

insert into public.memberships
  (id, user_id, plan_id, price_idr, quota_total, duration_days, refund_cutoff_hours)
values
  ('c0000000-4444-4444-4444-444444444444', '11111111-4444-4444-4444-444444444444',
   'a0000000-4444-4444-4444-444444444444', 100000, 8, 30, 24),
  ('d0000000-4444-4444-4444-444444444444', '22222222-4444-4444-4444-444444444444',
   'a0000000-4444-4444-4444-444444444444', 100000, 8, 30, 24);

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('e0000000-4444-4444-4444-444444444444', 'Session 031',
   now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 16, '44444444-4444-4444-4444-444444444444', 'scheduled');

insert into public.participants (id, session_id, user_id, status)
values ('f0000000-4444-4444-4444-444444444444', 'e0000000-4444-4444-4444-444444444444',
        '11111111-4444-4444-4444-444444444444', 'confirmed');

insert into public.membership_usages (id, membership_id, participant_id)
values ('a1000000-4444-4444-4444-444444444444', 'c0000000-4444-4444-4444-444444444444',
        'f0000000-4444-4444-4444-444444444444');

insert into public.bump_notifications (id, participant_id)
values ('a2000000-4444-4444-4444-444444444444', 'f0000000-4444-4444-4444-444444444444');

-- ======== constraints (as superuser) ========

select throws_ok(
  $$ insert into public.memberships (user_id, price_idr, quota_total, duration_days, refund_cutoff_hours)
     values ('11111111-4444-4444-4444-444444444444', 1, 0, 30, 24) $$,
  '23514', null, 'quota_total must be > 0');

select throws_ok(
  $$ insert into public.memberships (user_id, price_idr, quota_total, duration_days, refund_cutoff_hours)
     values ('11111111-4444-4444-4444-444444444444', -1, 1, 30, 24) $$,
  '23514', null, 'price_idr must be >= 0');

select throws_ok(
  $$ insert into public.memberships (user_id, price_idr, quota_total, duration_days, refund_cutoff_hours)
     values ('11111111-4444-4444-4444-444444444444', 1, 1, 0, 24) $$,
  '23514', null, 'duration_days must be > 0');

select throws_ok(
  $$ insert into public.memberships (user_id, price_idr, quota_total, duration_days, refund_cutoff_hours)
     values ('11111111-4444-4444-4444-444444444444', 1, 1, 30, -1) $$,
  '23514', null, 'refund_cutoff_hours must be >= 0');

select throws_ok(
  $$ insert into public.membership_usages (membership_id, participant_id)
     values ('c0000000-4444-4444-4444-444444444444', 'f0000000-4444-4444-4444-444444444444') $$,
  '23505', null, 'one live usage per participant');

-- ======== member ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-4444-4444-4444-444444444444","role":"authenticated"}';

select throws_ok(
  $$ insert into public.memberships (user_id, price_idr, quota_total, duration_days)
     values ('11111111-4444-4444-4444-444444444444', 1, 1, 30) $$,
  '42501', null, 'member cannot insert memberships');
select throws_ok(
  $$ update public.memberships set quota_total = 99 $$,
  '42501', null, 'member cannot update memberships');
select throws_ok(
  $$ delete from public.memberships $$,
  '42501', null, 'member cannot delete memberships');
select throws_ok(
  $$ insert into public.membership_usages (membership_id, participant_id)
     values ('c0000000-4444-4444-4444-444444444444', 'f0000000-4444-4444-4444-444444444444') $$,
  '42501', null, 'member cannot insert membership_usages');
select throws_ok(
  $$ update public.membership_usages set refunded_at = now() $$,
  '42501', null, 'member cannot update membership_usages');
select throws_ok(
  $$ delete from public.membership_usages $$,
  '42501', null, 'member cannot delete membership_usages');
select throws_ok(
  $$ insert into public.bump_notifications (participant_id)
     values ('f0000000-4444-4444-4444-444444444444') $$,
  '42501', null, 'member cannot insert bump_notifications');
select throws_ok(
  $$ update public.bump_notifications set sent_at = now() $$,
  '42501', null, 'member cannot update bump_notifications');
select throws_ok(
  $$ delete from public.bump_notifications $$,
  '42501', null, 'member cannot delete bump_notifications');

select is(
  (select count(*)::int from public.memberships),
  1, 'member sees only their own membership');
select is(
  (select count(*)::int from public.membership_usages),
  1, 'member sees their own usage');
select throws_ok(
  $$ select count(*) from public.bump_notifications $$,
  '42501', null, 'member has no select on bump_notifications');

select is(
  (select array_agg(name order by name) from public.membership_plans),
  array['Active Plan'], 'member sees only active plans');

select throws_ok(
  $$ insert into public.membership_plans (name, price_idr, quota, duration_days)
     values ('Hack', 1, 1, 1) $$,
  '42501', null, 'non-admin cannot insert a plan');

-- ======== another member ========

set local request.jwt.claims = '{"sub":"22222222-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.membership_usages),
  0, 'another member does not see foreign usages');

-- ======== admin ========

set local request.jwt.claims = '{"sub":"33333333-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.membership_plans),
  2, 'admin sees all plans');

select lives_ok(
  $$ insert into public.membership_plans (name, price_idr, quota, duration_days)
     values ('Admin Plan', 50000, 4, 30) $$,
  'admin can insert a plan');

select lives_ok(
  $$ update public.membership_plans set price_idr = 55000 where name = 'Admin Plan' $$,
  'admin can update a plan');

select is(
  (select count(*)::int from public.memberships),
  2, 'admin sees all memberships');

-- ======== anon ========

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select 1 from public.membership_plans $$, '42501', null, 'anon has no access to membership_plans');
select throws_ok($$ select 1 from public.memberships $$, '42501', null, 'anon has no access to memberships');
select throws_ok($$ select 1 from public.membership_usages $$, '42501', null, 'anon has no access to membership_usages');
select throws_ok($$ select 1 from public.bump_notifications $$, '42501', null, 'anon has no access to bump_notifications');

reset role;
select * from finish();
rollback;
