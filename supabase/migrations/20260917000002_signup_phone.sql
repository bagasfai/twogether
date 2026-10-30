-- Phone becomes a required field on the sign-up form (lib/validation/auth.ts
-- enforces it client- and server-side before calling supabase.auth.signUp).
-- It travels the same way full_name already does: through
-- raw_user_meta_data, picked up here by the same SECURITY DEFINER trigger
-- that creates the profiles/profiles_private rows.
--
-- profiles_private.phone stays nullable at the column level rather than
-- gaining a NOT NULL constraint: this trigger also fires for the Google
-- OAuth path (signInWithGoogle), which collects no phone number and cannot
-- be made to. A NOT NULL here would make every OAuth sign-up fail this
-- trigger outright. The "required" invariant is therefore enforced only for
-- accounts created through our own form, not at the database level -- flag
-- this if Google sign-in is ever turned on and a phone becomes load-bearing
-- for some flow (e.g. a host needing to reach every registrant).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.profiles_private (user_id, phone)
  values (new.id, new.raw_user_meta_data ->> 'phone')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
