-- Covers migration 20261023000005_premium_refunds.sql: quota refunds on a
-- participant cancel (member before cutoff, waitlist, host override), on a
-- session going live (waitlisted premium only) and on a cancelled session.
--
-- Time is deterministic: now() is the transaction start time, stable for the
-- whole pgTAP transaction, and the trigger compares against the same now().
-- So starts_at = now() + 24h puts the cancel exactly at the 24h cutoff, and
-- starts_at = now() + 24h - 1s puts it one second after the cutoff.
--
-- Setup runs as the superuser; RPC calls switch to `authenticated` with a
-- JWT, and assertions `reset role` first so RLS does not hide rows.

begin;
select plan(28);

-- Usage state of one participant row: 'live' or its refund_reason, one entry
-- per usage row, oldest first. '' means no usage row at all.
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

insert into auth.users (id, email) values
  ('00000001-0034-0034-0034-000000000000', 'host-034@test.local'),
  ('00000002-0034-0034-0034-000000000000', 'before-034@test.local'),
  ('00000003-0034-0034-0034-000000000000', 'at-034@test.local'),
  ('00000004-0034-0034-0034-000000000000', 'after-034@test.local'),
  ('00000005-0034-0034-0034-000000000000', 'live-034@test.local'),
  ('00000006-0034-0034-0034-000000000000', 'wait-034@test.local'),
  ('00000007-0034-0034-0034-000000000000', 'hostcancel-034@test.local'),
  ('00000009-0034-0034-0034-000000000000', 'sc-confirmed-034@test.local'),
  ('00000010-0034-0034-0034-000000000000', 'sc-waiting-034@test.local'),
  ('00000011-0034-0034-0034-000000000000', 'sc-late-034@test.local'),
  ('00000012-0034-0034-0034-000000000000', 'sc-refunded-034@test.local'),
  ('00000013-0034-0034-0034-000000000000', 'blocker-034@test.local'),
  ('00000014-0034-0034-0034-000000000000', 'ss-confirmed-034@test.local'),
  ('00000015-0034-0034-0034-000000000000', 'ss-waiting-034@test.local'),
  ('00000016-0034-0034-0034-000000000000', 'ss-plain-034@test.local'),
  ('00000017-0034-0034-0034-000000000000', 'noshow-034@test.local'),
  ('00000018-0034-0034-0034-000000000000', 'plain-034@test.local'),
  ('00000019-0034-0034-0034-000000000000', 'stale-034@test.local'),
  ('00000020-0034-0034-0034-000000000000', 'quota-034@test.local'),
  ('00000021-0034-0034-0034-000000000000', 'snapshot-034@test.local');

update public.profiles set role = 'host'
 where id = '00000001-0034-0034-0034-000000000000';

-- (id, starts_at, max_participants, waitlist_capacity); all scheduled + open,
-- all created by the host (sessions_add_owner makes them session owner).
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
select s.id::uuid, 'S', s.starts, s.starts + interval '2 hours', 'GOR',
       s.max_p, s.cap, '00000001-0034-0034-0034-000000000000', 'scheduled', 'open'
  from (values
    ('a3400001-0000-0000-0000-000000000000', now() + interval '3 days', 4, 2),                         -- S1 before cutoff
    ('a3400002-0000-0000-0000-000000000000', now() + interval '24 hours', 4, 2),                       -- S2 exactly at cutoff
    ('a3400003-0000-0000-0000-000000000000', now() + interval '24 hours' - interval '1 second', 4, 2), -- S3 one second after
    ('a3400004-0000-0000-0000-000000000000', now() + interval '3 days', 4, 2),                         -- S4 cancel after live
    ('a3400005-0000-0000-0000-000000000000', now() + interval '1 hour', 1, 2),                         -- S5 waitlist cancel
    ('a3400006-0000-0000-0000-000000000000', now() + interval '1 hour', 4, 2),                         -- S6 host cancel
    ('a3400007-0000-0000-0000-000000000000', now() + interval '3 days', 1, 2),                         -- S7 session cancelled
    ('a3400008-0000-0000-0000-000000000000', now() + interval '3 days', 1, 2),                         -- S8 session start
    ('a3400009-0000-0000-0000-000000000000', now() + interval '3 days', 4, 2),                         -- S9 no-show
    ('a3400010-0000-0000-0000-000000000000', now() + interval '3 days', 4, 2),                         -- S10 non-premium
    ('a3400011-0000-0000-0000-000000000000', now() + interval '3 days', 4, 2),                         -- S11 quota restore
    ('a3400012-0000-0000-0000-000000000000', now() + interval '30 hours', 4, 2)                        -- S12 cutoff snapshot
  ) as s(id, starts, max_p, cap);

-- Live memberships, default refund_cutoff_hours = 24. User 20 has a single
-- unit; user 21's membership snapshots a 48h cutoff.
insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, refund_cutoff_hours, started_at, expires_at)
select m.id::uuid, m.uid::uuid, 0, m.quota, 30, m.cutoff,
       now() - interval '1 day', now() + interval '29 days'
  from (values
    ('e3400001-0000-0000-0000-000000000000', '00000001-0034-0034-0034-000000000000', 5, 24),
    ('e3400002-0000-0000-0000-000000000000', '00000002-0034-0034-0034-000000000000', 5, 24),
    ('e3400003-0000-0000-0000-000000000000', '00000003-0034-0034-0034-000000000000', 5, 24),
    ('e3400004-0000-0000-0000-000000000000', '00000004-0034-0034-0034-000000000000', 5, 24),
    ('e3400005-0000-0000-0000-000000000000', '00000005-0034-0034-0034-000000000000', 5, 24),
    ('e3400006-0000-0000-0000-000000000000', '00000006-0034-0034-0034-000000000000', 5, 24),
    ('e3400007-0000-0000-0000-000000000000', '00000007-0034-0034-0034-000000000000', 5, 24),
    ('e3400009-0000-0000-0000-000000000000', '00000009-0034-0034-0034-000000000000', 5, 24),
    ('e3400010-0000-0000-0000-000000000000', '00000010-0034-0034-0034-000000000000', 5, 24),
    ('e3400011-0000-0000-0000-000000000000', '00000011-0034-0034-0034-000000000000', 5, 24),
    ('e3400012-0000-0000-0000-000000000000', '00000012-0034-0034-0034-000000000000', 5, 24),
    ('e3400014-0000-0000-0000-000000000000', '00000014-0034-0034-0034-000000000000', 5, 24),
    ('e3400015-0000-0000-0000-000000000000', '00000015-0034-0034-0034-000000000000', 5, 24),
    ('e3400017-0000-0000-0000-000000000000', '00000017-0034-0034-0034-000000000000', 5, 24),
    ('e3400019-0000-0000-0000-000000000000', '00000019-0034-0034-0034-000000000000', 5, 24),
    ('e3400020-0000-0000-0000-000000000000', '00000020-0034-0034-0034-000000000000', 1, 24),
    ('e3400021-0000-0000-0000-000000000000', '00000021-0034-0034-0034-000000000000', 5, 48)
  ) as m(id, uid, quota, cutoff);

-- S5: the only seat is held by a premium participant, so a premium
-- registrant cannot bump and joins the waitlist.
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at)
values ('b3450013-0000-0000-0000-000000000000', 'a3400005-0000-0000-0000-000000000000',
        '00000013-0034-0034-0034-000000000000', 'confirmed', true, now() - interval '1 day');

-- S7 extras: a late-cancelled premium row whose usage stayed live, and a
-- row whose usage was already refunded an hour ago.
insert into public.participants
  (id, session_id, user_id, status, is_premium, membership_id, registered_at, cancelled_at)
values
  ('b3470011-0000-0000-0000-000000000000', 'a3400007-0000-0000-0000-000000000000',
   '00000011-0034-0034-0034-000000000000', 'cancelled', true,
   'e3400011-0000-0000-0000-000000000000', now() - interval '2 days', now() - interval '1 hour'),
  ('b3470012-0000-0000-0000-000000000000', 'a3400007-0000-0000-0000-000000000000',
   '00000012-0034-0034-0034-000000000000', 'cancelled', true,
   'e3400012-0000-0000-0000-000000000000', now() - interval '2 days', now() - interval '1 hour');
insert into public.membership_usages
  (membership_id, participant_id, consumed_at, refunded_at, refund_reason)
values
  ('e3400011-0000-0000-0000-000000000000', 'b3470011-0000-0000-0000-000000000000',
   now() - interval '2 days', null, null),
  ('e3400012-0000-0000-0000-000000000000', 'b3470012-0000-0000-0000-000000000000',
   now() - interval '2 days', now() - interval '1 hour', 'member_cancel_before_cutoff');

-- S10: a non-premium row still carrying a live usage (forfeited by an
-- earlier late cancel, then re-registered without premium).
insert into public.participants (id, session_id, user_id, status, is_premium, registered_at)
values ('b3500019-0000-0000-0000-000000000000', 'a3400010-0000-0000-0000-000000000000',
        '00000019-0034-0034-0034-000000000000', 'confirmed', false, now() - interval '1 day');
insert into public.membership_usages (membership_id, participant_id, consumed_at)
values ('e3400019-0000-0000-0000-000000000000', 'b3500019-0000-0000-0000-000000000000',
        now() - interval '2 days');

-- ---- premium registrations (each consumes one unit) ----

set local role authenticated;

set local request.jwt.claims = '{"sub":"00000002-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400001-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000003-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400002-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000004-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400003-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000005-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400004-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000006-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400005-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000007-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400006-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000001-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400006-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000009-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400007-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000010-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400007-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000014-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400008-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000015-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400008-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000016-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400008-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000017-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400009-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000018-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400010-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000020-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400011-0000-0000-0000-000000000000') is not null as registered;
set local request.jwt.claims = '{"sub":"00000021-0034-0034-0034-000000000000","role":"authenticated"}';
select public.register_for_session('a3400012-0000-0000-0000-000000000000') is not null as registered;

reset role;

-- Sanity: the fixtures are what the tests below assume.
select is(
  (select string_agg(p.user_id::text || ':' || p.status::text || ':' || p.is_premium::text, ' '
                     order by p.user_id)
     from public.participants p
    where p.session_id in ('a3400005-0000-0000-0000-000000000000',
                           'a3400007-0000-0000-0000-000000000000',
                           'a3400008-0000-0000-0000-000000000000')
      and p.status <> 'cancelled'),
  '00000006-0034-0034-0034-000000000000:waiting_list:true '
  || '00000009-0034-0034-0034-000000000000:confirmed:true '
  || '00000010-0034-0034-0034-000000000000:waiting_list:true '
  || '00000013-0034-0034-0034-000000000000:confirmed:true '
  || '00000014-0034-0034-0034-000000000000:confirmed:true '
  || '00000015-0034-0034-0034-000000000000:waiting_list:true '
  || '00000016-0034-0034-0034-000000000000:waiting_list:false',
  'fixtures: premium waiters cannot bump a premium seat holder'
);

-- ======== member_cancel_before_cutoff_refunds ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400001-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3400001-0000-0000-0000-000000000000', '00000002-0034-0034-0034-000000000000'),
  'member_cancel_before_cutoff',
  'member_cancel_before_cutoff_refunds: usage refunded with reason'
);
select is(
  (select u.refunded_at from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id = 'a3400001-0000-0000-0000-000000000000'
      and p.user_id = '00000002-0034-0034-0034-000000000000'),
  now(),
  'member_cancel_before_cutoff_refunds: refunded_at is now()'
);

-- ======== member_cancel_exactly_at_cutoff_refunds ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400002-0000-0000-0000-000000000000');
reset role;

select is(
  (select starts_at - interval '24 hours' from public.sessions
    where id = 'a3400002-0000-0000-0000-000000000000'),
  now(),
  'member_cancel_exactly_at_cutoff_refunds: fixture cutoff is exactly now()'
);
select is(
  pg_temp.usage_state('a3400002-0000-0000-0000-000000000000', '00000003-0034-0034-0034-000000000000'),
  'member_cancel_before_cutoff',
  'member_cancel_exactly_at_cutoff_refunds: refunded'
);

-- ======== member_cancel_one_second_after_cutoff_does_not_refund ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000004-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400003-0000-0000-0000-000000000000');
reset role;

select is(
  (select status::text from public.participants
    where session_id = 'a3400003-0000-0000-0000-000000000000'
      and user_id = '00000004-0034-0034-0034-000000000000'),
  'cancelled',
  'member_cancel_one_second_after_cutoff_does_not_refund: participant is cancelled'
);
select is(
  pg_temp.usage_state('a3400003-0000-0000-0000-000000000000', '00000004-0034-0034-0034-000000000000'),
  'live',
  'member_cancel_one_second_after_cutoff_does_not_refund: usage stays consumed'
);

-- ======== member_cancel_uses_membership_cutoff_snapshot ========
-- The cutoff is the membership's snapshot (48h here), not the 24h default:
-- 30h before the session is inside a 48h cutoff.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000021-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400012-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3400012-0000-0000-0000-000000000000', '00000021-0034-0034-0034-000000000000'),
  'live',
  'member_cancel_uses_membership_cutoff_snapshot: 48h snapshot blocks a refund 30h out'
);

-- ======== member_cancel_after_session_live_does_not_refund ========
-- S4 starts in 3 days (well before any cutoff) but the host started it early.

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0034-0034-0034-000000000000","role":"authenticated"}';
select public.start_session('a3400004-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3400004-0000-0000-0000-000000000000', '00000005-0034-0034-0034-000000000000'),
  'live',
  'member_cancel_after_session_live_does_not_refund: confirmed usage kept at start'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000005-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400004-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3400004-0000-0000-0000-000000000000', '00000005-0034-0034-0034-000000000000'),
  'live',
  'member_cancel_after_session_live_does_not_refund: no refund'
);

-- ======== waitlist_cancel_always_refunds ========
-- S5 starts in 1 hour: past the 24h cutoff, yet a waitlist cancel refunds.

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000006-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400005-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3400005-0000-0000-0000-000000000000', '00000006-0034-0034-0034-000000000000'),
  'waitlist_cancel',
  'waitlist_cancel_always_refunds: refunded past the cutoff'
);

-- ======== host_cancel_always_refunds ========
-- S6 starts in 1 hour: past the cutoff for a member cancel.

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0034-0034-0034-000000000000","role":"authenticated"}';
select (public.host_set_participant_status(
  (select id from public.participants
    where session_id = 'a3400006-0000-0000-0000-000000000000'
      and user_id = '00000007-0034-0034-0034-000000000000'),
  'cancelled')).status;
reset role;

select is(
  pg_temp.usage_state('a3400006-0000-0000-0000-000000000000', '00000007-0034-0034-0034-000000000000'),
  'host_cancel',
  'host_cancel_always_refunds: host override refunds past the cutoff'
);

-- A host cancelling their OWN registration is a member cancel, not a host
-- override: past the cutoff it does not refund.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0034-0034-0034-000000000000","role":"authenticated"}';
select (public.host_set_participant_status(
  (select id from public.participants
    where session_id = 'a3400006-0000-0000-0000-000000000000'
      and user_id = '00000001-0034-0034-0034-000000000000'),
  'cancelled')).status;
reset role;

select is(
  pg_temp.usage_state('a3400006-0000-0000-0000-000000000000', '00000001-0034-0034-0034-000000000000'),
  'live',
  'host_cancel_always_refunds: a host cancelling themself follows the member rule'
);

-- ======== session_cancelled_refunds_all_open_usages ========

update public.sessions set status = 'cancelled'
 where id = 'a3400007-0000-0000-0000-000000000000';

select is(
  pg_temp.usage_state('a3400007-0000-0000-0000-000000000000', '00000009-0034-0034-0034-000000000000'),
  'session_cancelled',
  'session_cancelled_refunds_all_open_usages: confirmed refunded'
);
select is(
  pg_temp.usage_state('a3400007-0000-0000-0000-000000000000', '00000010-0034-0034-0034-000000000000'),
  'session_cancelled',
  'session_cancelled_refunds_all_open_usages: waitlisted refunded'
);
select is(
  pg_temp.usage_state('a3400007-0000-0000-0000-000000000000', '00000011-0034-0034-0034-000000000000'),
  'session_cancelled',
  'session_cancelled_refunds_all_open_usages: late-cancelled live usage refunded'
);
select is(
  (select (u.refunded_at, u.refund_reason)::text from public.membership_usages u
    where u.participant_id = 'b3470012-0000-0000-0000-000000000000'),
  (now() - interval '1 hour', 'member_cancel_before_cutoff')::text,
  'session_cancelled_refunds_all_open_usages: an already refunded usage is untouched'
);
select is(
  (select count(*)::int from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where p.session_id <> 'a3400007-0000-0000-0000-000000000000'
      and u.refund_reason = 'session_cancelled'),
  0,
  'session_cancelled_refunds_all_open_usages: other sessions untouched'
);

-- ======== session_start_refunds_waitlisted_premium_only ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0034-0034-0034-000000000000","role":"authenticated"}';
select public.start_session('a3400008-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3400008-0000-0000-0000-000000000000', '00000014-0034-0034-0034-000000000000'),
  'live',
  'session_start_refunds_waitlisted_premium_only: confirmed premium keeps usage'
);
select is(
  pg_temp.usage_state('a3400008-0000-0000-0000-000000000000', '00000015-0034-0034-0034-000000000000'),
  'waitlist_at_start',
  'session_start_refunds_waitlisted_premium_only: waitlisted premium refunded'
);
select is(
  pg_temp.usage_state('a3400008-0000-0000-0000-000000000000', '00000016-0034-0034-0034-000000000000'),
  '',
  'session_start_refunds_waitlisted_premium_only: non-premium waiter has no usage'
);

-- ======== no_show_keeps_usage_consumed ========

update public.sessions set status = 'completed'
 where id = 'a3400009-0000-0000-0000-000000000000';
update public.participants set no_show_at = now()
 where session_id = 'a3400009-0000-0000-0000-000000000000'
   and user_id = '00000017-0034-0034-0034-000000000000';

select is(
  pg_temp.usage_state('a3400009-0000-0000-0000-000000000000', '00000017-0034-0034-0034-000000000000'),
  'live',
  'no_show_keeps_usage_consumed: usage still consumed'
);

-- ======== non_premium_cancel_is_a_noop ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000018-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400010-0000-0000-0000-000000000000');
set local request.jwt.claims = '{"sub":"00000019-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400010-0000-0000-0000-000000000000');
reset role;

select is(
  pg_temp.usage_state('a3400010-0000-0000-0000-000000000000', '00000018-0034-0034-0034-000000000000'),
  '',
  'non_premium_cancel_is_a_noop: no usage created or touched'
);
select is(
  pg_temp.usage_state('a3400010-0000-0000-0000-000000000000', '00000019-0034-0034-0034-000000000000'),
  'live',
  'non_premium_cancel_is_a_noop: a stale live usage on a non-premium row is not refunded'
);

-- ======== refund_restores_quota_left ========

select is(
  public.membership_quota_left('e3400020-0000-0000-0000-000000000000'),
  0,
  'refund_restores_quota_left: single unit consumed'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000020-0034-0034-0034-000000000000","role":"authenticated"}';
select public.cancel_registration('a3400011-0000-0000-0000-000000000000');
reset role;

select is(
  public.membership_quota_left('e3400020-0000-0000-0000-000000000000'),
  1,
  'refund_restores_quota_left: unit back after a refunded cancel'
);

-- ---- trigger functions are internal ----

select ok(
  not has_function_privilege('authenticated', 'public.refund_usage_on_cancel()', 'execute')
  and not has_function_privilege('anon', 'public.refund_usage_on_cancel()', 'execute'),
  'refund_usage_on_cancel is not executable by clients'
);
select ok(
  not has_function_privilege('authenticated', 'public.refund_usages_on_session_change()', 'execute')
  and not has_function_privilege('anon', 'public.refund_usages_on_session_change()', 'execute'),
  'refund_usages_on_session_change is not executable by clients'
);

select * from finish();
rollback;
