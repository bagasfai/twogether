-- Covers migration 20261023000004_register_for_session_premium.sql:
-- register_for_session with premium priority (bump of the last-registered
-- eligible non-premium confirmed participant) and quota consumption.
--
-- Setup runs as the superuser; each RPC call switches to `authenticated`
-- with a member JWT, and table assertions `reset role` first so RLS does not
-- hide rows from the checks.

begin;
select plan(55);

insert into auth.users (id, email) values
  ('00000001-0033-0033-0033-000000000000', 'host-033@test.local'),
  ('00000002-0033-0033-0033-000000000000', 'p1-033@test.local'),
  ('00000003-0033-0033-0033-000000000000', 'p2-033@test.local'),
  ('00000004-0033-0033-0033-000000000000', 'p3-033@test.local'),
  ('00000005-0033-0033-0033-000000000000', 'p4-033@test.local'),
  ('00000006-0033-0033-0033-000000000000', 'n1-033@test.local'),
  ('00000007-0033-0033-0033-000000000000', 'n2-033@test.local'),
  ('00000008-0033-0033-0033-000000000000', 'expired-033@test.local'),
  ('00000009-0033-0033-0033-000000000000', 'cancelled-033@test.local'),
  ('00000010-0033-0033-0033-000000000000', 'exhausted-033@test.local'),
  ('00000011-0033-0033-0033-000000000000', 'p7-033@test.local'),
  ('00000012-0033-0033-0033-000000000000', 'r-033@test.local'),
  ('00000013-0033-0033-0033-000000000000', 'p8-033@test.local'),
  ('00000014-0033-0033-0033-000000000000', 'a-033@test.local'),
  ('00000015-0033-0033-0033-000000000000', 'b-033@test.local'),
  ('00000016-0033-0033-0033-000000000000', 'c-033@test.local'),
  ('00000017-0033-0033-0033-000000000000', 'x1-033@test.local'),
  ('00000018-0033-0033-0033-000000000000', 'x2-033@test.local'),
  ('00000019-0033-0033-0033-000000000000', 'x4-033@test.local'),
  ('00000020-0033-0033-0033-000000000000', 'q-033@test.local');

update public.profiles set role = 'host'
 where id = '00000001-0033-0033-0033-000000000000';

-- (id, max_participants, waitlist_capacity, registration_state)
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
select s.id::uuid, 'S', now() + interval '3 days', now() + interval '3 days 2 hours',
       'GOR', s.max_p, s.cap, '00000001-0033-0033-0033-000000000000',
       'scheduled', s.reg::public.registration_state
  from (values
    ('a3300001-0000-0000-0000-000000000000', 2, 0, 'open'),   -- S1 free seat
    ('a3300002-0000-0000-0000-000000000000', 2, 1, 'open'),   -- S2 bump, waitlist already full
    ('a3300003-0000-0000-0000-000000000000', 4, 1, 'open'),   -- S3 no eligible target, waitlist room
    ('a330003b-0000-0000-0000-000000000000', 4, 0, 'open'),   -- S3b no eligible target, waitlist full
    ('a3300004-0000-0000-0000-000000000000', 1, 1, 'open'),   -- S4 only a premium confirmed
    ('a3300005-0000-0000-0000-000000000000', 1, 1, 'open'),   -- S5 no membership
    ('a3300006-0000-0000-0000-000000000000', 1, 5, 'open'),   -- S6 dead memberships
    ('a3300007-0000-0000-0000-000000000000', 1, 2, 'open'),   -- S7 premium waitlisted
    ('a3300008-0000-0000-0000-000000000000', 1, 3, 'open'),   -- S8 re-registration
    ('a3300009-0000-0000-0000-000000000000', 4, 2, 'closed'), -- S9 closed
    ('a3300010-0000-0000-0000-000000000000', 4, 2, 'open')    -- S10 holder of the exhausted usage
  ) as s(id, max_p, cap, reg);

-- Live memberships: quota 5, started yesterday, 29 days left.
insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at, cancelled_at)
values
  ('e3300002-0000-0000-0000-000000000000', '00000002-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '1 day', now() + interval '29 days', null),
  ('e3300003-0000-0000-0000-000000000000', '00000003-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '1 day', now() + interval '29 days', null),
  ('e3300004-0000-0000-0000-000000000000', '00000004-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '1 day', now() + interval '29 days', null),
  ('e3300005-0000-0000-0000-000000000000', '00000005-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '1 day', now() + interval '29 days', null),
  ('e3300011-0000-0000-0000-000000000000', '00000011-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '1 day', now() + interval '29 days', null),
  ('e3300013-0000-0000-0000-000000000000', '00000013-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '1 day', now() + interval '29 days', null),
  -- dead memberships
  ('e3300008-0000-0000-0000-000000000000', '00000008-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '31 days', now() - interval '1 day', null),
  ('e3300009-0000-0000-0000-000000000000', '00000009-0033-0033-0033-000000000000', 0, 5, 30, now() - interval '1 day', now() + interval '29 days', now() - interval '1 hour'),
  ('e3300010-0000-0000-0000-000000000000', '00000010-0033-0033-0033-000000000000', 0, 1, 30, now() - interval '1 day', now() + interval '29 days', null);

-- The exhausted membership's only unit is used by a registration in S10.
insert into public.participants (id, session_id, user_id, status, is_premium, membership_id, registered_at)
values ('b3310010-0000-0000-0000-000000000000', 'a3300010-0000-0000-0000-000000000000',
        '00000010-0033-0033-0033-000000000000', 'confirmed', true,
        'e3300010-0000-0000-0000-000000000000', now() - interval '1 day');
insert into public.membership_usages (membership_id, participant_id)
values ('e3300010-0000-0000-0000-000000000000', 'b3310010-0000-0000-0000-000000000000');

-- S2: A (-5h) and B (-4h) confirmed, self-registered non-premium; C (-3h)
-- waiting. Waitlist capacity 1 is already used by C.
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b3320014-0000-0000-0000-000000000000', 'a3300002-0000-0000-0000-000000000000', '00000014-0033-0033-0033-000000000000', 'confirmed',    now() - interval '5 hours'),
  ('b3320015-0000-0000-0000-000000000000', 'a3300002-0000-0000-0000-000000000000', '00000015-0033-0033-0033-000000000000', 'confirmed',    now() - interval '4 hours'),
  ('b3320016-0000-0000-0000-000000000000', 'a3300002-0000-0000-0000-000000000000', '00000016-0033-0033-0033-000000000000', 'waiting_list', now() - interval '3 hours');

-- S3 and S3b: every confirmed row is ineligible as a bump target:
-- checked in, host-added, a guest, premium.
insert into public.participants
  (id, session_id, user_id, guest_name, registered_by, status, is_premium, checked_in_at, added_by, registered_at)
select (p.prefix || s.suffix || '-0000-0000-0000-000000000000')::uuid,
       s.sid::uuid, p.uid::uuid, p.guest, p.reg_by::uuid, 'confirmed', p.prem, p.chk, p.added::uuid, p.reg_at
  from (values ('a3300003-0000-0000-0000-000000000000', '3'),
               ('a330003b-0000-0000-0000-000000000000', 'b')) as s(sid, suffix),
       (values
         ('b333001', '00000017-0033-0033-0033-000000000000', null, null, false, now() - interval '1 hour', null, now() - interval '5 hours'),
         ('b333002', '00000018-0033-0033-0033-000000000000', null, null, false, null, '00000001-0033-0033-0033-000000000000', now() - interval '4 hours'),
         ('b333003', null, 'Guest Three', '00000014-0033-0033-0033-000000000000', false, null, null, now() - interval '3 hours'),
         ('b333004', '00000019-0033-0033-0033-000000000000', null, null, true, null, null, now() - interval '2 hours')
       ) as p(prefix, uid, guest, reg_by, prem, chk, added, reg_at);

-- S4: the only confirmed participant is premium.
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at) values
  ('b3340020-0000-0000-0000-000000000000', 'a3300004-0000-0000-0000-000000000000', '00000020-0033-0033-0033-000000000000', 'confirmed', true, now() - interval '5 hours');

-- S5, S6: one confirmed self-registered non-premium participant (A).
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b3350014-0000-0000-0000-000000000000', 'a3300005-0000-0000-0000-000000000000', '00000014-0033-0033-0033-000000000000', 'confirmed', now() - interval '5 hours'),
  ('b3360014-0000-0000-0000-000000000000', 'a3300006-0000-0000-0000-000000000000', '00000014-0033-0033-0033-000000000000', 'confirmed', now() - interval '5 hours');

-- S7: the only confirmed participant is premium, so P7 cannot bump.
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at) values
  ('b3370020-0000-0000-0000-000000000000', 'a3300007-0000-0000-0000-000000000000', '00000020-0033-0033-0033-000000000000', 'confirmed', true, now() - interval '5 hours');

-- ======== premium_takes_free_seat_and_consumes_quota ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a3300001-0000-0000-0000-000000000000')).status::text,
  'confirmed',
  'premium_takes_free_seat_and_consumes_quota: confirmed'
);
reset role;

select is(
  (select (is_premium, membership_id, bumped_at)::text from public.participants
    where session_id = 'a3300001-0000-0000-0000-000000000000'
      and user_id = '00000002-0033-0033-0033-000000000000'),
  (true, 'e3300002-0000-0000-0000-000000000000'::uuid, null::timestamptz)::text,
  'premium_takes_free_seat_and_consumes_quota: premium snapshot on the row'
);
select is(
  (select count(*)::int from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300001-0000-0000-0000-000000000000'
      and p.user_id = '00000002-0033-0033-0033-000000000000'
      and u.membership_id = 'e3300002-0000-0000-0000-000000000000'
      and u.refunded_at is null
      and u.consumed_at = now()),
  1,
  'premium_takes_free_seat_and_consumes_quota: one live usage row'
);
select is(public.membership_quota_left('e3300002-0000-0000-0000-000000000000'), 4,
  'premium_takes_free_seat_and_consumes_quota: quota decremented');
select is(
  (select count(*)::int from public.bump_notifications),
  0,
  'premium_takes_free_seat_and_consumes_quota: no bump on a free seat'
);

-- ======== premium_on_full_session_bumps_last_registered_non_premium ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a3300002-0000-0000-0000-000000000000')).status::text,
  'confirmed',
  'premium_on_full_session_bumps_last_registered_non_premium: caller confirmed'
);
reset role;

select is(
  (select status::text from public.participants where id = 'b3320015-0000-0000-0000-000000000000'),
  'waiting_list',
  'premium_on_full_session_bumps_last_registered_non_premium: last registered (B) bumped'
);
select isnt(
  (select bumped_at from public.participants where id = 'b3320015-0000-0000-0000-000000000000'),
  null,
  'premium_on_full_session_bumps_last_registered_non_premium: bumped_at set'
);
select is(
  (select registered_at from public.participants where id = 'b3320015-0000-0000-0000-000000000000'),
  (select registered_at from public.participants where id = 'b3320016-0000-0000-0000-000000000000')
    - interval '1 microsecond',
  'premium_on_full_session_bumps_last_registered_non_premium: re-stamped 1us before the oldest waiter'
);
select is(
  (select array_agg(participant_id) from public.bump_notifications),
  array['b3320015-0000-0000-0000-000000000000'::uuid],
  'premium_on_full_session_bumps_last_registered_non_premium: exactly one bump_notifications row, for B'
);
select is(
  public.waitlist_position_of('a3300002-0000-0000-0000-000000000000',
    (select registered_at from public.participants where id = 'b3320015-0000-0000-0000-000000000000'),
    'b3320015-0000-0000-0000-000000000000'),
  1,
  'premium_on_full_session_bumps_last_registered_non_premium: B is first in line'
);
select is(
  public.waitlist_position_of('a3300002-0000-0000-0000-000000000000',
    (select registered_at from public.participants where id = 'b3320016-0000-0000-0000-000000000000'),
    'b3320016-0000-0000-0000-000000000000'),
  2,
  'premium_on_full_session_bumps_last_registered_non_premium: older waiter C is behind B'
);
select is(
  (select array_agg(user_id order by user_id) from public.participants
    where session_id = 'a3300002-0000-0000-0000-000000000000' and status = 'confirmed'),
  array['00000003-0033-0033-0033-000000000000'::uuid, '00000014-0033-0033-0033-000000000000'::uuid],
  'premium_on_full_session_bumps_last_registered_non_premium: confirmed set is A + caller, count == capacity, no promotion'
);
select is(
  (select count(*)::int from public.participants
    where session_id = 'a3300002-0000-0000-0000-000000000000' and status = 'waiting_list'),
  2,
  'premium_on_full_session_bumps_last_registered_non_premium: bump ignores waitlist_capacity'
);
select is(public.membership_quota_left('e3300003-0000-0000-0000-000000000000'), 4,
  'premium_on_full_session_bumps_last_registered_non_premium: quota consumed');

-- ======== bump_skips_checked_in_host_added_guest_and_premium ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000004-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (select (r.status::text, r.waitlist_position)::text
     from public.register_for_session('a3300003-0000-0000-0000-000000000000') r),
  ('waiting_list', 1)::text,
  'bump_skips_checked_in_host_added_guest_and_premium: caller waitlisted at position 1'
);
select throws_ok(
  $$select public.register_for_session('a330003b-0000-0000-0000-000000000000')$$,
  'JB002',
  'session is full',
  'bump_skips_checked_in_host_added_guest_and_premium: full waitlist raises JB002'
);
reset role;

select is(
  (select count(*)::int from public.participants
    where session_id in ('a3300003-0000-0000-0000-000000000000', 'a330003b-0000-0000-0000-000000000000')
      and id::text like 'b333%'
      and status = 'confirmed' and bumped_at is null),
  8,
  'bump_skips_checked_in_host_added_guest_and_premium: nobody moved in either session'
);
select is(
  (select count(*)::int from public.bump_notifications),
  1,
  'bump_skips_checked_in_host_added_guest_and_premium: no new bump_notifications'
);
select is(
  (select count(*)::int from public.participants
    where session_id = 'a330003b-0000-0000-0000-000000000000'
      and user_id = '00000004-0033-0033-0033-000000000000'),
  0,
  'bump_skips_checked_in_host_added_guest_and_premium: JB002 leaves no row'
);
select is(
  (select count(*)::int from public.participants
    where session_id = 'a3300003-0000-0000-0000-000000000000' and status = 'confirmed'),
  4,
  'bump_skips_checked_in_host_added_guest_and_premium: confirmed count unchanged'
);

-- ======== premium_does_not_bump_premium ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000005-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a3300004-0000-0000-0000-000000000000')).status::text,
  'waiting_list',
  'premium_does_not_bump_premium: caller waitlisted'
);
reset role;

select is(
  (select (status, bumped_at)::text from public.participants
    where id = 'b3340020-0000-0000-0000-000000000000'),
  ('confirmed', null::timestamptz)::text,
  'premium_does_not_bump_premium: confirmed premium untouched'
);

-- ======== no_membership_registers_as_before ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000006-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (select (r.status::text, r.waitlist_position)::text
     from public.register_for_session('a3300005-0000-0000-0000-000000000000') r),
  ('waiting_list', 1)::text,
  'no_membership_registers_as_before: full session waitlists'
);
set local request.jwt.claims = '{"sub":"00000007-0033-0033-0033-000000000000","role":"authenticated"}';
select throws_ok(
  $$select public.register_for_session('a3300005-0000-0000-0000-000000000000')$$,
  'JB002',
  'session is full',
  'no_membership_registers_as_before: full waitlist raises JB002'
);
reset role;

select is(
  (select (is_premium, membership_id)::text from public.participants
    where session_id = 'a3300005-0000-0000-0000-000000000000'
      and user_id = '00000006-0033-0033-0033-000000000000'),
  (false, null::uuid)::text,
  'no_membership_registers_as_before: not premium'
);
select is(
  (select status::text from public.participants where id = 'b3350014-0000-0000-0000-000000000000'),
  'confirmed',
  'no_membership_registers_as_before: nobody bumped'
);
select is(
  (select count(*)::int from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300005-0000-0000-0000-000000000000'),
  0,
  'no_membership_registers_as_before: zero usage rows'
);

-- ======== expired_cancelled_or_exhausted_membership_registers_as_normal ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000008-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a3300006-0000-0000-0000-000000000000')).status::text,
  'waiting_list',
  'expired_cancelled_or_exhausted_membership_registers_as_normal: expired waitlists'
);
set local request.jwt.claims = '{"sub":"00000009-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a3300006-0000-0000-0000-000000000000')).status::text,
  'waiting_list',
  'expired_cancelled_or_exhausted_membership_registers_as_normal: cancelled waitlists'
);
set local request.jwt.claims = '{"sub":"00000010-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a3300006-0000-0000-0000-000000000000')).status::text,
  'waiting_list',
  'expired_cancelled_or_exhausted_membership_registers_as_normal: exhausted waitlists'
);
reset role;

select is(
  (select count(*)::int from public.participants
    where session_id = 'a3300006-0000-0000-0000-000000000000'
      and status = 'waiting_list'
      and not is_premium and membership_id is null),
  3,
  'expired_cancelled_or_exhausted_membership_registers_as_normal: all three non-premium'
);
select is(
  (select status::text from public.participants where id = 'b3360014-0000-0000-0000-000000000000'),
  'confirmed',
  'expired_cancelled_or_exhausted_membership_registers_as_normal: nobody bumped'
);
select is(
  (select count(*)::int from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300006-0000-0000-0000-000000000000'),
  0,
  'expired_cancelled_or_exhausted_membership_registers_as_normal: zero usage rows'
);

-- ======== premium_waitlisted_still_consumes_quota ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000011-0033-0033-0033-000000000000","role":"authenticated"}';
select is(
  (select (r.status::text, r.waitlist_position)::text
     from public.register_for_session('a3300007-0000-0000-0000-000000000000') r),
  ('waiting_list', 1)::text,
  'premium_waitlisted_still_consumes_quota: waitlisted'
);
reset role;

select is(
  (select count(*)::int from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300007-0000-0000-0000-000000000000'
      and p.user_id = '00000011-0033-0033-0033-000000000000'
      and p.is_premium
      and u.refunded_at is null),
  1,
  'premium_waitlisted_still_consumes_quota: one live usage row'
);
select is(public.membership_quota_left('e3300011-0000-0000-0000-000000000000'), 4,
  'premium_waitlisted_still_consumes_quota: quota decremented');

-- ======== reregistration_resets_premium_flags_and_creates_new_usage ========
-- Task 4 adds the refund-on-cancel triggers. Until then this test refunds
-- the old usage row by hand after each cancel, which is what those triggers
-- will do for an early cancel.

-- R (no membership) takes the only seat; premium P8 bumps R.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000012-0033-0033-0033-000000000000","role":"authenticated"}';
select public.register_for_session('a3300008-0000-0000-0000-000000000000');
set local request.jwt.claims = '{"sub":"00000013-0033-0033-0033-000000000000","role":"authenticated"}';
select public.register_for_session('a3300008-0000-0000-0000-000000000000');
-- R cancels from the waitlist (bumped_at is still set on R's row).
set local request.jwt.claims = '{"sub":"00000012-0033-0033-0033-000000000000","role":"authenticated"}';
select public.cancel_registration('a3300008-0000-0000-0000-000000000000');
reset role;

select isnt(
  (select bumped_at from public.participants
    where session_id = 'a3300008-0000-0000-0000-000000000000'
      and user_id = '00000012-0033-0033-0033-000000000000'),
  null,
  'reregistration_resets_premium_flags_and_creates_new_usage: setup, R was bumped'
);

-- R is granted a membership, then re-registers (on-conflict update path).
insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at)
values ('e3300012-0000-0000-0000-000000000000', '00000012-0033-0033-0033-000000000000',
        0, 5, 30, now() - interval '1 day', now() + interval '29 days');

set local role authenticated;
select is(
  (public.register_for_session('a3300008-0000-0000-0000-000000000000')).status::text,
  'waiting_list',
  'reregistration_resets_premium_flags_and_creates_new_usage: R waitlisted (P8 is premium, no bump)'
);
reset role;

select is(
  (select (is_premium, membership_id, bumped_at)::text from public.participants
    where session_id = 'a3300008-0000-0000-0000-000000000000'
      and user_id = '00000012-0033-0033-0033-000000000000'),
  (true, 'e3300012-0000-0000-0000-000000000000'::uuid, null::timestamptz)::text,
  'reregistration_resets_premium_flags_and_creates_new_usage: R premium, bumped_at reset'
);

-- P8 cancels (R, the premium waiter, is promoted); refund P8's usage by hand.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000013-0033-0033-0033-000000000000","role":"authenticated"}';
select public.cancel_registration('a3300008-0000-0000-0000-000000000000');
reset role;
update public.membership_usages set refunded_at = now(), refund_reason = 'test: manual refund'
 where participant_id = (select id from public.participants
                          where session_id = 'a3300008-0000-0000-0000-000000000000'
                            and user_id = '00000013-0033-0033-0033-000000000000');

set local role authenticated;
select is(
  (public.register_for_session('a3300008-0000-0000-0000-000000000000')).status::text,
  'waiting_list',
  'reregistration_resets_premium_flags_and_creates_new_usage: P8 re-registers behind premium R'
);
reset role;

select is(
  (select (count(*), count(*) filter (where u.refunded_at is null))::text
     from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300008-0000-0000-0000-000000000000'
      and p.user_id = '00000013-0033-0033-0033-000000000000'),
  (2, 1)::text,
  'reregistration_resets_premium_flags_and_creates_new_usage: fresh usage row, old refunded row does not collide'
);

-- P8 cancels again; refund by hand; membership cancelled; re-register.
set local role authenticated;
select public.cancel_registration('a3300008-0000-0000-0000-000000000000');
reset role;
update public.membership_usages set refunded_at = now(), refund_reason = 'test: manual refund'
 where refunded_at is null
   and participant_id = (select id from public.participants
                          where session_id = 'a3300008-0000-0000-0000-000000000000'
                            and user_id = '00000013-0033-0033-0033-000000000000');
update public.memberships set cancelled_at = now()
 where id = 'e3300013-0000-0000-0000-000000000000';

set local role authenticated;
select public.register_for_session('a3300008-0000-0000-0000-000000000000');
reset role;

select is(
  (select (is_premium, membership_id, bumped_at)::text from public.participants
    where session_id = 'a3300008-0000-0000-0000-000000000000'
      and user_id = '00000013-0033-0033-0033-000000000000'),
  (false, null::uuid, null::timestamptz)::text,
  'reregistration_resets_premium_flags_and_creates_new_usage: flags reset to non-premium'
);
select is(
  (select count(*) filter (where u.refunded_at is null)::int
     from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300008-0000-0000-0000-000000000000'
      and p.user_id = '00000013-0033-0033-0033-000000000000'),
  0,
  'reregistration_resets_premium_flags_and_creates_new_usage: non-premium re-registration consumes nothing'
);

-- Robustness: R cancels WITHOUT a refund (what a late cancel will do once
-- Task 4 lands), then re-registers. No unique violation, still one live
-- usage for the participant row.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000012-0033-0033-0033-000000000000","role":"authenticated"}';
select public.cancel_registration('a3300008-0000-0000-0000-000000000000');
select lives_ok(
  $$select public.register_for_session('a3300008-0000-0000-0000-000000000000')$$,
  'reregistration_resets_premium_flags_and_creates_new_usage: unrefunded old usage does not raise'
);
reset role;

select is(
  (select count(*)::int
     from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300008-0000-0000-0000-000000000000'
      and p.user_id = '00000012-0033-0033-0033-000000000000'
      and u.refunded_at is null),
  1,
  'reregistration_resets_premium_flags_and_creates_new_usage: unrefunded old usage is not duplicated'
);

-- ======== reregistration_over_live_usage_repoints_it_to_current_membership ========
-- P9 registers on M1 (quota 1, so M1 is then exhausted). The row is then
-- cancelled directly with no refund: the Task 4 refund triggers do not exist
-- yet, and a late cancel will keep the usage live the same way. P9 is
-- granted M2; with M1 exhausted, lock_current_membership returns M2.

insert into auth.users (id, email) values
  ('00000021-0033-0033-0033-000000000000', 'p9-033@test.local');
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values ('a3300011-0000-0000-0000-000000000000', 'S', now() + interval '3 days',
        now() + interval '3 days 2 hours', 'GOR', 2, 0,
        '00000001-0033-0033-0033-000000000000', 'scheduled', 'open');
insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at, created_at)
values ('e3300021-0000-0000-0000-000000000000', '00000021-0033-0033-0033-000000000000',
        0, 1, 30, now() - interval '1 day', now() + interval '29 days', now() - interval '2 days');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000021-0033-0033-0033-000000000000","role":"authenticated"}';
select public.register_for_session('a3300011-0000-0000-0000-000000000000');
reset role;

update public.participants set status = 'cancelled', cancelled_at = now()
 where session_id = 'a3300011-0000-0000-0000-000000000000'
   and user_id = '00000021-0033-0033-0033-000000000000';

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at, created_at)
values ('e3300022-0000-0000-0000-000000000000', '00000021-0033-0033-0033-000000000000',
        0, 5, 30, now() - interval '1 day', now() + interval '29 days', now() - interval '1 day');

select is(public.membership_quota_left('e3300021-0000-0000-0000-000000000000'), 0,
  'reregistration_over_live_usage_repoints_it_to_current_membership: setup, M1 exhausted by the live usage');

set local role authenticated;
select public.register_for_session('a3300011-0000-0000-0000-000000000000');
reset role;

select is(
  (select array_agg(u.membership_id::text || '/' || p.membership_id::text)
     from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3300011-0000-0000-0000-000000000000'
      and p.user_id = '00000021-0033-0033-0033-000000000000'
      and u.refunded_at is null),
  array['e3300022-0000-0000-0000-000000000000/e3300022-0000-0000-0000-000000000000'],
  'reregistration_over_live_usage_repoints_it_to_current_membership: one live usage, on M2, matching participants.membership_id'
);
select is(public.membership_quota_left('e3300021-0000-0000-0000-000000000000'), 1,
  'reregistration_over_live_usage_repoints_it_to_current_membership: M1 gets its unit back');
select is(public.membership_quota_left('e3300022-0000-0000-0000-000000000000'), 4,
  'reregistration_over_live_usage_repoints_it_to_current_membership: M2 is charged one unit');

-- ======== registration_closed_and_already_registered_errors_unchanged ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0033-0033-0033-000000000000","role":"authenticated"}';
select throws_ok(
  $$select public.register_for_session('a3300009-0000-0000-0000-000000000000')$$,
  'JB001',
  'registration is not open',
  'registration_closed_and_already_registered_errors_unchanged: JB001'
);
select throws_ok(
  $$select public.register_for_session('a3300001-0000-0000-0000-000000000000')$$,
  'JB003',
  'already registered',
  'registration_closed_and_already_registered_errors_unchanged: JB003'
);
set local request.jwt.claims = '{"sub":"00000006-0033-0033-0033-000000000000","role":"authenticated"}';
select throws_ok(
  $$select public.register_for_session('a3300009-0000-0000-0000-000000000000')$$,
  'JB001',
  'registration is not open',
  'registration_closed_and_already_registered_errors_unchanged: JB001 without membership'
);
reset role;

select is(public.membership_quota_left('e3300002-0000-0000-0000-000000000000'), 4,
  'registration_closed_and_already_registered_errors_unchanged: no quota consumed by errors');
select is(
  (select count(*)::int from public.participants
    where session_id = 'a3300009-0000-0000-0000-000000000000'),
  0,
  'registration_closed_and_already_registered_errors_unchanged: no row on closed session'
);

select * from finish();
rollback;
