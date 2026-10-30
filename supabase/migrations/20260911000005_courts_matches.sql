create table public.courts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  court_number int not null check (court_number > 0),
  status public.court_status not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, court_number)
);

create trigger courts_set_updated_at
before update on public.courts
for each row execute function public.set_updated_at();

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  court_id uuid references public.courts (id) on delete set null,
  status public.match_status not null default 'scheduled',
  queue_position int,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_session_status_idx on public.matches (session_id, status);

create index matches_active_court_idx
  on public.matches (court_id)
  where status = 'in_progress';

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  team smallint not null check (team in (1, 2)),
  primary key (match_id, participant_id)
);

create index match_players_participant_idx on public.match_players (participant_id);

-- Rule 4: matches operate on the checked-in pool, not the registration list.
create or replace function public.guard_match_player()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_match_session uuid;
  v_participant_session uuid;
  v_checked_in timestamptz;
begin
  select session_id into v_match_session
    from public.matches where id = new.match_id;

  select session_id, checked_in_at into v_participant_session, v_checked_in
    from public.participants where id = new.participant_id;

  if v_match_session is distinct from v_participant_session then
    raise exception 'participant belongs to a different session'
      using errcode = 'JB005';
  end if;

  if v_checked_in is null then
    raise exception 'participant is not checked in'
      using errcode = 'JB005';
  end if;

  return new;
end;
$$;

create trigger match_players_guard
before insert or update on public.match_players
for each row execute function public.guard_match_player();
