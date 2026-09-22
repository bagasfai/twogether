-- Covers migration 20260917000002_signup_phone.sql: handle_new_user now also
-- copies raw_user_meta_data->>'phone' into profiles_private.phone. The
-- column stays nullable at the database level because the Google OAuth path
-- (signInWithGoogle) fires the same trigger with no phone in its metadata --
-- "required" is only enforced by lib/validation/auth.ts's signUpSchema, on
-- our own signup form.

begin;
select plan(5);

select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles_private' and column_name = 'phone'),
  'YES',
  'profiles_private.phone stays nullable so the no-metadata OAuth path cannot fail the trigger'
);

-- Our own signup form: full_name and phone both present in metadata.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'form-signup@test.local',
   '{"full_name": "Form Signup", "phone": "+628111000001"}'::jsonb);

select is(
  (select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Form Signup',
  'handle_new_user still copies full_name into profiles, unchanged by this migration'
);

select is(
  (select phone from public.profiles_private where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '+628111000001',
  'handle_new_user copies raw_user_meta_data phone into profiles_private.phone'
);

-- Google OAuth path: no phone (and, in practice, no full_name either) in
-- metadata at all. Must not raise -- a NOT NULL here would fail every OAuth
-- sign-up outright.
select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values
       ('aaaaaaaa-0000-0000-0000-000000000002', 'oauth-signup@test.local', '{}'::jsonb) $$,
  'a sign-up with no phone in metadata (the OAuth path) does not raise'
);

select is(
  (select phone from public.profiles_private where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  null,
  'a profiles_private row is still created for the OAuth path, with phone left null'
);

select * from finish();
rollback;
