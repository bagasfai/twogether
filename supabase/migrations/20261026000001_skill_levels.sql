create type public.gender as enum ('male', 'female');
create type public.skill_level as enum ('newbie', 'beginner', 'novice', 'intermediate', 'advanced');

-- Host/admin-only: a plain member must never read this table, not even own row.
create table public.member_levels (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  level public.skill_level not null,
  set_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create trigger member_levels_set_updated_at
before update on public.member_levels
for each row execute function public.set_updated_at();

alter table public.member_levels enable row level security;

revoke all on public.member_levels from anon, authenticated;
grant select, insert, update on public.member_levels to authenticated;

create policy member_levels_select on public.member_levels
  for select to authenticated
  using (public.current_user_role() in ('host', 'admin'));

create policy member_levels_insert on public.member_levels
  for insert to authenticated
  with check (public.current_user_role() in ('host', 'admin'));

create policy member_levels_update on public.member_levels
  for update to authenticated
  using (public.current_user_role() in ('host', 'admin'))
  with check (public.current_user_role() in ('host', 'admin'));
