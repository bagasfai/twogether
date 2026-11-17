-- Covers migration 20261117000001_premium_handoff_unit.sql.
-- A unit that pays for a handed-over seat stays on the original member's row.
-- It must never back a second premium seat, and the live / completed waitlist
-- sweep must never refund it.

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

-- Users: 01 host; 02 premium owner R1; 03 target T1; 04 premium owner R2;
-- 05 target T2; 06 filler F.
insert into auth.users (id, email)
select ('000000' || lpad(n::text, 2, '0') || '-0055-0055-0055-000000000000')::uuid,
       'u' || n || '-055@test.local'
  from generate_series(1, 6) n;

update public.profiles set role = 'host'
 where id = '00000001-0055-0055-0055-000000000000';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   court_count, kind, coach_count, seats_per_coach, created_by, status, registration_state)
select s.id::uuid, 'S', now() + interval '3 days', now() + interval '3 days 2 hours', 'GOR',
       2, 3, 1, 'drilling', 1, 2,
       '00000001-0055-0055-0055-000000000000', 'scheduled', 'open'
  from (values
    ('a5500001-0000-0000-0000-000000000000'), -- S1 register, transfer, register, cancel, register
    ('a5500002-0000-0000-0000-000000000000')  -- S2 waitlisted after hand-off, then live
  ) as s(id);

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at)
select ('e55000' || lpad(n::text, 2, '0') || '-0000-0000-0000-000000000000')::uuid,
       ('000000' || lpad(n::text, 2, '0') || '-0055-0055-0055-000000000000')::uuid,
       0, 5, 30, now() - interval '1 day', now() + interval '29 days'
  from unnest(array[2, 4]) n;

-- S2: F fills one of the two seats.
insert into public.participants (session_id, user_id, status, registered_at) values
  ('a5500002-0000-0000-0000-000000000000', '00000006-0055-0055-0055-000000000000', 'confirmed', now() - interval '5 hours');

-- ======== one_unit_one_premium_seat (S1) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0055-0055-0055-000000000000","role":"authenticated"}';
select public.register_for_session('a5500001-0000-0000-0000-000000000000');
create temp table r1_row on commit drop as
  select id from public.participants
   where session_id = 'a5500001-0000-0000-0000-000000000000'
     and user_id = '00000002-0055-0055-0055-000000000000';
grant all on r1_row to public;
select public.transfer_participation((select id from r1_row), '00000003-0055-0055-0055-000000000000');
select public.register_for_session('a5500001-0000-0000-0000-000000000000');
select public.cancel_registration('a5500001-0000-0000-0000-000000000000');
select is(
  (public.register_for_session('a5500001-0000-0000-0000-000000000000')).status::text,
  'confirmed', 'one_unit_one_premium_seat: second re-registration confirmed');
reset role;

select is(
  (select (is_premium, membership_id is null)::text
     from public.participants where id = (select id from r1_row)),
  (false, true)::text,
  'one_unit_one_premium_seat: second re-registration is not premium');
select is(
  (select count(*)::int from public.membership_usages
    where membership_id = 'e5500002-0000-0000-0000-000000000000'),
  1, 'one_unit_one_premium_seat: one unit consumed');
select is(pg_temp.usage_state((select id from r1_row)), 'live',
  'one_unit_one_premium_seat: funding unit still live on the original row');
select is(
  (select (is_premium, status::text)::text from public.participants
    where session_id = 'a5500001-0000-0000-0000-000000000000'
      and user_id = '00000003-0055-0055-0055-000000000000'),
  (true, 'confirmed')::text,
  'one_unit_one_premium_seat: replacement keeps its premium seat');

-- ======== sweep_keeps_funding_unit (S2) ========

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000004-0055-0055-0055-000000000000","role":"authenticated"}';
select public.register_for_session('a5500002-0000-0000-0000-000000000000');
create temp table r2_row on commit drop as
  select id from public.participants
   where session_id = 'a5500002-0000-0000-0000-000000000000'
     and user_id = '00000004-0055-0055-0055-000000000000';
grant all on r2_row to public;
select public.transfer_participation((select id from r2_row), '00000005-0055-0055-0055-000000000000');
select is(
  (public.register_for_session('a5500002-0000-0000-0000-000000000000')).status::text,
  'waiting_list', 'sweep_keeps_funding_unit: re-registration on a full session is waitlisted');
reset role;

update public.sessions set status = 'live'
 where id = 'a5500002-0000-0000-0000-000000000000';

select is(pg_temp.usage_state((select id from r2_row)), 'live',
  'sweep_keeps_funding_unit: the live sweep does not refund the funding unit');
select is(
  (select (is_premium, status::text)::text from public.participants
    where session_id = 'a5500002-0000-0000-0000-000000000000'
      and user_id = '00000005-0055-0055-0055-000000000000'),
  (true, 'confirmed')::text,
  'sweep_keeps_funding_unit: replacement keeps its premium seat');

select * from finish();
rollback;
