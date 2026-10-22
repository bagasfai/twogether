-- Photo gallery foundation (docs/superpowers/specs/2026-10-21-gallery-design.md).
-- Nothing in the app ever set sessions.status = 'live', so "an album is
-- created when the session goes live" had no transition to hang off. This
-- migration adds:
--   1. start_session(), the host action that flips scheduled -> live.
--   2. A trigger that creates one album per session on that transition.
--   3. Tighter galleries write policies: hosts used to insert/delete albums
--      for their sessions; now albums come from the trigger (or an admin),
--      and hosts may only edit title/description of their own session's album.

-- sessions.created_by can be null (20260924000002), and the trigger copies it
-- into galleries.created_by, so the album column must tolerate null too and
-- must not block deleting the creator's profile.
alter table public.galleries
  alter column created_by drop not null;

alter table public.galleries
  drop constraint galleries_created_by_fkey,
  add constraint galleries_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

-- One album per session. Partial: unlinked albums (session_id null, including
-- those orphaned by a deleted session) are unconstrained.
create unique index galleries_session_id_key
  on public.galleries (session_id)
  where session_id is not null;

create or replace function public.create_session_gallery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- on conflict makes a session flipped live more than once keep one album.
  insert into public.galleries (session_id, title, created_by)
  values (new.id, new.title, new.created_by)
  on conflict (session_id) where session_id is not null do nothing;
  return new;
end;
$$;

-- Trigger function: never callable as an RPC. The trigger runs it as the
-- function owner, so no role needs EXECUTE.
revoke execute on function public.create_session_gallery() from public, anon, authenticated;

create trigger sessions_create_gallery
after update of status on public.sessions
for each row
when (old.status is distinct from new.status and new.status = 'live')
execute function public.create_session_gallery();

create or replace function public.start_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.session_status;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  -- Not-found is checked before authorization so an unknown id reports
  -- JB008 for every caller; session ids are not secret to authenticated users.
  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'session not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(p_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  -- Row lock: two concurrent starts serialise here, and the loser re-reads
  -- 'live' and gets JB016 instead of both passing the status check.
  select status into v_status
    from public.sessions
   where id = p_session_id
     for update;

  if v_status <> 'scheduled' then
    raise exception 'session is not scheduled' using errcode = 'JB016';
  end if;

  update public.sessions set status = 'live' where id = p_session_id;
end;
$$;

revoke execute on function public.start_session(uuid) from public, anon;
grant execute on function public.start_session(uuid) to authenticated;

drop policy galleries_write on public.galleries;

create policy galleries_insert_admin on public.galleries
  for insert to authenticated
  with check (public.is_admin());

create policy galleries_update_host_or_admin on public.galleries
  for update to authenticated
  using (
    public.is_admin()
    or (session_id is not null and public.is_session_host(session_id))
  )
  with check (
    public.is_admin()
    or (session_id is not null and public.is_session_host(session_id))
  );

create policy galleries_delete_admin on public.galleries
  for delete to authenticated
  using (public.is_admin());

-- The base grant (20260911000009) gives authenticated table-wide UPDATE, and
-- the update policy above only checks the row, not which columns change: a
-- host could re-point session_id at another session they host or null
-- created_by. RLS cannot restrict columns, so narrow the grant itself to the
-- two editable fields. Admins go through the same grant; no app path updates
-- any other galleries column.
revoke update on public.galleries from authenticated;
grant update (title, description) on public.galleries to authenticated;
