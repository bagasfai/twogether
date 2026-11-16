begin;
select plan(19);

create function pg_temp.ob() returns text language sql as $$
  select coalesce(string_agg(type::text || ':' || user_id::text, ',' order by type::text, user_id::text), '')
    from public.email_outbox
$$;

create function pg_temp.tomorrow_10() returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '1 day 10 hours') at time zone 'Asia/Jakarta'
$$;

insert into auth.users (id, email) values
  ('00000001-0047-0047-0047-000000000000', 'u1-047@test.local'),
  ('00000002-0047-0047-0047-000000000000', 'u2-047@test.local'),
  ('00000003-0047-0047-0047-000000000000', 'u3-047@test.local'),
  ('00000004-0047-0047-0047-000000000000', 'u4-047@test.local'),
  ('00000005-0047-0047-0047-000000000000', 'u5-047@test.local');

update public.profiles set role = 'host' where id = '00000001-0047-0047-0047-000000000000';
update public.profiles set email_reminders = false where id = '00000003-0047-0047-0047-000000000000';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
select s.id::uuid, 'S047', now() + interval '3 days', now() + interval '3 days 2 hours',
       'GOR', 2, 3, '00000001-0047-0047-0047-000000000000', s.st::public.session_status, 'open'
  from (values
    ('a4700001-0000-0000-0000-000000000000', 'scheduled'),
    ('a4700002-0000-0000-0000-000000000000', 'scheduled'),
    ('a4700003-0000-0000-0000-000000000000', 'scheduled'),
    ('a4700004-0000-0000-0000-000000000000', 'scheduled'),
    ('a4700005-0000-0000-0000-000000000000', 'draft'),
    ('a4700006-0000-0000-0000-000000000000', 'draft'),
    ('a4700007-0000-0000-0000-000000000000', 'live'),
    ('a4700008-0000-0000-0000-000000000000', 'draft')
  ) as s(id, st);

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
select s.id::uuid, 'R047', s.starts, s.starts + interval '2 hours',
       'GOR', 5, 3, '00000001-0047-0047-0047-000000000000', s.st::public.session_status, 'open'
  from (values
    ('a4700011-0000-0000-0000-000000000000', pg_temp.tomorrow_10(), 'scheduled'),
    ('a4700012-0000-0000-0000-000000000000',
      (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '1 hour') at time zone 'Asia/Jakarta', 'scheduled'),
    ('a4700013-0000-0000-0000-000000000000', pg_temp.tomorrow_10() + interval '1 day', 'scheduled'),
    ('a4700014-0000-0000-0000-000000000000', pg_temp.tomorrow_10(), 'draft')
  ) as s(id, starts, st);

insert into public.participants (session_id, user_id, status, registered_at)
select s.id, u.uid::uuid, u.st::public.participant_status, now() - interval '2 hours'
  from public.sessions s
  cross join (values
    ('00000002-0047-0047-0047-000000000000', 'confirmed'),
    ('00000003-0047-0047-0047-000000000000', 'confirmed'),
    ('00000004-0047-0047-0047-000000000000', 'waiting_list'),
    ('00000005-0047-0047-0047-000000000000', 'cancelled')
  ) as u(uid, st)
 where s.title in ('S047', 'R047');

insert into public.participants (session_id, user_id, guest_name, registered_by, status, registered_at)
select s.id, null, 'Guest', '00000001-0047-0047-0047-000000000000', 'confirmed', now() - interval '2 hours'
  from public.sessions s
 where s.title in ('S047', 'R047');

delete from public.email_outbox;
update public.sessions set status = 'cancelled' where id = 'a4700001-0000-0000-0000-000000000000';
select is(pg_temp.ob(),
  'session_cancelled:00000002-0047-0047-0047-000000000000,session_cancelled:00000003-0047-0047-0047-000000000000,session_cancelled:00000004-0047-0047-0047-000000000000',
  'cancel_notifies_active');

delete from public.email_outbox;
update public.sessions
   set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour'
 where id = 'a4700002-0000-0000-0000-000000000000';
select is(pg_temp.ob(),
  'session_changed:00000002-0047-0047-0047-000000000000,session_changed:00000003-0047-0047-0047-000000000000,session_changed:00000004-0047-0047-0047-000000000000',
  'change_time_notifies');
select is((select count(*)::int from public.email_outbox
            where payload->>'old_location' = 'GOR'
              and (payload->>'old_starts_at')::timestamptz = (select starts_at - interval '1 hour' from public.sessions where id = 'a4700002-0000-0000-0000-000000000000')
              and (payload->>'old_ends_at')::timestamptz = (select ends_at - interval '1 hour' from public.sessions where id = 'a4700002-0000-0000-0000-000000000000')),
  3, 'change_time_notifies: payload holds the old values');

delete from public.email_outbox;
update public.sessions set location = 'Hall B' where id = 'a4700003-0000-0000-0000-000000000000';
select is(pg_temp.ob(),
  'session_changed:00000002-0047-0047-0047-000000000000,session_changed:00000003-0047-0047-0047-000000000000,session_changed:00000004-0047-0047-0047-000000000000',
  'change_location_notifies');
select is((select string_agg(distinct payload->>'old_location', ',') from public.email_outbox),
  'GOR', 'change_location_notifies: old_location');

delete from public.email_outbox;
update public.sessions set title = 'S047 renamed', description = 'new text', max_participants = 3
 where id = 'a4700004-0000-0000-0000-000000000000';
select is(pg_temp.ob(), '', 'title_only_no_email');
select is((select max_participants from public.sessions where id = 'a4700004-0000-0000-0000-000000000000'), 3,
  'title_only_no_email: capacity changed');
select is((select count(*)::int from public.participants
            where session_id = 'a4700004-0000-0000-0000-000000000000' and status = 'confirmed'), 3,
  'title_only_no_email: nobody was promoted by the capacity change');

delete from public.email_outbox;
update public.sessions set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour'
 where id = 'a4700005-0000-0000-0000-000000000000';
select is(pg_temp.ob(), '', 'draft_change_no_email');

delete from public.email_outbox;
update public.sessions set status = 'cancelled' where id = 'a4700006-0000-0000-0000-000000000000';
select is(pg_temp.ob(), '', 'draft_cancel_no_email');

delete from public.email_outbox;
update public.sessions set status = 'cancelled' where id = 'a4700007-0000-0000-0000-000000000000';
select is(pg_temp.ob(),
  'session_cancelled:00000002-0047-0047-0047-000000000000,session_cancelled:00000003-0047-0047-0047-000000000000,session_cancelled:00000004-0047-0047-0047-000000000000',
  'live_cancel_notifies');

delete from public.email_outbox;
update public.sessions set status = 'scheduled' where id = 'a4700008-0000-0000-0000-000000000000';
select is(pg_temp.ob(), '', 'publish_no_email');

delete from public.email_outbox;
select is(public.queue_session_reminders(), 1, 'one reminder queued');
select is((select user_id from public.email_outbox where type = 'session_reminder'),
  '00000002-0047-0047-0047-000000000000'::uuid, 'only confirmed opted-in member');
select is((select dedupe_key from public.email_outbox where type = 'session_reminder'),
  'reminder:a4700011-0000-0000-0000-000000000000:00000002-0047-0047-0047-000000000000', 'dedupe key shape');
select is(public.queue_session_reminders(), 0, 'second run queues nothing');
select ok(not has_function_privilege('authenticated', 'public.queue_session_reminders()', 'execute'),
  'members cannot queue reminders');
select ok(has_function_privilege('service_role', 'public.queue_session_reminders()', 'execute'),
  'service role can queue reminders');
select ok(not has_function_privilege('authenticated', 'public.queue_session_email()', 'execute'),
  'authenticated cannot execute queue_session_email');

select * from finish();
rollback;
