grant usage on schema public to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_hosts enable row level security;
alter table public.participants enable row level security;

-- Make the privilege set on these four tables authoritative rather than
-- inherited from Supabase's default privileges: strip whatever anon and
-- authenticated were granted by default, then grant back exactly the set
-- this migration intends. Scoped to these four tables only — task 9 owns
-- courts, matches, match_players, announcements, and galleries.
revoke all on public.profiles, public.sessions, public.session_hosts, public.participants
  from anon, authenticated;

grant select, update, delete on public.profiles to authenticated;
grant select on public.sessions to anon, authenticated;
grant insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.session_hosts to authenticated;
grant select, update, delete on public.participants to authenticated;

-- profiles
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- sessions
create policy sessions_select_public_or_host on public.sessions
  for select to anon, authenticated
  using (
    status in ('scheduled', 'live', 'completed')
    or public.is_session_host(id)
  );

create policy sessions_insert_host on public.sessions
  for insert to authenticated
  with check (
    public.current_user_role() in ('host', 'admin')
    and created_by = auth.uid()
  );

create policy sessions_update_host on public.sessions
  for update to authenticated
  using (public.is_session_host(id))
  with check (public.is_session_host(id));

create policy sessions_delete_host on public.sessions
  for delete to authenticated
  using (public.is_session_host(id));

-- session_hosts
create policy session_hosts_select_authenticated on public.session_hosts
  for select to authenticated
  using (true);

create policy session_hosts_insert_owner on public.session_hosts
  for insert to authenticated
  with check (public.is_session_owner(session_id));

create policy session_hosts_update_owner on public.session_hosts
  for update to authenticated
  using (public.is_session_owner(session_id))
  with check (public.is_session_owner(session_id));

create policy session_hosts_delete_owner on public.session_hosts
  for delete to authenticated
  using (public.is_session_owner(session_id));

-- participants
-- Deliberately no INSERT policy and no member UPDATE policy: registration and
-- cancellation go through the SECURITY DEFINER RPCs in task 10, which is what
-- makes the advisory lock the only possible path and therefore airtight.
create policy participants_select_self_host_or_public on public.participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_session_host(session_id)
    or (status <> 'cancelled' and public.session_is_public(session_id))
  );

create policy participants_update_host on public.participants
  for update to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

create policy participants_delete_host on public.participants
  for delete to authenticated
  using (public.is_session_host(session_id));
