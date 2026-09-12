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
