-- Covers migration 20261028000002_drilling_registration_rules.sql:
--   * the premium bump target now includes host-added rows and guest rows
--     (still skips premium and checked-in rows);
--   * bumping a guest row (no account) inserts no bump_notifications row;
--   * re-registration, host re-add and host un-cancel clear replaced_by and
--     paid_by_user_id.

begin;
select plan(17);

insert into auth.users (id, email) values
  ('00000001-0041-0041-0041-000000000000', 'host-041@test.local'),
  ('00000002-0041-0041-0041-000000000000', 'prem-041@test.local'),
  ('00000003-0041-0041-0041-000000000000', 'n1-041@test.local'),
  ('00000004-0041-0041-0041-000000000000', 'n2-041@test.local'),
  ('00000005-0041-0041-0041-000000000000', 'n3-041@test.local');

update public.profiles set role = 'host'
 where id = '00000001-0041-0041-0041-000000000000';

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at)
values
  ('e4100002-0000-0000-0000-000000000000', '00000002-0041-0041-0041-000000000000',
   0, 20, 30, now() - interval '1 day', now() + interval '29 days');

-- Sessions: (id, max_participants, waitlist_capacity, kind, coaches, seats)
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   court_count, kind, coach_count, seats_per_coach, created_by, status, registration_state)
select s.id::uuid, 'S', now() + interval '3 days', now() + interval '3 days 2 hours', 'GOR',
       s.max_p, s.cap, coalesce(s.coaches, 1), s.kind::public.session_kind, s.coaches, s.seats,
       '00000001-0041-0041-0041-000000000000', 'scheduled', 'open'
  from (values
    ('a4100001-0000-0000-0000-000000000000', 1, 0, 'open_play', null::int, null::int), -- A host-added target
    ('a4100002-0000-0000-0000-000000000000', 2, 0, 'drilling',  1, 2),                 -- B drilling host-added target
    ('a4100003-0000-0000-0000-000000000000', 1, 0, 'open_play', null, null),           -- C guest target
    ('a4100004-0000-0000-0000-000000000000', 2, 1, 'open_play', null, null),           -- D checked-in + premium only
    ('a4100005-0000-0000-0000-000000000000', 2, 0, 'open_play', null, null),           -- E member older, guest newer
    ('a4100006-0000-0000-0000-000000000000', 5, 0, 'open_play', null, null),           -- F re-registration
    ('a4100007-0000-0000-0000-000000000000', 5, 0, 'open_play', null, null),           -- G host re-add
    ('a4100008-0000-0000-0000-000000000000', 5, 0, 'open_play', null, null)            -- H host un-cancel
  ) as s(id, max_p, cap, kind, coaches, seats);

-- A: one confirmed host-added non-premium member.
insert into public.participants (id, session_id, user_id, status, added_by, registered_at) values
  ('b4100001-0000-0000-0000-000000000000', 'a4100001-0000-0000-0000-000000000000',
   '00000003-0041-0041-0041-000000000000', 'confirmed',
   '00000001-0041-0041-0041-000000000000', now() - interval '2 hours');

-- B: host-added N2 (last registered) and a checked-in N1.
insert into public.participants (id, session_id, user_id, status, added_by, checked_in_at, registered_at) values
  ('b4100002-0000-0000-0000-000000000000', 'a4100002-0000-0000-0000-000000000000',
   '00000003-0041-0041-0041-000000000000', 'confirmed', null, now(), now() - interval '3 hours'),
  ('b4100012-0000-0000-0000-000000000000', 'a4100002-0000-0000-0000-000000000000',
   '00000004-0041-0041-0041-000000000000', 'confirmed',
   '00000001-0041-0041-0041-000000000000', null, now() - interval '1 hour');

-- C: one confirmed guest.
insert into public.participants (id, session_id, user_id, guest_name, registered_by, status, registered_at) values
  ('b4100003-0000-0000-0000-000000000000', 'a4100003-0000-0000-0000-000000000000',
   null, 'Guest C', '00000003-0041-0041-0041-000000000000', 'confirmed', now() - interval '2 hours');

-- D: a checked-in member and a premium member; nothing bumpable.
insert into public.participants (id, session_id, user_id, status, is_premium, checked_in_at, registered_at) values
  ('b4100004-0000-0000-0000-000000000000', 'a4100004-0000-0000-0000-000000000000',
   '00000003-0041-0041-0041-000000000000', 'confirmed', false, now(), now() - interval '3 hours'),
  ('b4100014-0000-0000-0000-000000000000', 'a4100004-0000-0000-0000-000000000000',
   '00000004-0041-0041-0041-000000000000', 'confirmed', true, null, now() - interval '2 hours');

-- E: member (older) and guest (newer), both bumpable.
insert into public.participants (id, session_id, user_id, guest_name, registered_by, status, registered_at) values
  ('b4100005-0000-0000-0000-000000000000', 'a4100005-0000-0000-0000-000000000000',
   '00000003-0041-0041-0041-000000000000', null, null, 'confirmed', now() - interval '3 hours'),
  ('b4100015-0000-0000-0000-000000000000', 'a4100005-0000-0000-0000-000000000000',
   null, 'Guest E', '00000004-0041-0041-0041-000000000000', 'confirmed', now() - interval '1 hour');

-- F, G, H: N1's cancelled row carries both transfer links (replaced_by points
-- at N2's row, paid_by_user_id at N2).
insert into public.participants (id, session_id, user_id, status, cancelled_at, registered_at) values
  ('b4100026-0000-0000-0000-000000000000', 'a4100006-0000-0000-0000-000000000000', '00000004-0041-0041-0041-000000000000', 'confirmed', null, now() - interval '3 hours'),
  ('b4100027-0000-0000-0000-000000000000', 'a4100007-0000-0000-0000-000000000000', '00000004-0041-0041-0041-000000000000', 'confirmed', null, now() - interval '3 hours'),
  ('b4100028-0000-0000-0000-000000000000', 'a4100008-0000-0000-0000-000000000000', '00000004-0041-0041-0041-000000000000', 'confirmed', null, now() - interval '3 hours'),
  ('b4100006-0000-0000-0000-000000000000', 'a4100006-0000-0000-0000-000000000000', '00000003-0041-0041-0041-000000000000', 'cancelled', now(), now() - interval '4 hours'),
  ('b4100007-0000-0000-0000-000000000000', 'a4100007-0000-0000-0000-000000000000', '00000003-0041-0041-0041-000000000000', 'cancelled', now(), now() - interval '4 hours'),
  ('b4100008-0000-0000-0000-000000000000', 'a4100008-0000-0000-0000-000000000000', '00000003-0041-0041-0041-000000000000', 'cancelled', now(), now() - interval '4 hours');

update public.participants
   set replaced_by = case id
         when 'b4100006-0000-0000-0000-000000000000' then 'b4100026-0000-0000-0000-000000000000'::uuid
         when 'b4100007-0000-0000-0000-000000000000' then 'b4100027-0000-0000-0000-000000000000'::uuid
         else 'b4100028-0000-0000-0000-000000000000'::uuid end,
       paid_by_user_id = '00000004-0041-0041-0041-000000000000'
 where id in ('b4100006-0000-0000-0000-000000000000',
              'b4100007-0000-0000-0000-000000000000',
              'b4100008-0000-0000-0000-000000000000');

-- ======== bump_target_includes_host_added_participant ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0041-0041-0041-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a4100001-0000-0000-0000-000000000000')).status::text,
  'confirmed',
  'bump_target_includes_host_added_participant: open play, premium caller confirmed'
);
select is(
  (public.register_for_session('a4100002-0000-0000-0000-000000000000')).status::text,
  'confirmed',
  'bump_target_includes_host_added_participant: drilling, premium caller confirmed'
);
reset role;

select is(
  (select (status::text, bumped_at is not null)::text from public.participants
    where id = 'b4100001-0000-0000-0000-000000000000'),
  ('waiting_list', true)::text,
  'bump_target_includes_host_added_participant: open play host-added row bumped'
);
select is(
  (select (status::text, bumped_at is not null)::text from public.participants
    where id = 'b4100012-0000-0000-0000-000000000000'),
  ('waiting_list', true)::text,
  'bump_target_includes_host_added_participant: drilling host-added row bumped'
);
select is(
  (select count(*)::int from public.bump_notifications),
  2,
  'bump_target_includes_host_added_participant: members with accounts get notifications'
);

-- ======== bump_target_includes_guest_row ========

set local role authenticated;
select is(
  (public.register_for_session('a4100003-0000-0000-0000-000000000000')).status::text,
  'confirmed',
  'bump_target_includes_guest_row: call returns, caller confirmed'
);
reset role;

select is(
  (select (status::text, bumped_at is not null)::text from public.participants
    where id = 'b4100003-0000-0000-0000-000000000000'),
  ('waiting_list', true)::text,
  'bump_target_includes_guest_row: guest row bumped'
);
select is(
  (select count(*)::int from public.bump_notifications
    where participant_id = 'b4100003-0000-0000-0000-000000000000'),
  0,
  'bump_target_includes_guest_row: no bump_notifications row for a guest'
);
select is(
  (select count(*)::int from public.bump_notifications),
  2,
  'bump_target_includes_guest_row: notification count unchanged'
);

-- ======== bump_still_skips_premium_and_checked_in ========

set local role authenticated;
select is(
  (select (r.status::text, r.waitlist_position)::text
     from public.register_for_session('a4100004-0000-0000-0000-000000000000') r),
  ('waiting_list', 1)::text,
  'bump_still_skips_premium_and_checked_in: caller waitlisted'
);
reset role;

select is(
  (select count(*)::int from public.participants
    where session_id = 'a4100004-0000-0000-0000-000000000000'
      and status = 'confirmed' and bumped_at is null),
  2,
  'bump_still_skips_premium_and_checked_in: both confirmed rows untouched'
);

-- ======== bump_picks_last_registered_when_guest_and_member_present ========

set local role authenticated;
select is(
  (public.register_for_session('a4100005-0000-0000-0000-000000000000')).status::text,
  'confirmed',
  'bump_picks_last_registered_when_guest_and_member_present: caller confirmed'
);
reset role;

select is(
  (select array_agg(id::text order by id) from public.participants
    where session_id = 'a4100005-0000-0000-0000-000000000000' and status = 'waiting_list'),
  array['b4100015-0000-0000-0000-000000000000'],
  'bump_picks_last_registered_when_guest_and_member_present: the newer guest is bumped, the member stays'
);

-- ======== reregistration_clears_replaced_by_and_paid_by ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0041-0041-0041-000000000000","role":"authenticated"}';
select is(
  (public.register_for_session('a4100006-0000-0000-0000-000000000000')).status::text,
  'confirmed',
  'reregistration_clears_replaced_by_and_paid_by: member registers again'
);
reset role;

select is(
  (select (replaced_by is null, paid_by_user_id is null)::text from public.participants
    where id = 'b4100006-0000-0000-0000-000000000000'),
  (true, true)::text,
  'reregistration_clears_replaced_by_and_paid_by: both cleared'
);

-- ======== host_add_clears_replaced_by_and_paid_by ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0041-0041-0041-000000000000","role":"authenticated"}';
select public.host_add_participant('a4100007-0000-0000-0000-000000000000',
  '00000003-0041-0041-0041-000000000000', 'confirmed');
reset role;

select is(
  (select (status::text, replaced_by is null, paid_by_user_id is null)::text from public.participants
    where id = 'b4100007-0000-0000-0000-000000000000'),
  ('confirmed', true, true)::text,
  'host_add_clears_replaced_by_and_paid_by: both cleared'
);

-- ======== host_uncancel_clears_replaced_by_and_paid_by ========

set local role authenticated;
select public.host_set_participant_status('b4100008-0000-0000-0000-000000000000', 'confirmed');
reset role;

select is(
  (select (status::text, replaced_by is null, paid_by_user_id is null)::text from public.participants
    where id = 'b4100008-0000-0000-0000-000000000000'),
  ('confirmed', true, true)::text,
  'host_uncancel_clears_replaced_by_and_paid_by: both cleared'
);

select * from finish();
rollback;
