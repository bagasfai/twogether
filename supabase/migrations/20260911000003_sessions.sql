create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  location_url text,
  court_count int not null default 1 check (court_count > 0),
  max_participants int not null check (max_participants > 0),
  waitlist_capacity int not null default 0 check (waitlist_capacity >= 0),
  registration_state public.registration_state not null default 'closed',
  status public.session_status not null default 'draft',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_time_order check (ends_at > starts_at)
);

create index sessions_upcoming_idx
  on public.sessions (starts_at)
  where status = 'scheduled';

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

create table public.session_hosts (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.session_host_role not null default 'cohost',
  added_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index session_hosts_user_idx on public.session_hosts (user_id);

create or replace function public.add_session_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.session_hosts (session_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (session_id, user_id) do nothing;
  return new;
end;
$$;

create trigger sessions_add_owner
after insert on public.sessions
for each row execute function public.add_session_owner();
