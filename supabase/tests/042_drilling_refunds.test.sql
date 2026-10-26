-- Covers migration 20261028000003_drilling_refund_and_promotion.sql:
--   * a member cancel from confirmed never refunds on a drilling session, but
--     still refunds before the cutoff on open play;
--   * waitlist cancel, host cancel and session cancel still refund on drilling;
--   * a row with replaced_by set skips both the refund and the promotion.

begin;
select plan(8);

create function pg_temp.usage_state(p_participant uuid)
returns text
language sql
as $$
  select coalesce(string_agg(
           case when u.refunded_at is null then 'live'
                else coalesce(u.refund_reason, '<no reason>') end,
           ',' order by u.consumed_at, u.id), '')
    from public.membership_usages u
   where u.participant_id = p_participant;
$$;

insert into auth.users (id, email) values
  ('00000001-0042-0042-0042-000000000000', 'host-042@test.local'),
  ('00000002-0042-0042-0042-000000000000', 'p1-042@test.local'),
  ('00000003-0042-0042-0042-000000000000', 'p2-042@test.local'),
  ('00000004-0042-0042-0042-000000000000', 'p3-042@test.local'),
  ('00000005-0042-0042-0042-000000000000', 'p4-042@test.local'),
  ('00000006-0042-0042-0042-000000000000', 'p5-042@test.local'),
  ('00000007-0042-0042-0042-000000000000', 'w-042@test.local'),
  ('00000008-0042-0042-0042-000000000000', 'f1-042@test.local'),
  ('00000009-0042-0042-0042-000000000000', 'f2-042@test.local'),
  ('00000010-0042-0042-0042-000000000000', 'r-042@test.local');

update public.profiles set role = 'host'
 where id = '00000001-0042-0042-0042-000000000000';

-- Sessions: D = drilling (1 coach x 2 seats), O = open play (2 seats).
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   court_count, kind, coach_count, seats_per_coach, created_by, status, registration_state)
select s.id::uuid, 'S', now() + interval '3 days', now() + interval '3 days 2 hours', 'GOR',
       2, 3, 1, s.kind::public.session_kind, s.coaches, s.seats,
       '00000001-0042-0042-0042-000000000000', 'scheduled', 'open'
  from (values
    ('a4200001-0000-0000-0000-000000000000', 'drilling',  1, 2), -- member cancel
    ('a4200002-0000-0000-0000-000000000000', 'open_play', null::int, null::int), -- member cancel, open play
    ('a4200003-0000-0000-0000-000000000000', 'drilling',  1, 2), -- waitlist cancel
    ('a4200004-0000-0000-0000-000000000000', 'drilling',  1, 2), -- host cancel
    ('a4200005-0000-0000-0000-000000000000', 'drilling',  1, 2), -- session cancel
    ('a4200006-0000-0000-0000-000000000000', 'drilling',  1, 2)  -- replaced row
  ) as s(id, kind, coaches, seats);

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at)
select ('e42000' || lpad(n::text, 2, '0') || '-0000-0000-0000-000000000000')::uuid,
       ('000000' || lpad(n::text, 2, '0') || '-0042-0042-0042-000000000000')::uuid,
       0, 5, 30, now() - interval '1 day', now() + interval '29 days'
  from generate_series(2, 6) n;

-- One premium participant row + one live usage per session.
insert into public.participants (id, session_id, user_id, status, is_premium, membership_id, registered_at) values
  ('b4200001-0000-0000-0000-000000000000', 'a4200001-0000-0000-0000-000000000000', '00000002-0042-0042-0042-000000000000', 'confirmed', true, 'e4200002-0000-0000-0000-000000000000', now() - interval '2 hours'),
  ('b4200002-0000-0000-0000-000000000000', 'a4200002-0000-0000-0000-000000000000', '00000002-0042-0042-0042-000000000000', 'confirmed', true, 'e4200002-0000-0000-0000-000000000000', now() - interval '2 hours'),
  ('b4200004-0000-0000-0000-000000000000', 'a4200004-0000-0000-0000-000000000000', '00000004-0042-0042-0042-000000000000', 'confirmed', true, 'e4200004-0000-0000-0000-000000000000', now() - interval '2 hours'),
  ('b4200005-0000-0000-0000-000000000000', 'a4200005-0000-0000-0000-000000000000', '00000005-0042-0042-0042-000000000000', 'confirmed', true, 'e4200005-0000-0000-0000-000000000000', now() - interval '2 hours'),
  ('b4200006-0000-0000-0000-000000000000', 'a4200006-0000-0000-0000-000000000000', '00000006-0042-0042-0042-000000000000', 'confirmed', true, 'e4200006-0000-0000-0000-000000000000', now() - interval '2 hours');

-- Session 3: full with two fillers, premium member waiting.
insert into public.participants (id, session_id, user_id, status, is_premium, membership_id, registered_at) values
  ('b4200008-0000-0000-0000-000000000000', 'a4200003-0000-0000-0000-000000000000', '00000008-0042-0042-0042-000000000000', 'confirmed', false, null, now() - interval '3 hours'),
  ('b4200009-0000-0000-0000-000000000000', 'a4200003-0000-0000-0000-000000000000', '00000009-0042-0042-0042-000000000000', 'confirmed', false, null, now() - interval '3 hours'),
  ('b4200003-0000-0000-0000-000000000000', 'a4200003-0000-0000-0000-000000000000', '00000003-0042-0042-0042-000000000000', 'waiting_list', true, 'e4200003-0000-0000-0000-000000000000', now() - interval '1 hour');

-- Session 6: replacement R confirmed, waiter W waiting; P (premium, above)
-- was handed over to R.
insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4200010-0000-0000-0000-000000000000', 'a4200006-0000-0000-0000-000000000000', '00000010-0042-0042-0042-000000000000', 'confirmed', now() - interval '1 hour'),
  ('b4200007-0000-0000-0000-000000000000', 'a4200006-0000-0000-0000-000000000000', '00000007-0042-0042-0042-000000000000', 'waiting_list', now() - interval '30 minutes');
update public.participants
   set replaced_by = 'b4200010-0000-0000-0000-000000000000'
 where id = 'b4200006-0000-0000-0000-000000000000';

insert into public.membership_usages (membership_id, participant_id) values
  ('e4200002-0000-0000-0000-000000000000', 'b4200001-0000-0000-0000-000000000000'),
  ('e4200002-0000-0000-0000-000000000000', 'b4200002-0000-0000-0000-000000000000'),
  ('e4200003-0000-0000-0000-000000000000', 'b4200003-0000-0000-0000-000000000000'),
  ('e4200004-0000-0000-0000-000000000000', 'b4200004-0000-0000-0000-000000000000'),
  ('e4200005-0000-0000-0000-000000000000', 'b4200005-0000-0000-0000-000000000000'),
  ('e4200006-0000-0000-0000-000000000000', 'b4200006-0000-0000-0000-000000000000');

-- ======== member cancels (as the premium member) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0042-0042-0042-000000000000","role":"authenticated"}';
select public.cancel_registration('a4200001-0000-0000-0000-000000000000');
select public.cancel_registration('a4200002-0000-0000-0000-000000000000');
reset role;

select is(pg_temp.usage_state('b4200001-0000-0000-0000-000000000000'), 'live',
  'drilling_member_cancel_from_confirmed_never_refunds');
select is(pg_temp.usage_state('b4200002-0000-0000-0000-000000000000'), 'member_cancel_before_cutoff',
  'open_play_member_cancel_before_cutoff_still_refunds');

-- ======== waitlist cancel ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0042-0042-0042-000000000000","role":"authenticated"}';
select public.cancel_registration('a4200003-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.usage_state('b4200003-0000-0000-0000-000000000000'), 'waitlist_cancel',
  'drilling_waitlist_cancel_refunds');

-- ======== host cancel ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0042-0042-0042-000000000000","role":"authenticated"}';
select public.host_set_participant_status('b4200004-0000-0000-0000-000000000000', 'cancelled');
reset role;
select is(pg_temp.usage_state('b4200004-0000-0000-0000-000000000000'), 'host_cancel',
  'drilling_host_cancel_refunds');

-- ======== session cancel ========

update public.sessions set status = 'cancelled'
 where id = 'a4200005-0000-0000-0000-000000000000';
select isnt(pg_temp.usage_state('b4200005-0000-0000-0000-000000000000'), 'live',
  'drilling_session_cancel_refunds');

-- ======== replaced row ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0042-0042-0042-000000000000","role":"authenticated"}';
select public.host_set_participant_status('b4200006-0000-0000-0000-000000000000', 'cancelled');
reset role;
select is(pg_temp.usage_state('b4200006-0000-0000-0000-000000000000'), 'live',
  'replaced_row_skips_refund_and_promotion: usage stays consumed');
select is(
  (select status::text from public.participants where id = 'b4200007-0000-0000-0000-000000000000'),
  'waiting_list',
  'replaced_row_skips_refund_and_promotion: first waitlister stays waitlisted');
select is(
  (select status::text from public.participants where id = 'b4200006-0000-0000-0000-000000000000'),
  'cancelled',
  'replaced_row_skips_refund_and_promotion: old row is cancelled');

select * from finish();
rollback;
