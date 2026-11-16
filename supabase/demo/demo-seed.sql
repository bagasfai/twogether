-- ============================================================================
-- Jakbar Twogether -- community demo data
--
-- Paste into the Supabase SQL editor of the HOSTED project and run once.
-- Remove everything again with demo-cleanup.sql.
--
-- Every demo account signs in with password `Demo2026!`:
--   admin@twogether.demo   Demo Admin   (admin)
--   host@twogether.demo    Demo Host    (host, owns every demo session)
--   member@twogether.demo  Demo Member  (member, the one you register live with)
--   20 more members: <firstname>@twogether.demo (dimas@, siti@, andi@ ...)
--
-- Times are relative to now(), so run it on the day of the demo: the "live"
-- session starts 30 minutes before you run this.
--
-- Sessions it creates, and what each one is for:
--   Open Play Malam          open, 10/16 -- member registers, brings a guest
--   Fun Game Pagi            open, 8/8 full, 3/4 waitlist -- waitlist +
--                            auto-promotion when a host cancels someone
--   Drilling Kelas Pemula    drilling, 2 coaches x 4 seats, 5/8
--   Sesi Malam Ini (Live)    live now: check-in, courts, matches, rotation
--   Sesi Minggu Lalu         completed: history, paid/no-show, leaderboard
--   Sesi 2 Minggu Lalu  completed: more history
--   Klinik Smash (draft)     draft, host-only
--
-- Fixed ids (prefix de00...) keep this re-runnable-safe (it fails fast on a
-- second run instead of duplicating) and let demo-cleanup.sql find every row.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
-- confirmation_token .. updated_at are forced to non-NULL values: GoTrue's
-- password grant errors on NULLs in those columns (see supabase/seed.sql).
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change,
   created_at, updated_at)
select
  id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  email, extensions.crypt('Demo2026!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', full_name, 'phone', phone),
  '', '', '', '', now() - interval '60 days', now()
from (values
  ('de000000-0000-4000-8000-000000000001'::uuid, 'admin@twogether.demo',  'Demo Admin',       '+628110000001'),
  ('de000000-0000-4000-8000-000000000002'::uuid, 'host@twogether.demo',   'Demo Host',        '+628110000002'),
  ('de000000-0000-4000-8000-000000000003'::uuid, 'member@twogether.demo', 'Demo Member',      '+628110000003'),
  ('de000000-0000-4000-8000-000000000010'::uuid, 'dimas@twogether.demo',  'Dimas Pratama',    '+628110000010'),
  ('de000000-0000-4000-8000-000000000011'::uuid, 'siti@twogether.demo',   'Siti Rahma',       '+628110000011'),
  ('de000000-0000-4000-8000-000000000012'::uuid, 'andi@twogether.demo',   'Andi Wijaya',      '+628110000012'),
  ('de000000-0000-4000-8000-000000000013'::uuid, 'putri@twogether.demo',  'Putri Lestari',    '+628110000013'),
  ('de000000-0000-4000-8000-000000000014'::uuid, 'bayu@twogether.demo',   'Bayu Saputra',     '+628110000014'),
  ('de000000-0000-4000-8000-000000000015'::uuid, 'nadia@twogether.demo',  'Nadia Kusuma',     '+628110000015'),
  ('de000000-0000-4000-8000-000000000016'::uuid, 'rizky@twogether.demo',  'Rizky Firmansyah', '+628110000016'),
  ('de000000-0000-4000-8000-000000000017'::uuid, 'maya@twogether.demo',   'Maya Anggraini',   '+628110000017'),
  ('de000000-0000-4000-8000-000000000018'::uuid, 'fajar@twogether.demo',  'Fajar Nugroho',    '+628110000018'),
  ('de000000-0000-4000-8000-000000000019'::uuid, 'intan@twogether.demo',  'Intan Permata',    '+628110000019'),
  ('de000000-0000-4000-8000-000000000020'::uuid, 'yoga@twogether.demo',   'Yoga Setiawan',    '+628110000020'),
  ('de000000-0000-4000-8000-000000000021'::uuid, 'dewi@twogether.demo',   'Dewi Anjani',      '+628110000021'),
  ('de000000-0000-4000-8000-000000000022'::uuid, 'reza@twogether.demo',   'Reza Pratama',     '+628110000022'),
  ('de000000-0000-4000-8000-000000000023'::uuid, 'clara@twogether.demo',  'Clara Wijaya',     '+628110000023'),
  ('de000000-0000-4000-8000-000000000024'::uuid, 'hendra@twogether.demo', 'Hendra Gunawan',   '+628110000024'),
  ('de000000-0000-4000-8000-000000000025'::uuid, 'rina@twogether.demo',   'Rina Marlina',     '+628110000025'),
  ('de000000-0000-4000-8000-000000000026'::uuid, 'agus@twogether.demo',   'Agus Salim',       '+628110000026'),
  ('de000000-0000-4000-8000-000000000027'::uuid, 'lina@twogether.demo',   'Lina Hartono',     '+628110000027'),
  ('de000000-0000-4000-8000-000000000028'::uuid, 'teguh@twogether.demo',  'Teguh Prasetyo',   '+628110000028'),
  ('de000000-0000-4000-8000-000000000029'::uuid, 'sari@twogether.demo',   'Sari Wulandari',   '+628110000029')
) as u(id, email, full_name, phone);

insert into auth.identities
  (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select id, id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
from auth.users
where email like '%@twogether.demo';

-- profiles/profiles_private rows come from the signup trigger. auth.uid() is
-- null in the SQL editor, so the role-change guard allows this.
update public.profiles set role = 'admin' where id = 'de000000-0000-4000-8000-000000000001';
update public.profiles set role = 'host'  where id = 'de000000-0000-4000-8000-000000000002';

update public.profiles_private pp
   set gender = g.gender::public.gender
  from (values
    ('de000000-0000-4000-8000-000000000001'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000002'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000003'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000010'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000011'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000012'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000013'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000014'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000015'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000016'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000017'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000018'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000019'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000020'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000021'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000022'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000023'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000024'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000025'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000026'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000027'::uuid, 'female'),
    ('de000000-0000-4000-8000-000000000028'::uuid, 'male'),
    ('de000000-0000-4000-8000-000000000029'::uuid, 'female')
  ) as g(user_id, gender)
 where pp.user_id = g.user_id;

insert into public.member_levels (user_id, level, set_by)
select l.user_id, l.level::public.skill_level, 'de000000-0000-4000-8000-000000000002'
from (values
  ('de000000-0000-4000-8000-000000000003'::uuid, 'novice'),
  ('de000000-0000-4000-8000-000000000010'::uuid, 'intermediate'),
  ('de000000-0000-4000-8000-000000000011'::uuid, 'advanced'),
  ('de000000-0000-4000-8000-000000000012'::uuid, 'novice'),
  ('de000000-0000-4000-8000-000000000013'::uuid, 'intermediate'),
  ('de000000-0000-4000-8000-000000000014'::uuid, 'advanced'),
  ('de000000-0000-4000-8000-000000000015'::uuid, 'beginner'),
  ('de000000-0000-4000-8000-000000000016'::uuid, 'intermediate'),
  ('de000000-0000-4000-8000-000000000017'::uuid, 'novice'),
  ('de000000-0000-4000-8000-000000000018'::uuid, 'beginner'),
  ('de000000-0000-4000-8000-000000000019'::uuid, 'intermediate'),
  ('de000000-0000-4000-8000-000000000020'::uuid, 'novice'),
  ('de000000-0000-4000-8000-000000000021'::uuid, 'beginner'),
  ('de000000-0000-4000-8000-000000000022'::uuid, 'advanced'),
  ('de000000-0000-4000-8000-000000000023'::uuid, 'novice'),
  ('de000000-0000-4000-8000-000000000024'::uuid, 'intermediate'),
  ('de000000-0000-4000-8000-000000000025'::uuid, 'newbie'),
  ('de000000-0000-4000-8000-000000000026'::uuid, 'beginner'),
  ('de000000-0000-4000-8000-000000000027'::uuid, 'intermediate'),
  ('de000000-0000-4000-8000-000000000028'::uuid, 'novice'),
  ('de000000-0000-4000-8000-000000000029'::uuid, 'advanced')
) as l(user_id, level);

-- ---------------------------------------------------------------------------
-- Sessions (sessions_add_owner makes Demo Host the owner of each)
-- ---------------------------------------------------------------------------
insert into public.sessions
  (id, title, description, starts_at, ends_at, location, location_url,
   court_count, max_participants, waitlist_capacity, price, kind,
   coach_count, seats_per_coach, premium_surcharge_idr,
   created_by, status, registration_state)
values
  ('de0005e5-0000-4000-8000-000000000001', 'Open Play Malam',
   'Main santai semua level. Bawa raket sendiri, kok disediakan.',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '2 days 19 hours') at time zone 'Asia/Jakarta',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '2 days 22 hours') at time zone 'Asia/Jakarta',
   'GOR Jakarta Barat', null, 4, 16, 4, 35000, 'open_play', null, null, 0,
   'de000000-0000-4000-8000-000000000002', 'scheduled', 'open'),

  ('de0005e5-0000-4000-8000-000000000002', 'Fun Game Pagi',
   'Slot terbatas, 2 lapangan. Kalau penuh, masuk waiting list -- otomatis naik kalau ada yang batal.',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '3 days 7 hours') at time zone 'Asia/Jakarta',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '3 days 10 hours') at time zone 'Asia/Jakarta',
   'GOR Cengkareng', null, 2, 8, 4, 40000, 'open_play', null, null, 0,
   'de000000-0000-4000-8000-000000000002', 'scheduled', 'open'),

  ('de0005e5-0000-4000-8000-000000000003', 'Drilling Kelas Pemula',
   'Latihan teknik dasar bersama 2 coach, 4 orang per coach.',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '6 days 16 hours') at time zone 'Asia/Jakarta',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '6 days 18 hours') at time zone 'Asia/Jakarta',
   'GOR Kebon Jeruk', null, 2, 8, 2, 75000, 'drilling', 2, 4, 25000,
   'de000000-0000-4000-8000-000000000002', 'scheduled', 'open'),

  ('de0005e5-0000-4000-8000-000000000004', 'Sesi Malam Ini (Live)',
   'Sesi yang sedang berjalan -- check-in, lapangan, dan rotasi.',
   now() - interval '30 minutes', now() + interval '2 hours 30 minutes',
   'GOR Kebon Jeruk', null, 3, 14, 2, 35000, 'open_play', null, null, 0,
   'de000000-0000-4000-8000-000000000002', 'live', 'closed'),

  ('de0005e5-0000-4000-8000-000000000005', 'Sesi Minggu Lalu',
   'Sesi minggu lalu.',
   now() - interval '7 days', now() - interval '7 days' + interval '3 hours',
   'GOR Cengkareng', null, 2, 14, 2, 35000, 'open_play', null, null, 0,
   'de000000-0000-4000-8000-000000000002', 'completed', 'closed'),

  ('de0005e5-0000-4000-8000-000000000006', 'Sesi 2 Minggu Lalu',
   'Sesi dua minggu lalu.',
   now() - interval '14 days', now() - interval '14 days' + interval '3 hours',
   'GOR Jakarta Barat', null, 2, 12, 2, 35000, 'open_play', null, null, 0,
   'de000000-0000-4000-8000-000000000002', 'completed', 'closed'),

  ('de0005e5-0000-4000-8000-000000000007', 'Klinik Smash (draft)',
   'Masih disiapkan -- hanya host yang bisa lihat.',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '14 days 16 hours') at time zone 'Asia/Jakarta',
   (date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '14 days 19 hours') at time zone 'Asia/Jakarta',
   'GOR Jakarta Barat', null, 2, 12, 0, 50000, 'open_play', null, null, 0,
   'de000000-0000-4000-8000-000000000002', 'draft', 'closed');

-- Demo Admin co-hosts the live session (cohost permission path).
insert into public.session_hosts (session_id, user_id, role)
values ('de0005e5-0000-4000-8000-000000000004', 'de000000-0000-4000-8000-000000000001', 'cohost');

insert into public.courts (session_id, court_number, status)
select s.id, g.n, 'idle'::public.court_status
from public.sessions s
cross join lateral generate_series(1, s.court_count) as g(n)
where s.id::text like 'de0005e5-%';

-- ---------------------------------------------------------------------------
-- Participants. registered_at order is the waitlist order.
-- ---------------------------------------------------------------------------
-- Open Play Malam: 10/16, Demo Member deliberately NOT on it.
insert into public.participants (session_id, user_id, status, registered_at, paid_at)
select 'de0005e5-0000-4000-8000-000000000001', ('de000000-0000-4000-8000-0000000000' || n)::uuid,
       'confirmed', now() - (n || ' hours')::interval,
       case when n::int % 3 = 0 then now() - interval '1 hour' end
from unnest(array['11','13','15','17','19','21','23','25','27','29']) as n;

-- Fun Game Pagi: 8/8 confirmed + 3/4 waitlist. Demo Member can take #4.
insert into public.participants (session_id, user_id, status, registered_at)
select 'de0005e5-0000-4000-8000-000000000002', ('de000000-0000-4000-8000-0000000000' || n)::uuid,
       s::public.participant_status, now() - (mins || ' minutes')::interval
from (values
  ('10','confirmed',300), ('12','confirmed',290), ('14','confirmed',280), ('16','confirmed',270),
  ('18','confirmed',260), ('20','confirmed',250), ('22','confirmed',240), ('24','confirmed',230),
  ('26','waiting_list',120), ('28','waiting_list',90), ('11','waiting_list',60)
) as v(n, s, mins);

-- Drilling Kelas Pemula: 5/8.
insert into public.participants (session_id, user_id, status, registered_at)
select 'de0005e5-0000-4000-8000-000000000003', ('de000000-0000-4000-8000-0000000000' || n)::uuid,
       'confirmed', now() - (n || ' minutes')::interval
from unnest(array['12','15','21','25','26']) as n;

-- Sesi Malam Ini (Live): 12 members + 1 guest. 10 checked in, 3 not yet.
insert into public.participants (session_id, user_id, status, registered_at, checked_in_at, paid_at)
select 'de0005e5-0000-4000-8000-000000000004', ('de000000-0000-4000-8000-0000000000' || n)::uuid,
       'confirmed', now() - interval '2 days',
       case when checked then now() - interval '35 minutes' end,
       case when paid then now() - interval '35 minutes' end
from (values
  ('10',true,true), ('11',true,true), ('12',true,true), ('13',true,false),
  ('14',true,true), ('15',true,true), ('16',true,false), ('17',true,true),
  ('24',true,true), ('18',false,false), ('19',false,false), ('25',false,false)
) as v(n, checked, paid);

insert into public.participants
  (session_id, guest_name, guest_phone, registered_by, status, registered_at, checked_in_at, paid_at)
values
  ('de0005e5-0000-4000-8000-000000000004', 'Budi (tamu Dimas)', null,
   'de000000-0000-4000-8000-000000000010', 'confirmed', now() - interval '1 day',
   now() - interval '30 minutes', now() - interval '30 minutes');

insert into public.guest_attributes (participant_id, gender, level)
select id, 'male', 'beginner' from public.participants
 where session_id = 'de0005e5-0000-4000-8000-000000000004' and guest_name = 'Budi (tamu Dimas)';

-- Sesi Minggu Lalu: 12 played, 1 no-show, 1 cancelled.
insert into public.participants
  (session_id, user_id, status, registered_at, checked_in_at, paid_at, no_show_at, cancelled_at)
select 'de0005e5-0000-4000-8000-000000000005', ('de000000-0000-4000-8000-0000000000' || n)::uuid,
       s::public.participant_status, now() - interval '9 days',
       case when kind = 'played' then now() - interval '7 days' end,
       case when kind = 'played' then now() - interval '7 days' end,
       case when kind = 'noshow' then now() - interval '7 days' + interval '1 hour' end,
       case when kind = 'cancelled' then now() - interval '8 days' end
from (values
  ('03','confirmed','played'), ('10','confirmed','played'), ('11','confirmed','played'),
  ('12','confirmed','played'), ('13','confirmed','played'), ('14','confirmed','played'),
  ('15','confirmed','played'), ('16','confirmed','played'), ('17','confirmed','played'),
  ('18','confirmed','played'), ('19','confirmed','played'), ('20','confirmed','played'),
  ('21','confirmed','noshow'), ('22','cancelled','cancelled')
) as v(n, s, kind);

-- Sesi 2 Minggu Lalu: 8 played.
insert into public.participants (session_id, user_id, status, registered_at, checked_in_at, paid_at)
select 'de0005e5-0000-4000-8000-000000000006', ('de000000-0000-4000-8000-0000000000' || n)::uuid,
       'confirmed', now() - interval '16 days', now() - interval '14 days', now() - interval '14 days'
from unnest(array['03','11','14','22','24','27','28','29']) as n;

-- ---------------------------------------------------------------------------
-- Matches. Players are matched to participants by member id or guest name.
-- ---------------------------------------------------------------------------
insert into public.matches (id, session_id, court_id, status, queue_position, started_at, completed_at)
select m.id::uuid, m.session_id::uuid, c.id, m.status::public.match_status, m.queue_position,
       now() + m.started::interval,
       case when m.status = 'completed' then now() + m.started::interval + interval '15 minutes' end
from (values
  -- Sesi Malam Ini (Live): 2 done, 1 on court 1, 1 queued for court 2
  ('de00a7c0-0000-4000-8000-000000000401', 'de0005e5-0000-4000-8000-000000000004', 1, 'completed',   null, '-28 minutes'),
  ('de00a7c0-0000-4000-8000-000000000402', 'de0005e5-0000-4000-8000-000000000004', 2, 'completed',   null, '-27 minutes'),
  ('de00a7c0-0000-4000-8000-000000000403', 'de0005e5-0000-4000-8000-000000000004', 1, 'in_progress', null, '-12 minutes'),
  ('de00a7c0-0000-4000-8000-000000000404', 'de0005e5-0000-4000-8000-000000000004', 2, 'scheduled',   1,    null),
  -- Sesi Minggu Lalu
  ('de00a7c0-0000-4000-8000-000000000501', 'de0005e5-0000-4000-8000-000000000005', 1, 'completed', null, '-7 days'),
  ('de00a7c0-0000-4000-8000-000000000502', 'de0005e5-0000-4000-8000-000000000005', 2, 'completed', null, '-7 days'),
  ('de00a7c0-0000-4000-8000-000000000503', 'de0005e5-0000-4000-8000-000000000005', 1, 'completed', null, '-7 days 20 minutes'),
  ('de00a7c0-0000-4000-8000-000000000504', 'de0005e5-0000-4000-8000-000000000005', 2, 'completed', null, '-7 days 20 minutes'),
  ('de00a7c0-0000-4000-8000-000000000505', 'de0005e5-0000-4000-8000-000000000005', 1, 'completed', null, '-7 days 40 minutes'),
  ('de00a7c0-0000-4000-8000-000000000506', 'de0005e5-0000-4000-8000-000000000005', 2, 'completed', null, '-7 days 40 minutes'),
  -- Sesi 2 Minggu Lalu
  ('de00a7c0-0000-4000-8000-000000000601', 'de0005e5-0000-4000-8000-000000000006', 1, 'completed', null, '-14 days'),
  ('de00a7c0-0000-4000-8000-000000000602', 'de0005e5-0000-4000-8000-000000000006', 2, 'completed', null, '-14 days')
) as m(id, session_id, court_number, status, queue_position, started)
join public.courts c on c.session_id = m.session_id::uuid and c.court_number = m.court_number;

update public.courts c set status = 'in_use'
  from public.matches m
 where m.court_id = c.id and m.id = 'de00a7c0-0000-4000-8000-000000000403';

-- The busy guard rejects adding a player to ANY match while they sit in an
-- active one, and a single INSERT does not promise row order -- so the lineup
-- goes into a temp table and completed matches are inserted before active ones.
create temp table demo_lineup on commit drop as
select v.match_id::uuid as match_id, p.id as participant_id, v.team::smallint as team, m.status
from (values
  ('de00a7c0-0000-4000-8000-000000000401','10',1), ('de00a7c0-0000-4000-8000-000000000401','11',1),
  ('de00a7c0-0000-4000-8000-000000000401','12',2), ('de00a7c0-0000-4000-8000-000000000401','13',2),
  ('de00a7c0-0000-4000-8000-000000000402','14',1), ('de00a7c0-0000-4000-8000-000000000402','15',1),
  ('de00a7c0-0000-4000-8000-000000000402','16',2), ('de00a7c0-0000-4000-8000-000000000402','17',2),

  ('de00a7c0-0000-4000-8000-000000000501','03',1), ('de00a7c0-0000-4000-8000-000000000501','10',1),
  ('de00a7c0-0000-4000-8000-000000000501','11',2), ('de00a7c0-0000-4000-8000-000000000501','12',2),
  ('de00a7c0-0000-4000-8000-000000000502','13',1), ('de00a7c0-0000-4000-8000-000000000502','14',1),
  ('de00a7c0-0000-4000-8000-000000000502','15',2), ('de00a7c0-0000-4000-8000-000000000502','16',2),
  ('de00a7c0-0000-4000-8000-000000000503','17',1), ('de00a7c0-0000-4000-8000-000000000503','18',1),
  ('de00a7c0-0000-4000-8000-000000000503','19',2), ('de00a7c0-0000-4000-8000-000000000503','20',2),
  ('de00a7c0-0000-4000-8000-000000000504','03',1), ('de00a7c0-0000-4000-8000-000000000504','11',1),
  ('de00a7c0-0000-4000-8000-000000000504','13',2), ('de00a7c0-0000-4000-8000-000000000504','17',2),
  ('de00a7c0-0000-4000-8000-000000000505','10',1), ('de00a7c0-0000-4000-8000-000000000505','14',1),
  ('de00a7c0-0000-4000-8000-000000000505','18',2), ('de00a7c0-0000-4000-8000-000000000505','19',2),
  ('de00a7c0-0000-4000-8000-000000000506','12',1), ('de00a7c0-0000-4000-8000-000000000506','15',1),
  ('de00a7c0-0000-4000-8000-000000000506','16',2), ('de00a7c0-0000-4000-8000-000000000506','20',2),

  ('de00a7c0-0000-4000-8000-000000000601','03',1), ('de00a7c0-0000-4000-8000-000000000601','11',1),
  ('de00a7c0-0000-4000-8000-000000000601','14',2), ('de00a7c0-0000-4000-8000-000000000601','22',2),
  ('de00a7c0-0000-4000-8000-000000000602','24',1), ('de00a7c0-0000-4000-8000-000000000602','27',1),
  ('de00a7c0-0000-4000-8000-000000000602','28',2), ('de00a7c0-0000-4000-8000-000000000602','29',2),

  -- active matches in the live session
  ('de00a7c0-0000-4000-8000-000000000403','10',1), ('de00a7c0-0000-4000-8000-000000000403','13',1),
  ('de00a7c0-0000-4000-8000-000000000403','14',2), ('de00a7c0-0000-4000-8000-000000000403','24',2),
  ('de00a7c0-0000-4000-8000-000000000404','11',1), ('de00a7c0-0000-4000-8000-000000000404','12',1),
  ('de00a7c0-0000-4000-8000-000000000404','15',2), ('de00a7c0-0000-4000-8000-000000000404','guest',2)
) as v(match_id, who, team)
join public.matches m on m.id = v.match_id::uuid
join public.participants p
  on p.session_id = m.session_id
 and (   (v.who <> 'guest' and p.user_id = ('de000000-0000-4000-8000-0000000000' || v.who)::uuid)
      or (v.who = 'guest' and p.guest_name = 'Budi (tamu Dimas)'));

insert into public.match_players (match_id, participant_id, team)
select match_id, participant_id, team from demo_lineup where status = 'completed';

insert into public.match_players (match_id, participant_id, team)
select match_id, participant_id, team from demo_lineup where status <> 'completed';

-- ---------------------------------------------------------------------------
-- Photo albums (upload photos live during the demo)
-- ---------------------------------------------------------------------------
-- Starting a session normally creates its album (sessions_create_gallery
-- fires on the UPDATE to live); these sessions were inserted already live or
-- completed, so their albums are added by hand.
insert into public.galleries (session_id, title, description, created_by)
values
  ('de0005e5-0000-4000-8000-000000000004', 'Sesi Malam Ini (Live)',
   'Upload foto langsung dari lapangan.', 'de000000-0000-4000-8000-000000000002'),
  ('de0005e5-0000-4000-8000-000000000005', 'Sesi Minggu Lalu',
   'Foto-foto sesi minggu lalu.', 'de000000-0000-4000-8000-000000000002')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
insert into public.announcements (session_id, title, body, created_by, published_at)
values
  (null, 'Selamat datang di Jakbar Twogether',
   'Mulai sekarang pendaftaran sesi lewat sini, bukan lewat list WA lagi. Daftar, cek posisi waiting list, dan lihat riwayat main kamu.',
   'de000000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('de0005e5-0000-4000-8000-000000000001', 'Bawa kok sendiri ya',
   'Stok kok minggu ini terbatas -- kalau punya, tolong bawa satu slop.',
   'de000000-0000-4000-8000-000000000002', now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- Premium membership: a plan, and Siti holding an active one
-- ---------------------------------------------------------------------------
insert into public.membership_plans (id, name, price_idr, quota, duration_days, refund_cutoff_hours, is_active)
values ('de00b1a0-0000-4000-8000-000000000001', 'Premium Bulanan (demo)', 300000, 4, 30, 24, true);

insert into public.memberships
  (user_id, plan_id, price_idr, quota_total, duration_days, refund_cutoff_hours,
   payment_received_at, activated_by, started_at, expires_at)
values
  ('de000000-0000-4000-8000-000000000011', 'de00b1a0-0000-4000-8000-000000000001',
   300000, 4, 30, 24, now() - interval '10 days', 'de000000-0000-4000-8000-000000000001',
   now() - interval '10 days', now() + interval '20 days');

-- ---------------------------------------------------------------------------
-- Public site content -- only filled when the tables are still empty, so real
-- content you already wrote is never touched (and cleanup leaves it alone).
-- ---------------------------------------------------------------------------
insert into public.community_about (id, title_en, title_id, body_en, body_id)
select true, 'About Jakbar Twogether', 'Tentang Jakbar Twogether',
       'A badminton community in West Jakarta. We play open sessions every week, all levels welcome.',
       'Komunitas badminton di Jakarta Barat. Main bareng tiap minggu, semua level boleh ikut.'
where not exists (select 1 from public.community_about);

insert into public.faq_items (question_en, question_id, answer_en, answer_id, sort_order)
select q_en, q_id, a_en, a_id, ord
from (values
  ('How do I register for a session?', 'Bagaimana cara daftar sesi?',
   'Create an account, open a session and press Register. You will see right away whether you are confirmed or on the waitlist.',
   'Buat akun, buka sesi, lalu tekan Daftar. Kamu langsung tahu apakah sudah terkonfirmasi atau masuk waiting list.', 1),
  ('What happens if the session is full?', 'Kalau sesi sudah penuh?',
   'You join the waitlist. When someone cancels, the first person on the waitlist is moved up automatically.',
   'Kamu masuk waiting list. Kalau ada yang batal, urutan pertama otomatis naik.', 2),
  ('Can I bring a friend without an account?', 'Boleh bawa teman yang belum punya akun?',
   'Yes. Use "Bring a guest" on the session page. You can cancel their spot yourself.',
   'Boleh. Pakai tombol "Bawa tamu" di halaman sesi. Kamu bisa membatalkan slot mereka sendiri.', 3)
) as f(q_en, q_id, a_en, a_id, ord)
where not exists (select 1 from public.faq_items);

commit;
