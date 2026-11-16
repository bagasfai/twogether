-- Dev-only dummy members: 20 users, password `Dev2026!`.
-- Emails: dev01@twogether.dev .. dev20@twogether.dev
-- Independent of demo-seed.sql (different ids and email domain).
-- Run in the Supabase SQL editor or: psql "$DB_URL" -f supabase/demo/dev-users.sql
-- Re-runnable: existing dev users are skipped.
--
-- Remove with the cleanup block at the bottom.

begin;

with names(n, full_name, gender, level) as (
  values
  (1,  'Adit Ramadhan',   'male',   'intermediate'),
  (2,  'Bella Safitri',   'female', 'advanced'),
  (3,  'Candra Wijaya',   'male',   'novice'),
  (4,  'Dinda Maharani',  'female', 'beginner'),
  (5,  'Eko Prabowo',     'male',   'intermediate'),
  (6,  'Farah Nabila',    'female', 'novice'),
  (7,  'Galih Saputra',   'male',   'advanced'),
  (8,  'Hana Permata',    'female', 'intermediate'),
  (9,  'Irfan Hakim',     'male',   'beginner'),
  (10, 'Jihan Aulia',     'female', 'newbie'),
  (11, 'Kevin Santoso',   'male',   'novice'),
  (12, 'Laras Ayu',       'female', 'intermediate'),
  (13, 'Miko Pranata',    'male',   'advanced'),
  (14, 'Nisa Rahmawati',  'female', 'beginner'),
  (15, 'Oka Mahendra',    'male',   'intermediate'),
  (16, 'Putra Alamsyah',  'male',   'newbie'),
  (17, 'Qori Fadilah',    'female', 'novice'),
  (18, 'Rafi Maulana',    'male',   'intermediate'),
  (19, 'Salsa Amelia',    'female', 'advanced'),
  (20, 'Tito Kurniawan',  'male',   'beginner')
),
u as (
  select
    ('dd000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid as id,
    'dev' || lpad(n::text, 2, '0') || '@twogether.dev' as email,
    full_name,
    '+62812000' || lpad(n::text, 4, '0') as phone,
    gender, level
  from names
),
ins as (
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password,
     email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     created_at, updated_at)
  select
    id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    email, extensions.crypt('Dev2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', full_name, 'phone', phone),
    '', '', '', '', now(), now()
  from u
  on conflict (id) do nothing
  returning id
),
ident as (
  insert into auth.identities
    (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select id, id, id::text, 'email',
         jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
         now(), now(), now()
  from u
  where id in (select id from ins)
  returning user_id
)
select count(*) as users_created from ins;

-- profiles / profiles_private rows come from the handle_new_user trigger.
update public.profiles_private pp
   set gender = v.gender::public.gender
  from (
    select ('dd000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid as id, gender
    from (values
      (1,'male'),(2,'female'),(3,'male'),(4,'female'),(5,'male'),(6,'female'),(7,'male'),
      (8,'female'),(9,'male'),(10,'female'),(11,'male'),(12,'female'),(13,'male'),
      (14,'female'),(15,'male'),(16,'male'),(17,'female'),(18,'male'),(19,'female'),(20,'male')
    ) g(n, gender)
  ) v
 where pp.user_id = v.id;

insert into public.member_levels (user_id, level)
select ('dd000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, lvl::public.skill_level
from (values
  (1,'intermediate'),(2,'advanced'),(3,'novice'),(4,'beginner'),(5,'intermediate'),
  (6,'novice'),(7,'advanced'),(8,'intermediate'),(9,'beginner'),(10,'newbie'),
  (11,'novice'),(12,'intermediate'),(13,'advanced'),(14,'beginner'),(15,'intermediate'),
  (16,'newbie'),(17,'novice'),(18,'intermediate'),(19,'advanced'),(20,'beginner')
) l(n, lvl)
on conflict (user_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- Cleanup (run separately). Participants first in case any registered.
-- ---------------------------------------------------------------------------
-- begin;
-- delete from public.participants
--  where user_id in (select id from auth.users where email like '%@twogether.dev')
--     or registered_by in (select id from auth.users where email like '%@twogether.dev');
-- delete from auth.users where email like '%@twogether.dev';
-- commit;
