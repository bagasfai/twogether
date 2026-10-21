-- Photo gallery moderation (docs/superpowers/specs/2026-10-21-gallery-design.md).
-- Sections:
--   1. gallery_photos columns (status, reviewed_by, reviewed_at, unique path)
--   2. can_review_gallery()
--   3. privileges and policies
--   4. can_upload_to_gallery()
--   5. add_gallery_photo()
--   6. review_gallery_photo()
--   (JB012-JB016 are allocated for the gallery RPCs: JB012 upload not eligible,
--    JB013 upload window closed, JB014 pending cap reached, JB015 invalid upload
--    path, JB016 invalid state.)

-- ---- 1. gallery_photos columns ----

-- No 'rejected' value: rejecting a photo deletes the row.
create type public.gallery_photo_status as enum ('pending', 'approved');

alter table public.gallery_photos
  add column status public.gallery_photo_status not null default 'pending',
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add constraint gallery_photos_storage_path_key unique (storage_path),
  -- Applies to add_gallery_photo and to a host's column-granted caption
  -- UPDATE alike.
  add constraint gallery_photos_caption_len_check
    check (char_length(caption) <= 200);

create index gallery_photos_gallery_status_idx
  on public.gallery_photos (gallery_id, status);

-- ---- 2. can_review_gallery ----

-- True for an admin, or a host (owner or co-host) of the album's session.
-- Unlinked albums are reviewable by admins only. SECURITY DEFINER so Storage
-- policies and RPCs can call it without needing read access to galleries.
create or replace function public.can_review_gallery(p_gallery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
      or exists (
        select 1
          from public.galleries g
         where g.id = p_gallery_id
           and g.session_id is not null
           and public.is_session_host(g.session_id)
      );
$$;

revoke execute on function public.can_review_gallery(uuid) from public, anon;
grant execute on function public.can_review_gallery(uuid) to authenticated;

-- ---- 3. privileges and policies ----

-- Rows are created only by add_gallery_photo; status/reviewed_*/storage_path
-- change only inside review_gallery_photo. Hosts edit caption and sort_order.
revoke insert, update, delete on public.gallery_photos from authenticated;
grant delete on public.gallery_photos to authenticated;
grant update (caption, sort_order) on public.gallery_photos to authenticated;

drop policy gallery_photos_select on public.gallery_photos;
drop policy gallery_photos_write on public.gallery_photos;

create policy gallery_photos_select_anon on public.gallery_photos
  for select to anon
  using (status = 'approved');

create policy gallery_photos_select_authenticated on public.gallery_photos
  for select to authenticated
  using (
    status = 'approved'
    or uploaded_by = auth.uid()
    or public.can_review_gallery(gallery_id)
  );

create policy gallery_photos_update_reviewer on public.gallery_photos
  for update to authenticated
  using (public.can_review_gallery(gallery_id))
  with check (public.can_review_gallery(gallery_id));

-- The uploader may withdraw their photo only while it is still pending.
create policy gallery_photos_delete on public.gallery_photos
  for delete to authenticated
  using (
    public.can_review_gallery(gallery_id)
    or (uploaded_by = auth.uid() and status = 'pending')
  );

-- ---- 4. can_upload_to_gallery ----

-- True for an admin, a host (owner or co-host) of the album's session, or a
-- confirmed, checked-in participant of that session until 7 days after
-- sessions.ends_at. Unlinked albums are admin-only. Returns false for an
-- unknown album or a caller without claims (auth.uid() null matches no row).
create or replace function public.can_upload_to_gallery(p_gallery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
      or exists (
        select 1
          from public.galleries g
         where g.id = p_gallery_id
           and g.session_id is not null
           and (
             public.is_session_host(g.session_id)
             or exists (
               select 1
                 from public.participants p
                 join public.sessions s on s.id = p.session_id
                where p.session_id = g.session_id
                  and p.user_id = auth.uid()
                  and p.status = 'confirmed'
                  and p.checked_in_at is not null
                  and now() <= s.ends_at + interval '7 days'
             )
           )
      );
$$;

revoke execute on function public.can_upload_to_gallery(uuid) from public, anon;
grant execute on function public.can_upload_to_gallery(uuid) to authenticated;

-- ---- 5. add_gallery_photo ----

-- The only way a gallery_photos row is created. Steps, in this order:
--   1. JB004 without auth.uid(); then an advisory xact lock on the
--      (gallery, user) pair, taken before the eligibility check and the cap
--      count, so two parallel uploads by the same user serialise and cannot
--      both slip under the cap. Different users never contend.
--   2. Eligibility (can_upload_to_gallery; an unknown album is also JB012).
--      When it fails, a confirmed, checked-in participant of the album's
--      session is past the 7-day window: JB013. Anyone else: JB012.
--   3. Path (JB015): must start with '<gallery_id>/', must not already be a
--      gallery_photos row, and must match a storage.objects row in the
--      'gallery' bucket uploaded by the caller. No row exists without its file.
--   4. Cap (JB014): non-reviewers may hold at most 20 pending photos per album.
--   5. Insert: reviewers (admin, or host/co-host of the album's session) get
--      'approved' with reviewed_by/reviewed_at set; everyone else 'pending'.
--      sort_order = max + 1 (0 for an empty album). Ties between different
--      users uploading concurrently are harmless: display orders by
--      sort_order, created_at. The caption is trimmed of spaces, tabs, CR
--      and LF; blank becomes null. Over 200 characters fails the
--      gallery_photos_caption_len_check constraint (SQLSTATE 23514).
--
-- Storage owner column: storage.objects has both owner (uuid, the older
-- column) and owner_id (text, the newer one). Probing the local stack
-- (storage-api v1.72.1) with a real authenticated upload showed the Storage
-- API populates BOTH with the uploader's id. Supabase marks owner as
-- deprecated in favour of owner_id, so the check accepts either column:
-- owner_id = auth.uid()::text or owner = auth.uid(). That keeps working if a
-- later Storage version stops writing owner. The Storage policies (Task 9)
-- must use the same ownership rule:
-- (o.owner_id = auth.uid()::text or o.owner = auth.uid()).
create or replace function public.add_gallery_photo(
  p_gallery_id uuid,
  p_path text,
  p_caption text
)
returns public.gallery_photos
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session_id uuid;
  v_is_reviewer boolean;
  v_row public.gallery_photos;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_gallery_id::text || ':' || v_uid::text, 0)
  );

  select g.session_id into v_session_id
    from public.galleries g
   where g.id = p_gallery_id;

  if not found or not public.can_upload_to_gallery(p_gallery_id) then
    if exists (
      select 1
        from public.participants p
       where p.session_id = v_session_id
         and p.user_id = v_uid
         and p.status = 'confirmed'
         and p.checked_in_at is not null
    ) then
      raise exception 'upload window closed' using errcode = 'JB013';
    end if;
    raise exception 'not eligible to upload to this album' using errcode = 'JB012';
  end if;

  if p_path is null
     or length(p_path) <= 37
     or left(p_path, 37) <> p_gallery_id::text || '/' then
    raise exception 'upload path must start with the album id' using errcode = 'JB015';
  end if;

  if exists (select 1 from public.gallery_photos gp where gp.storage_path = p_path) then
    raise exception 'upload path already used' using errcode = 'JB015';
  end if;

  if not exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'gallery'
       and o.name = p_path
       and (o.owner_id = v_uid::text or o.owner = v_uid)
  ) then
    raise exception 'no uploaded file at this path' using errcode = 'JB015';
  end if;

  v_is_reviewer := public.can_review_gallery(p_gallery_id);

  if not v_is_reviewer and (
    select count(*)
      from public.gallery_photos gp
     where gp.gallery_id = p_gallery_id
       and gp.uploaded_by = v_uid
       and gp.status = 'pending'
  ) >= 20 then
    raise exception 'pending photo limit reached' using errcode = 'JB014';
  end if;

  insert into public.gallery_photos
    (gallery_id, storage_path, caption, sort_order, uploaded_by,
     status, reviewed_by, reviewed_at)
  values (
    p_gallery_id,
    p_path,
    nullif(btrim(p_caption, E' \t\r\n'), ''),
    coalesce((select max(gp.sort_order) from public.gallery_photos gp
               where gp.gallery_id = p_gallery_id), -1) + 1,
    v_uid,
    case when v_is_reviewer then 'approved' else 'pending' end::public.gallery_photo_status,
    case when v_is_reviewer then v_uid end,
    case when v_is_reviewer then now() end
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.add_gallery_photo(uuid, text, text) from public, anon;
grant execute on function public.add_gallery_photo(uuid, text, text) to authenticated;

-- ---- 6. review_gallery_photo ----

-- Approve or reject a pending photo. Steps, in this order:
--   1. JB004 without auth.uid().
--   2. select ... for update on the photo row, so an approve and a reject of
--      the same photo serialise: the loser waits, then sees the row approved
--      (JB016) or gone (JB008). Unknown id: JB008.
--   3. JB007 unless can_review_gallery(gallery_id): admin, or host/co-host of
--      the album's session. An album whose session was deleted is admin-only.
--   4. JB016 for an action other than 'approve'/'reject' (including null),
--      or a photo that is not pending.
--   5. approve: status 'approved', reviewed_by/reviewed_at set; returns null.
--      reject: deletes the row and returns its storage_path, so the caller
--      can remove the file through the Storage API.
create or replace function public.review_gallery_photo(
  p_photo_id uuid,
  p_action text
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_photo public.gallery_photos;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  select gp.* into v_photo
    from public.gallery_photos gp
   where gp.id = p_photo_id
     for update;

  if not found then
    raise exception 'photo not found' using errcode = 'JB008';
  end if;

  if not public.can_review_gallery(v_photo.gallery_id) then
    raise exception 'not authorized to review this photo' using errcode = 'JB007';
  end if;

  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception 'action must be approve or reject' using errcode = 'JB016';
  end if;

  if v_photo.status <> 'pending' then
    raise exception 'photo is not pending' using errcode = 'JB016';
  end if;

  if p_action = 'approve' then
    update public.gallery_photos
       set status = 'approved',
           reviewed_by = v_uid,
           reviewed_at = now()
     where id = v_photo.id;
    return null;
  end if;

  delete from public.gallery_photos where id = v_photo.id;
  return v_photo.storage_path;
end;
$$;

revoke execute on function public.review_gallery_photo(uuid, text) from public, anon;
grant execute on function public.review_gallery_photo(uuid, text) to authenticated;
