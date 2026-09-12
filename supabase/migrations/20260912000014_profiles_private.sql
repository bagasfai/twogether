-- phone moves off public.profiles.
--
-- profiles_select_authenticated is `using (true)` and the participant policy
-- exposes full rosters, so while phone lived on profiles any signed-up account
-- could walk roster -> profile and harvest every phone number in the community.
-- Both policies are individually correct; the composition was the problem, and
-- RLS is row-level so no policy can hide one column of a visible row. The
-- column has to live somewhere with its own policy.

create table public.profiles_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_private_set_updated_at
before update on public.profiles_private
for each row execute function public.set_updated_at();

insert into public.profiles_private (user_id, phone)
select id, phone from public.profiles
on conflict (user_id) do nothing;

alter table public.profiles drop column phone;

-- keep the 1:1 invariant the profile row already has, so the profile form can
-- do a plain UPDATE and never an upsert
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

  insert into public.profiles_private (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- backfill rows for any profile that predates this migration
insert into public.profiles_private (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

alter table public.profiles_private enable row level security;

-- authoritative privilege set, not whatever Supabase's defaults granted.
-- No INSERT grant: the SECURITY DEFINER trigger owns row creation.
-- No DELETE grant: the cascade from profiles owns removal.
revoke all on public.profiles_private from anon, authenticated;
grant select, update on public.profiles_private to authenticated;

-- A cancelled participant drops out of host visibility immediately. A host who
-- ran a session keeps access to that player's phone after it completes -- they
-- need to reach no-shows after the fact.
create policy profiles_private_select_self_admin_or_host on public.profiles_private
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.participants p
      where p.user_id = profiles_private.user_id
        and p.status <> 'cancelled'
        and public.is_session_host(p.session_id)
    )
  );

create policy profiles_private_update_self on public.profiles_private
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
