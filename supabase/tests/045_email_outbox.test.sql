-- Covers migration 20261116000001_email_outbox.sql.

begin;
select plan(17);

insert into auth.users (id, email)
select ('000000' || lpad(n::text, 2, '0') || '-0045-0045-0045-000000000000')::uuid,
       'u' || n || '-045@test.local'
  from generate_series(1, 2) n;

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   court_count, created_by, status, registration_state)
values
  ('a4500001-0000-0000-0000-000000000000', 'S', now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR', 6, 10, 1, '00000001-0045-0045-0045-000000000000', 'scheduled', 'open');

select has_table('public', 'email_outbox', 'email_outbox exists');
select has_column('public', 'profiles', 'email_reminders', 'profiles.email_reminders exists');
select col_default_is('public', 'profiles', 'email_reminders', 'true', 'reminders default on');
select ok(not has_table_privilege('anon', 'public.email_outbox', 'select'), 'anon lacks SELECT');
select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'select'), 'authenticated lacks SELECT');
select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'insert'), 'authenticated lacks INSERT');
select ok(not has_function_privilege('authenticated', 'public.claim_email_outbox(int)', 'execute'),
  'authenticated cannot claim');
select ok(has_function_privilege('service_role', 'public.claim_email_outbox(int)', 'execute'),
  'service_role can claim');
select ok((select relrowsecurity from pg_class where oid = 'public.email_outbox'::regclass), 'RLS enabled');

insert into public.email_outbox (id, type, user_id, session_id, created_at, sent_at, attempts, claimed_at) values
  ('e4500001-0000-0000-0000-000000000000', 'registration_confirmed', '00000001-0045-0045-0045-000000000000',
   'a4500001-0000-0000-0000-000000000000', now() - interval '5 hours', null, 0, null),
  ('e4500002-0000-0000-0000-000000000000', 'registration_confirmed', '00000001-0045-0045-0045-000000000000',
   'a4500001-0000-0000-0000-000000000000', now() - interval '4 hours', now(), 0, null),
  ('e4500003-0000-0000-0000-000000000000', 'registration_confirmed', '00000001-0045-0045-0045-000000000000',
   'a4500001-0000-0000-0000-000000000000', now() - interval '3 hours', null, 3, null),
  ('e4500004-0000-0000-0000-000000000000', 'registration_confirmed', '00000001-0045-0045-0045-000000000000',
   'a4500001-0000-0000-0000-000000000000', now() - interval '2 hours', null, 0, now() - interval '1 minute'),
  ('e4500005-0000-0000-0000-000000000000', 'registration_confirmed', '00000001-0045-0045-0045-000000000000',
   'a4500001-0000-0000-0000-000000000000', now() - interval '1 hour', null, 1, now() - interval '11 minutes');

select set_eq(
  $$ select id from public.claim_email_outbox(10) $$,
  $$ values ('e4500001-0000-0000-0000-000000000000'::uuid), ('e4500005-0000-0000-0000-000000000000'::uuid) $$,
  'claim returns pending and stale-claimed rows only');
select is((select attempts from public.email_outbox where id = 'e4500001-0000-0000-0000-000000000000'), 1, 'claim increments attempts');
select is((select attempts from public.email_outbox where id = 'e4500005-0000-0000-0000-000000000000'), 2, 'reclaim increments attempts');
select isnt((select claimed_at from public.email_outbox where id = 'e4500001-0000-0000-0000-000000000000'), null, 'claim stamps claimed_at');
select is_empty($$ select id from public.claim_email_outbox(10) $$, 'second claim returns nothing');

delete from public.email_outbox;
insert into public.email_outbox (id, type, user_id, session_id, created_at) values
  ('e4500011-0000-0000-0000-000000000000', 'bumped', '00000002-0045-0045-0045-000000000000',
   'a4500001-0000-0000-0000-000000000000', now() - interval '2 hours'),
  ('e4500012-0000-0000-0000-000000000000', 'bumped', '00000002-0045-0045-0045-000000000000',
   'a4500001-0000-0000-0000-000000000000', now() - interval '1 hour');

select results_eq(
  $$ select id from public.claim_email_outbox(1) $$,
  $$ values ('e4500011-0000-0000-0000-000000000000'::uuid) $$,
  'limit 1 returns the older row');
select is((select count(*)::int from public.email_outbox where claimed_at is not null), 1, 'only one row claimed');
select is((select attempts from public.email_outbox where id = 'e4500012-0000-0000-0000-000000000000'), 0, 'newer row untouched');

select * from finish();
rollback;
