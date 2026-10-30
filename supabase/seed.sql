-- Local development seed. Never runs against production: `supabase db reset`
-- and `supabase start` are local-only commands.
--
-- All three accounts use the password `password123`. email_confirmed_at is set
-- directly because confirmation is required and these accounts never receive
-- a real email.
-- confirmation_token/recovery_token/email_change_token_new/email_change and
-- created_at/updated_at have no column default and are left NULL by a
-- column-list insert like this one. GoTrue's password grant scans every
-- auth.users column into typed Go fields and errors on any of these that
-- come back NULL ("converting NULL to string", "storing <nil> into
-- *time.Time"), so they must be forced to a value here even though this
-- insert has no other reason to touch them.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change,
   created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin@jakbar.local', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Local Admin"}',
   '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-00000000b001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'host@jakbar.local', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Local Host"}',
   '', '', '', '', now(), now()),
  ('00000000-0000-0000-0000-00000000c001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'member@jakbar.local', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Local Member"}',
   '', '', '', '', now(), now())
on conflict (id) do nothing;

-- Supabase requires a matching identity row for password sign-in to resolve
-- the account by email. created_at/updated_at have no column default either
-- (same NULL-scan failure mode as auth.users above), so they're set here too.
insert into auth.identities
  (id, user_id, provider_id, provider, identity_data, last_sign_in_at,
   created_at, updated_at)
select id, id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
from auth.users
where id in ('00000000-0000-0000-0000-00000000a001',
             '00000000-0000-0000-0000-00000000b001',
             '00000000-0000-0000-0000-00000000c001')
on conflict do nothing;

-- auth.uid() is null here, so the role guard permits the bootstrap.
update public.profiles set role = 'admin', full_name = 'Local Admin'
 where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set role = 'host', full_name = 'Local Host'
 where id = '00000000-0000-0000-0000-00000000b001';
update public.profiles set full_name = 'Local Member'
 where id = '00000000-0000-0000-0000-00000000c001';

update public.profiles_private set phone = '+6281234567890'
 where user_id = '00000000-0000-0000-0000-00000000c001';

insert into public.sessions
  (title, starts_at, ends_at, location, court_count, max_participants,
   waitlist_capacity, created_by, status, registration_state)
values
  ('Friday Night Badminton',
   now() + interval '3 days', now() + interval '3 days 3 hours',
   'GOR Jakarta Barat', 4, 16, 4,
   '00000000-0000-0000-0000-00000000b001', 'scheduled', 'open');

-- ============================================================================
-- Demo data: a bench of dummy members plus a session in every lifecycle
-- state, so the host and member flows can be clicked through end to end
-- without hand-registering a dozen accounts first.
--
-- `member@jakbar.local` (the account you actually log in as) is deliberately
-- left OFF Friday Night Badminton -- register through the UI to exercise
-- that flow live. They're pre-seeded onto the waitlist on Sunday Casual
-- Rally instead, so the dashboard shows both an empty "browse sessions"
-- state and a live waitlist badge on first login.
--
-- Fixed ids (00000000-0000-0000-0000-00000000d0NN) make this block
-- re-runnable and let later inserts reference specific people by id instead
-- of re-querying auth.users by email.
-- ============================================================================

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change,
   created_at, updated_at)
select
  id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  email, crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', full_name),
  '', '', '', '', now(), now()
from (values
  ('00000000-0000-0000-0000-00000000d001'::uuid, 'dimas@jakbar.local', 'Dimas Pratama'),
  ('00000000-0000-0000-0000-00000000d002'::uuid, 'siti@jakbar.local', 'Siti Rahma'),
  ('00000000-0000-0000-0000-00000000d003'::uuid, 'andi@jakbar.local', 'Andi Wijaya'),
  ('00000000-0000-0000-0000-00000000d004'::uuid, 'putri@jakbar.local', 'Putri Lestari'),
  ('00000000-0000-0000-0000-00000000d005'::uuid, 'bayu@jakbar.local', 'Bayu Saputra'),
  ('00000000-0000-0000-0000-00000000d006'::uuid, 'nadia@jakbar.local', 'Nadia Kusuma'),
  ('00000000-0000-0000-0000-00000000d007'::uuid, 'rizky@jakbar.local', 'Rizky Firmansyah'),
  ('00000000-0000-0000-0000-00000000d008'::uuid, 'maya@jakbar.local', 'Maya Anggraini'),
  ('00000000-0000-0000-0000-00000000d009'::uuid, 'fajar@jakbar.local', 'Fajar Nugroho'),
  ('00000000-0000-0000-0000-00000000d010'::uuid, 'intan@jakbar.local', 'Intan Permata'),
  ('00000000-0000-0000-0000-00000000d011'::uuid, 'yoga@jakbar.local', 'Yoga Setiawan'),
  ('00000000-0000-0000-0000-00000000d012'::uuid, 'dewi@jakbar.local', 'Dewi Anjani'),
  ('00000000-0000-0000-0000-00000000d013'::uuid, 'reza@jakbar.local', 'Reza Pratama'),
  ('00000000-0000-0000-0000-00000000d014'::uuid, 'clara@jakbar.local', 'Clara Wijaya')
) as dummy(id, email, full_name)
on conflict (id) do nothing;

-- Same NULL-scan reasoning as the three named accounts above -- every dummy
-- needs an identity row before it can sign in with a password.
insert into auth.identities
  (id, user_id, provider_id, provider, identity_data, last_sign_in_at,
   created_at, updated_at)
select id, id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
from auth.users
where email like '%@jakbar.local'
  and id not in (select user_id from auth.identities)
on conflict do nothing;

-- Fill Friday Night Badminton to 10/16 -- room left for a live "Register"
-- test, well under the waitlist threshold.
insert into public.participants (session_id, user_id, status, registered_at)
select
  (select id from public.sessions where title = 'Friday Night Badminton'),
  user_id, 'confirmed'::public.participant_status, now() - (mins_ago || ' minutes')::interval
from (values
  ('00000000-0000-0000-0000-00000000d001'::uuid, 600),
  ('00000000-0000-0000-0000-00000000d002'::uuid, 580),
  ('00000000-0000-0000-0000-00000000d003'::uuid, 560),
  ('00000000-0000-0000-0000-00000000d004'::uuid, 540),
  ('00000000-0000-0000-0000-00000000d005'::uuid, 520),
  ('00000000-0000-0000-0000-00000000d006'::uuid, 500),
  ('00000000-0000-0000-0000-00000000d007'::uuid, 480),
  ('00000000-0000-0000-0000-00000000d008'::uuid, 460),
  ('00000000-0000-0000-0000-00000000d009'::uuid, 440),
  ('00000000-0000-0000-0000-00000000d010'::uuid, 420)
) as m(user_id, mins_ago);

-- A small, nearly-full session: 6/6 confirmed and the 3-slot waitlist
-- already full, with the real member account holding waitlist position 3.
insert into public.sessions
  (title, description, starts_at, ends_at, location, court_count,
   max_participants, waitlist_capacity, created_by, status, registration_state)
values
  ('Sunday Casual Rally',
   'Beginner-friendly drop-in play.',
   now() + interval '5 days', now() + interval '5 days 2 hours',
   'GOR Cengkareng', 2, 6, 3,
   '00000000-0000-0000-0000-00000000b001', 'scheduled', 'open');

insert into public.participants (session_id, user_id, status, registered_at)
select
  (select id from public.sessions where title = 'Sunday Casual Rally'),
  user_id, status::public.participant_status, now() - (mins_ago || ' minutes')::interval
from (values
  ('00000000-0000-0000-0000-00000000d001'::uuid, 'confirmed', 60),
  ('00000000-0000-0000-0000-00000000d002'::uuid, 'confirmed', 55),
  ('00000000-0000-0000-0000-00000000d003'::uuid, 'confirmed', 50),
  ('00000000-0000-0000-0000-00000000d004'::uuid, 'confirmed', 45),
  ('00000000-0000-0000-0000-00000000d005'::uuid, 'confirmed', 40),
  ('00000000-0000-0000-0000-00000000d006'::uuid, 'confirmed', 35),
  ('00000000-0000-0000-0000-00000000d007'::uuid, 'waiting_list', 30),
  ('00000000-0000-0000-0000-00000000d008'::uuid, 'waiting_list', 25),
  ('00000000-0000-0000-0000-00000000c001'::uuid, 'waiting_list', 20)
) as m(user_id, status, mins_ago);

-- A draft session still being set up -- hidden from the public site and
-- from members (sessions_select_public_or_host), visible only on the
-- host's own dashboard. Demos the "before you open registration" state.
insert into public.sessions
  (title, description, starts_at, ends_at, location, court_count,
   max_participants, waitlist_capacity, created_by, status, registration_state)
values
  ('Members Only Clinic (planning)',
   'Coaching clinic -- still finalizing courts and capacity.',
   now() + interval '14 days', now() + interval '14 days 3 hours',
   'GOR Jakarta Barat', 4, 12, 0,
   '00000000-0000-0000-0000-00000000b001', 'draft', 'closed');

-- A session that is live right now: registration closed at capacity,
-- courts set up, one match in progress, one queued, and a couple of
-- checked-in players sitting free -- the live dashboard's rotation pool.
-- Chained CTEs so courts/matches/match_players can reference the ids from
-- the inserts above them in the same statement.
with live as (
  insert into public.sessions
    (title, description, starts_at, ends_at, location, court_count,
     max_participants, waitlist_capacity, created_by, status, registration_state)
  values
    ('Wednesday League Night',
     'Filled up and live right now -- check-in, courts, and rotation demo.',
     now() - interval '45 minutes', now() + interval '2 hours 15 minutes',
     'GOR Kebon Jeruk', 4, 12, 4,
     '00000000-0000-0000-0000-00000000b001', 'live', 'closed')
  returning id
),
-- The admin account co-hosts this one, on top of the host's auto-added
-- owner row (sessions_add_owner), to demo the cohost permission path.
live_cohost as (
  insert into public.session_hosts (session_id, user_id, role)
  select id, '00000000-0000-0000-0000-00000000a001', 'cohost' from live
),
live_courts as (
  insert into public.courts (session_id, court_number, status)
  select live.id, g.n, (case when g.n = 1 then 'in_use' else 'idle' end)::public.court_status
  from live, generate_series(1, 4) as g(n)
  returning id, court_number
),
-- 12 confirmed (at capacity, hence registration_state closed): 10 checked
-- in, 2 still not -- so the check-in tab has real work to do too.
live_participants as (
  insert into public.participants (session_id, user_id, status, registered_at, checked_in_at)
  select live.id, m.user_id, 'confirmed'::public.participant_status,
         now() - interval '2 hours',
         case when m.checked_in then now() - interval '50 minutes' else null end
  from live, (values
    ('00000000-0000-0000-0000-00000000d001'::uuid, true),
    ('00000000-0000-0000-0000-00000000d002'::uuid, true),
    ('00000000-0000-0000-0000-00000000d003'::uuid, true),
    ('00000000-0000-0000-0000-00000000d004'::uuid, true),
    ('00000000-0000-0000-0000-00000000d005'::uuid, true),
    ('00000000-0000-0000-0000-00000000d006'::uuid, true),
    ('00000000-0000-0000-0000-00000000d007'::uuid, true),
    ('00000000-0000-0000-0000-00000000d008'::uuid, true),
    ('00000000-0000-0000-0000-00000000d009'::uuid, true),
    ('00000000-0000-0000-0000-00000000d010'::uuid, true),
    ('00000000-0000-0000-0000-00000000d011'::uuid, false),
    ('00000000-0000-0000-0000-00000000d012'::uuid, false)
  ) as m(user_id, checked_in)
  returning id, user_id
),
match1 as (
  insert into public.matches (session_id, court_id, status, started_at)
  select live.id, c.id, 'in_progress'::public.match_status, now() - interval '20 minutes'
  from live, live_courts c where c.court_number = 1
  returning id
),
match1_players as (
  insert into public.match_players (match_id, participant_id, team)
  select match1.id, lp.id, t.team
  from match1, live_participants lp
  join (values
    ('00000000-0000-0000-0000-00000000d001'::uuid, 1::smallint),
    ('00000000-0000-0000-0000-00000000d002'::uuid, 1::smallint),
    ('00000000-0000-0000-0000-00000000d003'::uuid, 2::smallint),
    ('00000000-0000-0000-0000-00000000d004'::uuid, 2::smallint)
  ) as t(user_id, team) on t.user_id = lp.user_id
),
-- Queued on an idle court -- created but not started, so court_number 2
-- stays 'idle' until the host hits "start" (matches start_match's effect).
match2 as (
  insert into public.matches (session_id, court_id, status, queue_position)
  select live.id, c.id, 'scheduled'::public.match_status, 1
  from live, live_courts c where c.court_number = 2
  returning id
)
insert into public.match_players (match_id, participant_id, team)
select match2.id, lp.id, t.team
from match2, live_participants lp
join (values
  ('00000000-0000-0000-0000-00000000d005'::uuid, 1::smallint),
  ('00000000-0000-0000-0000-00000000d006'::uuid, 1::smallint),
  ('00000000-0000-0000-0000-00000000d007'::uuid, 2::smallint),
  ('00000000-0000-0000-0000-00000000d008'::uuid, 2::smallint)
) as t(user_id, team) on t.user_id = lp.user_id;

-- A wrapped session from last week, for session history: mostly confirmed
-- and checked in, one cancellation, and the real member account among the
-- attendees so their own history isn't empty either.
with done as (
  insert into public.sessions
    (title, description, starts_at, ends_at, location, court_count,
     max_participants, waitlist_capacity, created_by, status, registration_state)
  values
    ('Last Sunday Wrap-up',
     'Wrapped last week.',
     now() - interval '7 days', now() - interval '7 days' + interval '3 hours',
     'GOR Cengkareng', 2, 12, 2,
     '00000000-0000-0000-0000-00000000b001', 'completed', 'closed')
  returning id
),
done_participants as (
  insert into public.participants (session_id, user_id, status, registered_at, checked_in_at, cancelled_at)
  select done.id, m.user_id, m.status::public.participant_status,
         now() - interval '8 days',
         case when m.status = 'confirmed' then now() - interval '7 days' else null end,
         case when m.status = 'cancelled' then now() - interval '7 days 6 hours' else null end
  from done, (values
    ('00000000-0000-0000-0000-00000000d001'::uuid, 'confirmed'),
    ('00000000-0000-0000-0000-00000000d002'::uuid, 'confirmed'),
    ('00000000-0000-0000-0000-00000000d003'::uuid, 'confirmed'),
    ('00000000-0000-0000-0000-00000000d004'::uuid, 'confirmed'),
    ('00000000-0000-0000-0000-00000000c001'::uuid, 'confirmed'),
    ('00000000-0000-0000-0000-00000000d013'::uuid, 'cancelled')
  ) as m(user_id, status)
)
insert into public.courts (session_id, court_number, status)
select done.id, g.n, 'idle'::public.court_status
from done, generate_series(1, 2) as g(n);

insert into public.announcements (session_id, title, body, created_by, published_at)
values
  (null, 'Court fees going up in November',
   'Heads up -- GOR rates are rising next month. We are absorbing it for now.',
   '00000000-0000-0000-0000-00000000a001', now() - interval '2 days'),
  ((select id from public.sessions where title = 'Friday Night Badminton'),
   'Bring your own shuttlecocks',
   'We are short on shuttles this week -- please bring a tube if you have one.',
   '00000000-0000-0000-0000-00000000b001', now() - interval '1 day');
