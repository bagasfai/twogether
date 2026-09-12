-- Jakbar Twogether — initial Core-tier schema
--
-- Tables: profiles, sessions, session_co_hosts, participants, courts,
-- matches, match_players, announcements, galleries, gallery_photos.
--
-- Concurrency-safe registration (Section 3, rule 1):
--   `register_for_session` locks the target `sessions` row (SELECT ... FOR
--   UPDATE) before counting confirmed/waitlisted participants. Locking the
--   session row serializes every concurrent registration attempt for that
--   session through this one function, so "check count, then insert" can't
--   race — the second caller simply waits for the lock and then sees the
--   first caller's committed row before making its own decision.
--
--   Waitlist promotion is a trigger (`maintain_session_waitlist`) on
--   `participants`, not application code, so it fires identically whether a
--   spot opens via a member's self-cancel or a host's manual override.

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  playing_level text,
  role text not null default 'member' check (role in ('member', 'host', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Extends auth.users with app-specific profile fields and role.';

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id),
  title text not null,
  description text,
  location text not null,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  court_count int not null check (court_count > 0),
  max_participants int not null check (max_participants > 0),
  waitlist_capacity int not null default 0 check (waitlist_capacity >= 0),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  registration_status text not null default 'not_open'
    check (registration_status in ('not_open', 'open', 'closed')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_session_date_idx on public.sessions (session_date);
create index sessions_host_id_idx on public.sessions (host_id);

create table public.session_co_hosts (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'waiting_list', 'cancelled')),
  waitlist_position int,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A user can have at most one *active* (non-cancelled) registration per
-- session, but can re-register after cancelling.
create unique index participants_session_user_active_idx
  on public.participants (session_id, user_id)
  where (status <> 'cancelled');

create index participants_session_status_idx on public.participants (session_id, status);
create index participants_user_id_idx on public.participants (user_id);

comment on table public.participants is
  'Registered participants for a session. Checked-in state lives here but is a distinct pool from registration status for court/match purposes — see `checked_in`.';

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  court_number int not null,
  status text not null default 'idle'
    check (status in ('idle', 'in_use', 'maintenance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, court_number)
);

create index courts_session_id_idx on public.courts (session_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  court_id uuid references public.courts (id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_session_id_idx on public.matches (session_id);
create index matches_court_id_idx on public.matches (court_id);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  -- References the checked-in participant, not just the registration —
  -- match rosters are drawn from the checked-in pool (Section 3, rule 4).
  participant_id uuid not null references public.participants (id) on delete cascade,
  team smallint check (team in (1, 2)),
  primary key (match_id, participant_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_session_id_idx on public.announcements (session_id);

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index gallery_photos_gallery_id_idx on public.gallery_photos (gallery_id);

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();
create trigger trg_participants_updated_at before update on public.participants
  for each row execute function public.set_updated_at();
create trigger trg_courts_updated_at before update on public.courts
  for each row execute function public.set_updated_at();
create trigger trg_matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();
create trigger trg_announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Auth integration: auto-create a profile on signup
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'member');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Role helper functions (SECURITY DEFINER so RLS policies can call them
-- without recursing into the very tables they're checking)
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_host_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('host', 'admin')
  );
$$;

create or replace function public.is_session_host(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.sessions s
      where s.id = p_session_id and s.host_id = auth.uid()
    )
    or exists (
      select 1 from public.session_co_hosts sc
      where sc.session_id = p_session_id and sc.user_id = auth.uid()
    );
$$;

-- Prevent members from granting themselves a role via a direct profile update.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for requests made with the service_role key (or raw
  -- SQL run directly against the database) — i.e. not a user-driven request
  -- through the anon/authenticated API. Those are implicitly trusted (the
  -- service_role key already bypasses RLS), and are the only way to bootstrap
  -- the very first host/admin. Requests carrying a user's own JWT still get
  -- the admin check.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can change a profile role';
  end if;
  return new;
end;
$$;

create trigger trg_protect_profile_role
  before update of role on public.profiles
  for each row execute function public.protect_profile_role();

-- ============================================================================
-- Registration + waitlist (Section 3, rule 1)
-- ============================================================================

create or replace function public.register_for_session(p_session_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_confirmed_count int;
  v_waiting_count int;
  v_status text;
  v_waitlist_position int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Locking the session row serializes every concurrent registration
  -- attempt for this session through this point — see file header.
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'Session not found';
  end if;

  if v_session.registration_status <> 'open' then
    raise exception 'Registration is not open for this session';
  end if;

  if exists (
    select 1 from public.participants
    where session_id = p_session_id and user_id = v_user_id and status <> 'cancelled'
  ) then
    raise exception 'Already registered for this session';
  end if;

  select count(*) into v_confirmed_count
  from public.participants
  where session_id = p_session_id and status = 'confirmed';

  if v_confirmed_count < v_session.max_participants then
    insert into public.participants (session_id, user_id, status)
    values (p_session_id, v_user_id, 'confirmed');
    v_status := 'confirmed';
  else
    select count(*) into v_waiting_count
    from public.participants
    where session_id = p_session_id and status = 'waiting_list';

    if v_waiting_count >= v_session.waitlist_capacity then
      raise exception 'Session and waitlist are full';
    end if;

    v_waitlist_position := v_waiting_count + 1;
    insert into public.participants (session_id, user_id, status, waitlist_position)
    values (p_session_id, v_user_id, 'waiting_list', v_waitlist_position);
    v_status := 'waiting_list';
  end if;

  return json_build_object('status', v_status, 'waitlist_position', v_waitlist_position);
end;
$$;

grant execute on function public.register_for_session(uuid) to authenticated;

create or replace function public.cancel_registration(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.participants
  set status = 'cancelled', cancelled_at = now()
  where session_id = p_session_id
    and user_id = v_user_id
    and status in ('confirmed', 'waiting_list');

  if not found then
    raise exception 'No active registration found for this session';
  end if;
end;
$$;

grant execute on function public.cancel_registration(uuid) to authenticated;

-- Host-facing manual override (Section 3, rule 3): add/remove/override a
-- participant's status regardless of capacity. Goes through the same
-- `participants` table + trigger as self-service, so waitlist promotion
-- still fires consistently.
create or replace function public.host_set_participant_status(
  p_participant_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  select session_id into v_session_id from public.participants where id = p_participant_id;
  if v_session_id is null then
    raise exception 'Participant not found';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'Not authorized to manage this session';
  end if;

  if p_status not in ('confirmed', 'waiting_list', 'cancelled') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.participants
  set
    status = p_status,
    cancelled_at = case when p_status = 'cancelled' then now() else null end
  where id = p_participant_id;
end;
$$;

grant execute on function public.host_set_participant_status(uuid, text) to authenticated;

create or replace function public.host_add_participant(
  p_session_id uuid,
  p_user_id uuid,
  p_status text default 'confirmed'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_session_host(p_session_id) then
    raise exception 'Not authorized to manage this session';
  end if;

  if p_status not in ('confirmed', 'waiting_list') then
    raise exception 'Invalid status: %', p_status;
  end if;

  insert into public.participants (session_id, user_id, status, added_by)
  values (p_session_id, p_user_id, p_status, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.host_add_participant(uuid, uuid, text) to authenticated;

-- Waitlist promotion trigger — fires on any status change, insert, or
-- delete on `participants` so a host override and a member self-cancel are
-- handled by the exact same code path.
create or replace function public.maintain_session_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_session public.sessions%rowtype;
  v_confirmed_count int;
  v_next_id uuid;
begin
  -- The promotions below re-trigger this function; only the outermost
  -- invocation needs to do the work, inner ones would just repeat it.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  v_session_id := coalesce(new.session_id, old.session_id);

  -- Lock the session row so this reconciliation can't race with a
  -- concurrent `register_for_session` call — see file header.
  select * into v_session from public.sessions where id = v_session_id for update;

  loop
    select count(*) into v_confirmed_count
    from public.participants
    where session_id = v_session_id and status = 'confirmed';

    exit when v_confirmed_count >= v_session.max_participants;

    select id into v_next_id
    from public.participants
    where session_id = v_session_id and status = 'waiting_list'
    order by registered_at asc
    limit 1;

    exit when v_next_id is null;

    update public.participants
    set status = 'confirmed', waitlist_position = null
    where id = v_next_id;
  end loop;

  -- Keep remaining waitlist positions contiguous.
  with ordered as (
    select id, row_number() over (order by registered_at asc) as rn
    from public.participants
    where session_id = v_session_id and status = 'waiting_list'
  )
  update public.participants p
  set waitlist_position = ordered.rn
  from ordered
  where p.id = ordered.id and p.waitlist_position is distinct from ordered.rn;

  return null;
end;
$$;

create trigger trg_maintain_waitlist
  after insert or update of status or delete on public.participants
  for each row execute function public.maintain_session_waitlist();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_co_hosts enable row level security;
alter table public.participants enable row level security;
alter table public.courts enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.announcements enable row level security;
alter table public.galleries enable row level security;
alter table public.gallery_photos enable row level security;

-- profiles: any signed-in user can see basic profile info (names show up in
-- participant lists); only the owner or an admin can change a row, and the
-- protect_profile_role trigger above blocks self-promotion.
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());

-- sessions: published sessions are publicly visible (marketing site,
-- browsing to register); hosts/admins also see their own drafts.
create policy "sessions_select_public_or_host" on public.sessions
  for select using (status <> 'draft' or public.is_session_host(id));
create policy "sessions_insert_host" on public.sessions
  for insert with check (public.is_host_or_admin() and (host_id = auth.uid() or public.is_admin()));
create policy "sessions_update_host" on public.sessions
  for update using (public.is_session_host(id)) with check (public.is_session_host(id));
create policy "sessions_delete_host" on public.sessions
  for delete using (public.is_session_host(id));

create policy "session_co_hosts_select_host" on public.session_co_hosts
  for select using (public.is_session_host(session_id));
create policy "session_co_hosts_all_host" on public.session_co_hosts
  for all using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));

-- participants: members see their own registrations; hosts/admins see and
-- manage everyone registered to a session they run. No insert/update policy
-- for plain members — registration and cancellation go through the RPCs
-- above (SECURITY DEFINER, owned by a role that bypasses RLS), which keeps
-- the atomic capacity/waitlist logic as the only write path.
create policy "participants_select_own_or_host" on public.participants
  for select using (user_id = auth.uid() or public.is_session_host(session_id));
create policy "participants_insert_host" on public.participants
  for insert with check (public.is_session_host(session_id));
create policy "participants_update_host" on public.participants
  for update using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
create policy "participants_delete_admin" on public.participants
  for delete using (public.is_admin());

-- courts / matches / match_players: visible once the session isn't a draft,
-- or always to that session's host/admin; only host/admin can write.
create policy "courts_select_public_or_host" on public.courts
  for select using (
    public.is_session_host(session_id)
    or exists (select 1 from public.sessions s where s.id = session_id and s.status <> 'draft')
  );
create policy "courts_all_host" on public.courts
  for all using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));

create policy "matches_select_public_or_host" on public.matches
  for select using (
    public.is_session_host(session_id)
    or exists (select 1 from public.sessions s where s.id = session_id and s.status <> 'draft')
  );
create policy "matches_all_host" on public.matches
  for all using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));

create policy "match_players_select_public_or_host" on public.match_players
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          public.is_session_host(m.session_id)
          or exists (select 1 from public.sessions s where s.id = m.session_id and s.status <> 'draft')
        )
    )
  );
create policy "match_players_all_host" on public.match_players
  for all
  using (exists (select 1 from public.matches m where m.id = match_id and public.is_session_host(m.session_id)))
  with check (exists (select 1 from public.matches m where m.id = match_id and public.is_session_host(m.session_id)));

-- announcements: community-wide (session_id is null) posts are visible to
-- everyone; session-scoped ones follow that session's visibility.
create policy "announcements_select_public_or_host" on public.announcements
  for select using (
    session_id is null
    or public.is_session_host(session_id)
    or exists (select 1 from public.sessions s where s.id = session_id and s.status <> 'draft')
  );
create policy "announcements_insert_host_or_admin" on public.announcements
  for insert with check (
    case when session_id is null then public.is_admin() else public.is_session_host(session_id) end
  );
create policy "announcements_update_host_or_admin" on public.announcements
  for update using (
    case when session_id is null then public.is_admin() else public.is_session_host(session_id) end
  );
create policy "announcements_delete_host_or_admin" on public.announcements
  for delete using (
    case when session_id is null then public.is_admin() else public.is_session_host(session_id) end
  );

-- galleries / gallery_photos: same visibility shape as announcements.
create policy "galleries_select_public_or_host" on public.galleries
  for select using (
    session_id is null
    or public.is_session_host(session_id)
    or exists (select 1 from public.sessions s where s.id = session_id and s.status <> 'draft')
  );
create policy "galleries_all_host_or_admin" on public.galleries
  for all using (
    case when session_id is null then public.is_admin() else public.is_session_host(session_id) end
  );

create policy "gallery_photos_select_public_or_host" on public.gallery_photos
  for select using (
    exists (
      select 1 from public.galleries g
      where g.id = gallery_id
        and (
          g.session_id is null
          or public.is_session_host(g.session_id)
          or exists (select 1 from public.sessions s where s.id = g.session_id and s.status <> 'draft')
        )
    )
  );
create policy "gallery_photos_all_host_or_admin" on public.gallery_photos
  for all using (
    exists (
      select 1 from public.galleries g
      where g.id = gallery_id
        and (case when g.session_id is null then public.is_admin() else public.is_session_host(g.session_id) end)
    )
  );
