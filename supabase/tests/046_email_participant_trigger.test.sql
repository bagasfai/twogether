begin;
select plan(19);

create function pg_temp.ob() returns text language sql as $$
  select coalesce(string_agg(type::text || ':' || user_id::text, ',' order by type::text, user_id::text), '')
    from public.email_outbox
$$;

insert into auth.users (id, email) values

  ('00000001-0046-0046-0046-000000000000', 'u1-046@test.local'),
  ('00000002-0046-0046-0046-000000000000', 'u2-046@test.local'),
  ('00000003-0046-0046-0046-000000000000', 'u3-046@test.local'),
  ('00000004-0046-0046-0046-000000000000', 'u4-046@test.local'),
  ('00000005-0046-0046-0046-000000000000', 'u5-046@test.local'),
  ('00000006-0046-0046-0046-000000000000', 'u6-046@test.local'),
  ('00000007-0046-0046-0046-000000000000', 'u7-046@test.local'),
  ('00000008-0046-0046-0046-000000000000', 'u8-046@test.local'),
  ('00000009-0046-0046-0046-000000000000', 'u9-046@test.local');


update public.profiles set role = 'host' where id = '00000001-0046-0046-0046-000000000000';

insert into public.memberships
  (id, user_id, price_idr, quota_total, duration_days, started_at, expires_at)
values
  ('e4600005-0000-0000-0000-000000000000', '00000005-0046-0046-0046-000000000000', 0, 5, 30,
   now() - interval '1 day', now() + interval '29 days');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
select s.id::uuid, 'S046', now() + interval '3 days', now() + interval '3 days 2 hours',
       'GOR', s.max_p, s.cap, '00000001-0046-0046-0046-000000000000', s.st::public.session_status, 'open'
  from (values
    ('a4600001-0000-0000-0000-000000000000', 1, 5, 'scheduled'),
    ('a4600002-0000-0000-0000-000000000000', 1, 3, 'scheduled'),
    ('a4600003-0000-0000-0000-000000000000', 1, 3, 'scheduled'),
    ('a4600004-0000-0000-0000-000000000000', 1, 3, 'scheduled'),
    ('a4600005-0000-0000-0000-000000000000', 4, 3, 'scheduled'),
    ('a4600006-0000-0000-0000-000000000000', 4, 3, 'draft'),
    ('a4600007-0000-0000-0000-000000000000', 4, 3, 'live'),
    ('a4600008-0000-0000-0000-000000000000', 4, 3, 'scheduled')
  ) as s(id, max_p, cap, st);

insert into public.participants (id, session_id, user_id, status, registered_at) values
  ('b4602001-0000-0000-0000-000000000000', 'a4600002-0000-0000-0000-000000000000', '00000007-0046-0046-0046-000000000000', 'confirmed', now() - interval '2 hours'),
  ('b4602002-0000-0000-0000-000000000000', 'a4600002-0000-0000-0000-000000000000', '00000008-0046-0046-0046-000000000000', 'waiting_list', now() - interval '1 hour'),
  ('b4603001-0000-0000-0000-000000000000', 'a4600003-0000-0000-0000-000000000000', '00000006-0046-0046-0046-000000000000', 'confirmed', now() - interval '2 hours'),
  ('b4607001-0000-0000-0000-000000000000', 'a4600007-0000-0000-0000-000000000000', '00000002-0046-0046-0046-000000000000', 'confirmed', now() - interval '2 hours'),
  ('b4608001-0000-0000-0000-000000000000', 'a4600008-0000-0000-0000-000000000000', '00000002-0046-0046-0046-000000000000', 'confirmed', now() - interval '2 hours');

insert into public.participants (id, session_id, user_id, guest_name, registered_by, status, registered_at)
values ('b4604001-0000-0000-0000-000000000000', 'a4600004-0000-0000-0000-000000000000', null, 'Guest Four', '00000001-0046-0046-0046-000000000000', 'confirmed', now() - interval '2 hours');

delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0046-0046-0046-000000000000","role":"authenticated"}';
select public.register_for_session('a4600001-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_confirmed:00000002-0046-0046-0046-000000000000', 'register_confirmed');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0046-0046-0046-000000000000","role":"authenticated"}';
select public.register_for_session('a4600001-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_waitlisted:00000003-0046-0046-0046-000000000000', 'register_waitlisted');
select is((select payload->>'waitlist_position' from public.email_outbox where type = 'registration_waitlisted'), '1', 'register_waitlisted: waitlist_position');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000004-0046-0046-0046-000000000000","role":"authenticated"}';
select public.register_for_session('a4600001-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_waitlisted:00000004-0046-0046-0046-000000000000', 'second_waitlister_position');
select is((select payload->>'waitlist_position' from public.email_outbox where type = 'registration_waitlisted'), '2', 'second_waitlister_position: waitlist_position');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0046-0046-0046-000000000000","role":"authenticated"}';
select public.cancel_registration('a4600001-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_cancelled:00000002-0046-0046-0046-000000000000,waitlist_promoted:00000003-0046-0046-0046-000000000000', 'cancel_promotes');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0046-0046-0046-000000000000","role":"authenticated"}';
select public.register_for_session('a4600001-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_waitlisted:00000002-0046-0046-0046-000000000000', 'reregister_after_cancel');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0046-0046-0046-000000000000","role":"authenticated"}';
select public.host_set_participant_status((select id from public.participants where session_id = 'a4600001-0000-0000-0000-000000000000' and user_id = '00000004-0046-0046-0046-000000000000'), 'confirmed');
reset role;
select is(pg_temp.ob(), 'waitlist_promoted:00000004-0046-0046-0046-000000000000', 'host_promotes');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0046-0046-0046-000000000000","role":"authenticated"}';
select public.host_set_participant_status((select id from public.participants where session_id = 'a4600001-0000-0000-0000-000000000000' and user_id = '00000004-0046-0046-0046-000000000000'), 'waiting_list');
reset role;
select is(pg_temp.ob(), 'registration_waitlisted:00000004-0046-0046-0046-000000000000', 'host_demotes');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000005-0046-0046-0046-000000000000","role":"authenticated"}';
select public.register_for_session('a4600003-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'bumped:00000006-0046-0046-0046-000000000000,registration_confirmed:00000005-0046-0046-0046-000000000000', 'premium_bump');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000005-0046-0046-0046-000000000000","role":"authenticated"}';
select public.register_for_session('a4600004-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_confirmed:00000005-0046-0046-0046-000000000000', 'guest_bump_no_email');
select is((select status::text from public.participants where id = 'b4604001-0000-0000-0000-000000000000'), 'waiting_list', 'guest_bump_no_email: guest row was bumped');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0046-0046-0046-000000000000","role":"authenticated"}';
select public.register_guest_for_session('a4600005-0000-0000-0000-000000000000', 'Guest Five', null);
reset role;
select is(pg_temp.ob(), '', 'guest_register_no_email');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0046-0046-0046-000000000000","role":"authenticated"}';
select public.host_add_participant('a4600006-0000-0000-0000-000000000000', '00000003-0046-0046-0046-000000000000', 'confirmed');
reset role;
select is(pg_temp.ob(), '', 'draft_session_no_email');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0046-0046-0046-000000000000","role":"authenticated"}';
select public.cancel_registration('a4600007-0000-0000-0000-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_cancelled:00000002-0046-0046-0046-000000000000', 'live_session_emails');


delete from public.email_outbox;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0046-0046-0046-000000000000","role":"authenticated"}';
select public.transfer_participation('b4608001-0000-0000-0000-000000000000', '00000009-0046-0046-0046-000000000000');
reset role;
select is(pg_temp.ob(), 'registration_cancelled:00000002-0046-0046-0046-000000000000,registration_confirmed:00000009-0046-0046-0046-000000000000', 'transfer_emails_both');


delete from public.email_outbox;
delete from public.participants where id = 'b4602001-0000-0000-0000-000000000000';
select is(pg_temp.ob(), 'waitlist_promoted:00000008-0046-0046-0046-000000000000', 'hard_delete_no_email_but_promotes');

select hasnt_table('public', 'bump_notifications', 'bump_notifications is gone');
select ok(not has_function_privilege('authenticated', 'public.queue_participant_email()', 'execute'),
  'authenticated cannot execute queue_participant_email');

select * from finish();
rollback;
