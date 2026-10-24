-- Covers migration 20261023000007_premium_review_fixes.sql:
--   SA: close from scheduled refunds premium waitlisters (waitlist_at_close)
--       and clears their premium snapshot.
--   SB: close after live is a no-op for already refunded waitlisters.
--   SC: Ruling 6 -- the live sweep clears the waitlisters' premium snapshot,
--       so a later promotion while live is non-premium and never refunds
--       twice.
--   SD: host_add_participant re-using a previously premium (late-cancelled)
--       row makes it non-premium: it sorts behind a premium waiter and a
--       later cancel does not refund the forfeited unit.
--   SE: host_set_participant_status un-cancel does the same.
--   SF: host_add_participant on a still-active premium row (confirmed or
--       waiting_list) keeps the snapshot, so a later cancel before the cutoff
--       still refunds the unit.
--
-- now() is the transaction start time, so starts_at = now() + 1 hour is past
-- the 24h refund cutoff for every member cancel below.

begin;
select plan(29);

create function pg_temp.usage_state(p_session uuid, p_user uuid)
returns text
language sql
as $$
  select coalesce(string_agg(
           case when u.refunded_at is null then 'live'
                else coalesce(u.refund_reason, '<no reason>') end,
           ',' order by u.consumed_at, u.id), '')
    from public.membership_usages u
    join public.participants p on p.id = u.participant_id
   where p.session_id = p_session and p.user_id = p_user;
$$;

create function pg_temp.snapshot(p_session uuid, p_user uuid)
returns text
language sql
as $$
  select (p.status, p.is_premium, p.membership_id, p.bumped_at)::text
    from public.participants p
   where p.session_id = p_session and p.user_id = p_user;
$$;

create function pg_temp.waitlist_order(p_session uuid)
returns text
language sql
as $$
  select string_agg(p.user_id::text, ' ' order by p.is_premium desc, p.registered_at, p.id)
    from public.participants p
   where p.session_id = p_session and p.status = 'waiting_list';
$$;

create function pg_temp.position_of(p_session uuid, p_user uuid)
returns int
language sql
as $$
  select public.waitlist_position_of(p.session_id, p.registered_at, p.id)
    from public.participants p
   where p.session_id = p_session and p.user_id = p_user;
$$;

insert into auth.users (id, email) values
  ('00000001-0037-0037-0037-000000000000', 'host-037@test.local'),
  ('00000002-0037-0037-0037-000000000000', 'sa-confirmed-037@test.local'),
  ('00000003-0037-0037-0037-000000000000', 'sa-waiting-037@test.local'),
  ('00000004-0037-0037-0037-000000000000', 'sa-plain-037@test.local'),
  ('00000005-0037-0037-0037-000000000000', 'sb-confirmed-037@test.local'),
  ('00000006-0037-0037-0037-000000000000', 'sb-waiting-037@test.local'),
  ('00000007-0037-0037-0037-000000000000', 'sc-confirmed-037@test.local'),
  ('00000008-0037-0037-0037-000000000000', 'sc-waiting-037@test.local'),
  ('00000009-0037-0037-0037-000000000000', 'blocker-037@test.local'),
  ('00000010-0037-0037-0037-000000000000', 'filler-037@test.local'),
  ('00000011-0037-0037-0037-000000000000', 'sd-readded-037@test.local'),
  ('00000012-0037-0037-0037-000000000000', 'sd-premium-037@test.local'),
  ('00000013-0037-0037-0037-000000000000', 'se-uncancelled-037@test.local'),
  ('00000014-0037-0037-0037-000000000000', 'se-premium-037@test.local'),
  ('00000015-0037-0037-0037-000000000000', 'sf-confirmed-037@test.local'),
  ('00000016-0037-0037-0037-000000000000', 'sf-waiting-037@test.local');

update public.profiles set role = 'host'
 where id = '00000001-0037-0037-0037-000000000000';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
select s.id::uuid, 'S', s.starts, s.starts + interval '2 hours', 'GOR',
       s.max_p, 3, '00000001-0037-0037-0037-000000000000', 'scheduled', 'open'
  from (values
    ('a3700001-0000-0000-0000-000000000000', now() + interval '3 days', 1), -- SA close from scheduled
    ('a3700002-0000-0000-0000-000000000000', now() + interval '3 days', 1), -- SB start then close
    ('a3700003-0000-0000-0000-000000000000', now() + interval '3 days', 1), -- SC promotion while live
    ('a3700004-0000-0000-0000-000000000000', now() + interval '1 hour', 2), -- SD host re-add
    ('a3700005-0000-0000-0000-000000000000', now() + interval '1 hour', 2), -- SE host un-cancel
    ('a3700006-0000-0000-0000-000000000000', now() + interval '3 days', 1)  -- SF host re-add of active premium rows
  ) as s(id, starts, max_p);

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, refund_cutoff_hours, started_at, expires_at)
select ('e37000' || lpad(u, 2, '0') || '-0000-0000-0000-000000000000')::uuid,
       ('000000' || lpad(u, 2, '0') || '-0037-0037-0037-000000000000')::uuid,
       0, 5, 30, 24, now() - interval '1 day', now() + interval '29 days'
  from unnest(array['02', '03', '05', '06', '07', '08', '11', '12', '13', '14', '15', '16']) as u;

-- SD/SE: a premium seat holder (cannot be bumped).
insert into public.participants (session_id, user_id, status, is_premium, registered_at)
values
  ('a3700004-0000-0000-0000-000000000000', '00000009-0037-0037-0037-000000000000',
   'confirmed', true, now() - interval '1 day'),
  ('a3700005-0000-0000-0000-000000000000', '00000009-0037-0037-0037-000000000000',
   'confirmed', true, now() - interval '1 day');

-- ---- registrations ----

set local role authenticated;

set local request.jwt.claims = '{"sub":"00000002-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700001-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000003-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700001-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000004-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700001-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000005-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700002-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000006-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700002-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000007-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700003-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000008-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700003-0000-0000-0000-000000000000') is not null as registered;
-- SF: premium confirmed + premium waitlisted (1 seat).
set local request.jwt.claims = '{"sub":"00000015-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700006-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000016-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700006-0000-0000-0000-000000000000') is not null as registered;
-- SD/SE: premium, confirmed into the second seat, then a late cancel (past
-- the 24h cutoff) that keeps the unit consumed.
set local request.jwt.claims = '{"sub":"00000011-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700004-0000-0000-0000-000000000000') is not null as registered;
select public.cancel_registration('a3700004-0000-0000-0000-000000000000');
set local request.jwt.claims = '{"sub":"00000013-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700005-0000-0000-0000-000000000000') is not null as registered;
select public.cancel_registration('a3700005-0000-0000-0000-000000000000');

reset role;

-- SD/SE: fill the freed seat with another premium holder, and leave a stale
-- bumped_at on the cancelled rows.
insert into public.participants (session_id, user_id, status, is_premium, registered_at)
values
  ('a3700004-0000-0000-0000-000000000000', '00000010-0037-0037-0037-000000000000',
   'confirmed', true, now() - interval '1 day'),
  ('a3700005-0000-0000-0000-000000000000', '00000010-0037-0037-0037-000000000000',
   'confirmed', true, now() - interval '1 day');
update public.participants set bumped_at = now() - interval '2 hours'
 where user_id in ('00000011-0037-0037-0037-000000000000', '00000013-0037-0037-0037-000000000000');

-- ======== SA: close_from_scheduled_refunds_premium_waitlisters ========

update public.sessions set status = 'completed'
 where id = 'a3700001-0000-0000-0000-000000000000';

select is(
  pg_temp.usage_state('a3700001-0000-0000-0000-000000000000', '00000002-0037-0037-0037-000000000000'),
  'live',
  'close_from_scheduled: confirmed premium keeps its usage'
);
select is(
  pg_temp.usage_state('a3700001-0000-0000-0000-000000000000', '00000003-0037-0037-0037-000000000000'),
  'waitlist_at_close',
  'close_from_scheduled: waitlisted premium refunded'
);
select is(
  pg_temp.snapshot('a3700001-0000-0000-0000-000000000000', '00000003-0037-0037-0037-000000000000'),
  '(waiting_list,f,,)',
  'close_from_scheduled: refunded waitlister snapshot cleared'
);
select is(
  pg_temp.snapshot('a3700001-0000-0000-0000-000000000000', '00000002-0037-0037-0037-000000000000'),
  '(confirmed,t,e3700002-0000-0000-0000-000000000000,)',
  'close_from_scheduled: confirmed premium snapshot kept'
);
select is(
  pg_temp.usage_state('a3700001-0000-0000-0000-000000000000', '00000004-0037-0037-0037-000000000000'),
  '',
  'close_from_scheduled: non-premium waiter has no usage'
);

-- ======== SB: close_after_live_is_idempotent ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select public.start_session('a3700002-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3700002-0000-0000-0000-000000000000', '00000006-0037-0037-0037-000000000000'),
  'waitlist_at_start',
  'close_after_live: start refunds the waitlister'
);

update public.sessions set status = 'completed'
 where id = 'a3700002-0000-0000-0000-000000000000';

select is(
  pg_temp.usage_state('a3700002-0000-0000-0000-000000000000', '00000006-0037-0037-0037-000000000000'),
  'waitlist_at_start',
  'close_after_live: close leaves the start refund untouched'
);
select is(
  pg_temp.usage_state('a3700002-0000-0000-0000-000000000000', '00000005-0037-0037-0037-000000000000'),
  'live',
  'close_after_live: confirmed premium keeps its usage'
);

-- ======== SC: live_sweep_clears_premium_snapshot (Ruling 6) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select public.start_session('a3700003-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.snapshot('a3700003-0000-0000-0000-000000000000', '00000008-0037-0037-0037-000000000000'),
  '(waiting_list,f,,)',
  'live_sweep: refunded waitlister is no longer premium'
);
select is(
  pg_temp.snapshot('a3700003-0000-0000-0000-000000000000', '00000007-0037-0037-0037-000000000000'),
  '(confirmed,t,e3700007-0000-0000-0000-000000000000,)',
  'live_sweep: confirmed premium snapshot kept'
);

-- The confirmed member cancels while live: the waitlister is promoted.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000007-0037-0037-0037-000000000000","role":"authenticated"}';
select public.cancel_registration('a3700003-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.snapshot('a3700003-0000-0000-0000-000000000000', '00000008-0037-0037-0037-000000000000'),
  '(confirmed,f,,)',
  'live_sweep: promoted while live as a non-premium row'
);
select is(
  pg_temp.usage_state('a3700003-0000-0000-0000-000000000000', '00000008-0037-0037-0037-000000000000'),
  'waitlist_at_start',
  'live_sweep: promotion does not consume a unit'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select (public.host_set_participant_status(
  (select id from public.participants
    where session_id = 'a3700003-0000-0000-0000-000000000000'
      and user_id = '00000008-0037-0037-0037-000000000000'),
  'cancelled')).status;
reset role;

select is(
  pg_temp.usage_state('a3700003-0000-0000-0000-000000000000', '00000008-0037-0037-0037-000000000000'),
  'waitlist_at_start',
  'live_sweep: a later host cancel does not refund again'
);
select is(
  (select count(*)::int from public.membership_usages
    where membership_id = 'e3700008-0000-0000-0000-000000000000' and refunded_at is null),
  0,
  'live_sweep: the waitlister''s membership has no unit in use'
);

-- ======== SD: host_add_participant_readd_is_non_premium ========

select is(
  pg_temp.usage_state('a3700004-0000-0000-0000-000000000000', '00000011-0037-0037-0037-000000000000'),
  'live',
  'host_readd: fixture -- late cancel kept the unit consumed'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select (public.host_add_participant('a3700004-0000-0000-0000-000000000000',
  '00000011-0037-0037-0037-000000000000', 'waiting_list')).status;
set local request.jwt.claims = '{"sub":"00000012-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700004-0000-0000-0000-000000000000') is not null as registered;
reset role;

select is(
  pg_temp.snapshot('a3700004-0000-0000-0000-000000000000', '00000011-0037-0037-0037-000000000000'),
  '(waiting_list,f,,)',
  'host_readd: re-added row has a cleared premium snapshot'
);
select is(
  pg_temp.waitlist_order('a3700004-0000-0000-0000-000000000000'),
  '00000012-0037-0037-0037-000000000000 00000011-0037-0037-0037-000000000000',
  'host_readd: a later premium waiter sorts ahead of the re-added row'
);
select is(
  pg_temp.position_of('a3700004-0000-0000-0000-000000000000', '00000011-0037-0037-0037-000000000000'),
  2,
  'host_readd: waitlist_position_of puts the re-added row second'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select (public.host_set_participant_status(
  (select id from public.participants
    where session_id = 'a3700004-0000-0000-0000-000000000000'
      and user_id = '00000011-0037-0037-0037-000000000000'),
  'cancelled')).status;
reset role;

select is(
  pg_temp.usage_state('a3700004-0000-0000-0000-000000000000', '00000011-0037-0037-0037-000000000000'),
  'live',
  'host_readd: a host cancel of the non-premium row does not refund the forfeited unit'
);

-- ======== SE: host_uncancel_is_non_premium ========

select is(
  pg_temp.usage_state('a3700005-0000-0000-0000-000000000000', '00000013-0037-0037-0037-000000000000'),
  'live',
  'host_uncancel: fixture -- late cancel kept the unit consumed'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select (public.host_set_participant_status(
  (select id from public.participants
    where session_id = 'a3700005-0000-0000-0000-000000000000'
      and user_id = '00000013-0037-0037-0037-000000000000'),
  'waiting_list')).status;
set local request.jwt.claims = '{"sub":"00000014-0037-0037-0037-000000000000","role":"authenticated"}';
select public.register_for_session('a3700005-0000-0000-0000-000000000000') is not null as registered;
reset role;

select is(
  pg_temp.snapshot('a3700005-0000-0000-0000-000000000000', '00000013-0037-0037-0037-000000000000'),
  '(waiting_list,f,,)',
  'host_uncancel: un-cancelled row has a cleared premium snapshot'
);
select is(
  pg_temp.waitlist_order('a3700005-0000-0000-0000-000000000000'),
  '00000014-0037-0037-0037-000000000000 00000013-0037-0037-0037-000000000000',
  'host_uncancel: a later premium waiter sorts ahead of the un-cancelled row'
);
select is(
  pg_temp.position_of('a3700005-0000-0000-0000-000000000000', '00000013-0037-0037-0037-000000000000'),
  2,
  'host_uncancel: waitlist_position_of puts the un-cancelled row second'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select (public.host_set_participant_status(
  (select id from public.participants
    where session_id = 'a3700005-0000-0000-0000-000000000000'
      and user_id = '00000013-0037-0037-0037-000000000000'),
  'cancelled')).status;
reset role;

select is(
  pg_temp.usage_state('a3700005-0000-0000-0000-000000000000', '00000013-0037-0037-0037-000000000000'),
  'live',
  'host_uncancel: a host cancel of the non-premium row does not refund the forfeited unit'
);

-- ======== SF: host_add_participant_keeps_active_premium_snapshot ========

select is(
  pg_temp.snapshot('a3700006-0000-0000-0000-000000000000', '00000015-0037-0037-0037-000000000000'),
  '(confirmed,t,e3700015-0000-0000-0000-000000000000,)',
  'host_readd_active: fixture -- confirmed premium'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0037-0037-0037-000000000000","role":"authenticated"}';
select (public.host_add_participant('a3700006-0000-0000-0000-000000000000',
  '00000015-0037-0037-0037-000000000000', 'confirmed')).status;
select (public.host_add_participant('a3700006-0000-0000-0000-000000000000',
  '00000016-0037-0037-0037-000000000000', 'waiting_list')).status;
reset role;

select is(
  pg_temp.snapshot('a3700006-0000-0000-0000-000000000000', '00000015-0037-0037-0037-000000000000'),
  '(confirmed,t,e3700015-0000-0000-0000-000000000000,)',
  'host_readd_active: confirmed premium row keeps its snapshot'
);
select is(
  pg_temp.snapshot('a3700006-0000-0000-0000-000000000000', '00000016-0037-0037-0037-000000000000'),
  '(waiting_list,t,e3700016-0000-0000-0000-000000000000,)',
  'host_readd_active: waiting_list premium row keeps its snapshot'
);

-- Waitlister cancels first (a confirmed cancel would promote it).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000016-0037-0037-0037-000000000000","role":"authenticated"}';
select public.cancel_registration('a3700006-0000-0000-0000-000000000000');
set local request.jwt.claims = '{"sub":"00000015-0037-0037-0037-000000000000","role":"authenticated"}';
select public.cancel_registration('a3700006-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3700006-0000-0000-0000-000000000000', '00000015-0037-0037-0037-000000000000'),
  'member_cancel_before_cutoff',
  'host_readd_active: cancel of the re-added confirmed premium row refunds the unit'
);
select is(
  pg_temp.usage_state('a3700006-0000-0000-0000-000000000000', '00000016-0037-0037-0037-000000000000'),
  'waitlist_cancel',
  'host_readd_active: cancel of the re-added waiting_list premium row refunds the unit'
);

select * from finish();
rollback;
