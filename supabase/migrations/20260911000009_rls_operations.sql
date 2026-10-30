alter table public.courts enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.announcements enable row level security;
alter table public.galleries enable row level security;
alter table public.gallery_photos enable row level security;

-- Task 8 made the privilege set on profiles/sessions/session_hosts/participants
-- authoritative rather than inherited from Supabase's default privileges. These
-- six tables still carry that default set for anon/authenticated, so strip it
-- here before granting back exactly the set this migration intends. Scoped to
-- these six tables only — task 8's four tables are already correct and are
-- not touched.
revoke all on public.courts, public.matches, public.match_players,
              public.announcements, public.galleries, public.gallery_photos
  from anon, authenticated;

grant select, insert, update, delete on public.courts to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.match_players to authenticated;
grant select on public.announcements to anon;
grant select, insert, update, delete on public.announcements to authenticated;
grant select on public.galleries, public.gallery_photos to anon;
grant select, insert, update, delete on public.galleries to authenticated;
grant select, insert, update, delete on public.gallery_photos to authenticated;

-- courts
create policy courts_select on public.courts
  for select to authenticated
  using (public.session_is_public(session_id) or public.is_session_host(session_id));

create policy courts_write on public.courts
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

-- matches
create policy matches_select on public.matches
  for select to authenticated
  using (public.session_is_public(session_id) or public.is_session_host(session_id));

create policy matches_write on public.matches
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

-- match_players resolves its session through matches
create policy match_players_select on public.match_players
  for select to authenticated
  using (exists (
    select 1 from public.matches m
     where m.id = match_id
       and (public.session_is_public(m.session_id) or public.is_session_host(m.session_id))
  ));

create policy match_players_write on public.match_players
  for all to authenticated
  using (exists (
    select 1 from public.matches m
     where m.id = match_id and public.is_session_host(m.session_id)
  ))
  with check (exists (
    select 1 from public.matches m
     where m.id = match_id and public.is_session_host(m.session_id)
  ));

-- announcements
-- The `or public.is_admin()` disjunct exists because a community-wide draft
-- (session_id is null, published_at is null) satisfies neither of the other
-- two branches: the first requires published_at is not null, the second
-- requires session_id is not null. Without it, an admin who writes a
-- community draft could never read it back.
create policy announcements_select on public.announcements
  for select to anon, authenticated
  using (
    (published_at is not null
      and (session_id is null or public.session_is_public(session_id)))
    or (session_id is not null and public.is_session_host(session_id))
    or public.is_admin()
  );

create policy announcements_write on public.announcements
  for all to authenticated
  using (
    case when session_id is null
         then public.is_admin()
         else public.is_session_host(session_id)
    end
  )
  with check (
    case when session_id is null
         then public.is_admin()
         else public.is_session_host(session_id)
    end
  );

-- galleries
create policy galleries_select on public.galleries
  for select to anon, authenticated
  using (true);

create policy galleries_write on public.galleries
  for all to authenticated
  using (
    public.is_admin()
    or (session_id is not null and public.is_session_host(session_id))
  )
  with check (
    public.is_admin()
    or (session_id is not null and public.is_session_host(session_id))
  );

create policy gallery_photos_select on public.gallery_photos
  for select to anon, authenticated
  using (true);

create policy gallery_photos_write on public.gallery_photos
  for all to authenticated
  using (exists (
    select 1 from public.galleries g
     where g.id = gallery_id
       and (public.is_admin()
            or (g.session_id is not null and public.is_session_host(g.session_id)))
  ))
  with check (exists (
    select 1 from public.galleries g
     where g.id = gallery_id
       and (public.is_admin()
            or (g.session_id is not null and public.is_session_host(g.session_id)))
  ));
