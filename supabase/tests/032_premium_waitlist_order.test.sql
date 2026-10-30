-- Covers migration 20261023000003_premium_membership_helpers.sql:
-- premium-first waitlist order (promote_from_waitlist, waitlist_position_of),
-- membership_quota_left and lock_current_membership.

begin;
select plan(15);

insert into auth.users (id, email) values
  ('11111111-5555-5555-5555-555555555555', 'u1-032@test.local'),
  ('22222222-5555-5555-5555-555555555555', 'u2-032@test.local'),
  ('33333333-5555-5555-5555-555555555555', 'u3-032@test.local'),
  ('44444444-5555-5555-5555-555555555555', 'u4-032@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'u5-032@test.local'),
  ('66666666-5555-5555-5555-555555555555', 'u6-032@test.local'),
  ('77777777-5555-5555-5555-555555555555', 'u7-032@test.local'),
  ('88888888-5555-5555-5555-555555555555', 'host-032@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('a0000000-5555-5555-5555-555555555555', 'A', now() + interval '3 days',
   now() + interval '3 days 2 hours', 'GOR', 2, '88888888-5555-5555-5555-555555555555', 'scheduled'),
  ('b0000000-5555-5555-5555-555555555555', 'B', now() + interval '3 days',
   now() + interval '3 days 2 hours', 'GOR', 1, '88888888-5555-5555-5555-555555555555', 'scheduled'),
  ('c0000000-5555-5555-5555-555555555555', 'C', now() + interval '3 days',
   now() + interval '3 days 2 hours', 'GOR', 1, '88888888-5555-5555-5555-555555555555', 'scheduled');

-- Session A: u1,u2 confirmed; u3 non-premium waiter (older), u4 premium waiter (newer).
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at) values
  ('a1000000-5555-5555-5555-555555555555', 'a0000000-5555-5555-5555-555555555555', '11111111-5555-5555-5555-555555555555', 'confirmed', false, now() - interval '5 hours'),
  ('a2000000-5555-5555-5555-555555555555', 'a0000000-5555-5555-5555-555555555555', '22222222-5555-5555-5555-555555555555', 'confirmed', false, now() - interval '4 hours'),
  ('a3000000-5555-5555-5555-555555555555', 'a0000000-5555-5555-5555-555555555555', '33333333-5555-5555-5555-555555555555', 'waiting_list', false, now() - interval '3 hours'),
  ('a4000000-5555-5555-5555-555555555555', 'a0000000-5555-5555-5555-555555555555', '44444444-5555-5555-5555-555555555555', 'waiting_list', true, now() - interval '1 hour');

-- Session B: u1 confirmed; u2 (-1h), u3 (-3h, bumped style), u4 (-2h) non-premium waiters.
insert into public.participants (id, session_id, user_id, status, bumped_at, registered_at) values
  ('b1000000-5555-5555-5555-555555555555', 'b0000000-5555-5555-5555-555555555555', '11111111-5555-5555-5555-555555555555', 'confirmed', null, now() - interval '5 hours'),
  ('b2000000-5555-5555-5555-555555555555', 'b0000000-5555-5555-5555-555555555555', '22222222-5555-5555-5555-555555555555', 'waiting_list', null, now() - interval '1 hour'),
  ('b3000000-5555-5555-5555-555555555555', 'b0000000-5555-5555-5555-555555555555', '33333333-5555-5555-5555-555555555555', 'waiting_list', now(), now() - interval '3 hours'),
  ('b4000000-5555-5555-5555-555555555555', 'b0000000-5555-5555-5555-555555555555', '44444444-5555-5555-5555-555555555555', 'waiting_list', null, now() - interval '2 hours');

-- Session C: u1 confirmed; u2 premium waiter (-1h), u3 non-premium waiter (-2h).
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('d0000000-5555-5555-5555-555555555555', 'D', now() + interval '3 days',
   now() + interval '3 days 2 hours', 'GOR', 1, '88888888-5555-5555-5555-555555555555', 'scheduled');

-- Session D (delete path): u1 confirmed; u2 non-premium waiter (older), u3 premium waiter (newer).
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at) values
  ('d1000000-5555-5555-5555-555555555555', 'd0000000-5555-5555-5555-555555555555', '11111111-5555-5555-5555-555555555555', 'confirmed', false, now() - interval '5 hours'),
  ('d2000000-5555-5555-5555-555555555555', 'd0000000-5555-5555-5555-555555555555', '22222222-5555-5555-5555-555555555555', 'waiting_list', false, now() - interval '3 hours'),
  ('d3000000-5555-5555-5555-555555555555', 'd0000000-5555-5555-5555-555555555555', '33333333-5555-5555-5555-555555555555', 'waiting_list', true, now() - interval '1 hour');

insert into public.participants (id, session_id, user_id, status, is_premium, registered_at) values
  ('c1000000-5555-5555-5555-555555555555', 'c0000000-5555-5555-5555-555555555555', '11111111-5555-5555-5555-555555555555', 'confirmed', false, now() - interval '5 hours'),
  ('c2000000-5555-5555-5555-555555555555', 'c0000000-5555-5555-5555-555555555555', '22222222-5555-5555-5555-555555555555', 'waiting_list', true, now() - interval '1 hour'),
  ('c3000000-5555-5555-5555-555555555555', 'c0000000-5555-5555-5555-555555555555', '33333333-5555-5555-5555-555555555555', 'waiting_list', false, now() - interval '2 hours');

-- ======== promotion order ========

update public.participants set status = 'cancelled'
 where id = 'a1000000-5555-5555-5555-555555555555';

select is(
  (select status::text from public.participants where id = 'a4000000-5555-5555-5555-555555555555'),
  'confirmed',
  'promotes_premium_waiter_before_older_non_premium'
);
select is(
  (select status::text from public.participants where id = 'a3000000-5555-5555-5555-555555555555'),
  'waiting_list',
  'the older non-premium waiter stays waiting'
);

update public.participants set status = 'cancelled'
 where id = 'b1000000-5555-5555-5555-555555555555';

select is(
  (select status::text from public.participants where id = 'b3000000-5555-5555-5555-555555555555'),
  'confirmed',
  'bumped_style_row_promotes_before_other_non_premium'
);
select is(
  (select count(*)::int from public.participants
    where session_id = 'b0000000-5555-5555-5555-555555555555' and status = 'waiting_list'),
  2,
  'the other two non-premium waiters stay waiting'
);

-- ======== host DELETE path ========

delete from public.participants where id = 'd1000000-5555-5555-5555-555555555555';

select is(
  (select status::text from public.participants where id = 'd3000000-5555-5555-5555-555555555555'),
  'confirmed',
  'delete_promotes_premium_waiter_before_older_non_premium'
);
select is(
  (select status::text from public.participants where id = 'd2000000-5555-5555-5555-555555555555'),
  'waiting_list',
  'the older non-premium waiter stays waiting after a delete'
);

-- ======== waitlist_position_of ========

select is(
  public.waitlist_position_of('c0000000-5555-5555-5555-555555555555',
    (select registered_at from public.participants where id = 'c3000000-5555-5555-5555-555555555555'),
    'c3000000-5555-5555-5555-555555555555'),
  2,
  'waitlist_position_of_counts_premium_ahead'
);
select is(
  public.waitlist_position_of('c0000000-5555-5555-5555-555555555555',
    (select registered_at from public.participants where id = 'c2000000-5555-5555-5555-555555555555'),
    'c2000000-5555-5555-5555-555555555555'),
  1,
  'the premium waiter is first'
);

-- ======== membership_quota_left / lock_current_membership ========
-- u5: expired, cancelled, exhausted (quota 1, one live usage), then a queued one.

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at, cancelled_at, created_at)
values
  ('e1000000-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 0, 5, 30,
   now() - interval '40 days', now() - interval '1 day', null, now() - interval '5 hours'),
  ('e2000000-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 0, 5, 30,
   now() - interval '1 day', now() + interval '29 days', now(), now() - interval '4 hours'),
  ('e3000000-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 0, 1, 30,
   now() - interval '1 day', now() + interval '29 days', null, now() - interval '3 hours'),
  ('e4000000-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 0, 3, 14,
   null, null, null, now() - interval '2 hours');

insert into public.participants (id, session_id, user_id, status)
values ('a5000000-5555-5555-5555-555555555555', 'a0000000-5555-5555-5555-555555555555',
        '55555555-5555-5555-5555-555555555555', 'cancelled');
insert into public.membership_usages (membership_id, participant_id)
values ('e3000000-5555-5555-5555-555555555555', 'a5000000-5555-5555-5555-555555555555');

select is(public.membership_quota_left('e3000000-5555-5555-5555-555555555555'), 0,
  'quota_left is 0 when the only unit is used');
select is(public.membership_quota_left('e4000000-5555-5555-5555-555555555555'), 3,
  'quota_left is quota_total with no usages');

update public.membership_usages set refunded_at = now()
 where membership_id = 'e3000000-5555-5555-5555-555555555555';
select is(public.membership_quota_left('e3000000-5555-5555-5555-555555555555'), 1,
  'a refunded usage returns the unit');
update public.membership_usages set refunded_at = null
 where membership_id = 'e3000000-5555-5555-5555-555555555555';

select is(
  (select id from public.lock_current_membership('55555555-5555-5555-5555-555555555555')),
  'e4000000-5555-5555-5555-555555555555'::uuid,
  'lock_current_membership_skips_exhausted_and_expired'
);

select is(
  (select (started_at = now() and expires_at = now() + interval '14 days')
     from public.memberships where id = 'e4000000-5555-5555-5555-555555555555'),
  true,
  'lock_current_membership_starts_queued_membership_lazily'
);

select is(
  (select expires_at from public.memberships where id = 'e1000000-5555-5555-5555-555555555555'),
  now() - interval '1 day',
  'skipped memberships are not modified'
);

select is(
  (select id from public.lock_current_membership('77777777-5555-5555-5555-555555555555')),
  null::uuid,
  'lock_current_membership_returns_null_row_when_none'
);

select * from finish();
rollback;
