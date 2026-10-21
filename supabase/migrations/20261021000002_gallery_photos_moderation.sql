-- Photo gallery moderation (docs/superpowers/specs/2026-10-21-gallery-design.md).
-- Sections:
--   1. gallery_photos columns (status, reviewed_by, reviewed_at, unique path)
--   2. can_review_gallery()
--   3. privileges and policies
--   4. can_upload_to_gallery()
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
  add constraint gallery_photos_storage_path_key unique (storage_path);

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
