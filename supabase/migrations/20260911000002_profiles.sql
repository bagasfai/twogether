create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  role public.user_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- a profile always exists for an auth user
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
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

revoke execute on function public.current_user_role(), public.is_admin() from public;
grant execute on function public.current_user_role(), public.is_admin() to authenticated;

-- RLS WITH CHECK cannot see OLD, so the no-self-promotion rule lives here.
-- The exemption is for callers with no PostgREST JWT at all (migrations,
-- seed.sql, the SQL editor, direct psql) and for service_role — not for
-- auth.uid() is null in general, since the anon role also has a null
-- auth.uid() (no "sub" claim) despite holding a real JWT. Exempting on
-- auth.uid() alone would let anon promote any profile to admin, which
-- defeats the guard entirely. Only the four named contexts are exempt;
-- exempting them is what makes the first admin bootstrappable at all.
-- The "no claims" half of the check also requires the role GUC to not be
-- anon/authenticated, because PostgREST issues `set local role anon` (or
-- authenticated) before executing even on a request that carries no
-- decodable token, so an absent request.jwt.claims GUC alone cannot be
-- trusted to mean "direct connection" — role must corroborate it.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  if new.role is distinct from old.role
     and not public.is_admin()
     and not (
       (v_claims is null and v_role not in ('anon', 'authenticated'))
       or coalesce(v_claims ->> 'role', '') = 'service_role'
     ) then
    raise exception 'only an admin may change a role' using errcode = 'JB004';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_change
before update on public.profiles
for each row execute function public.guard_profile_role_change();
