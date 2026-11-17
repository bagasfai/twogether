-- gallery_delete: the owner branch no longer reaches the file behind an
-- approved photo. Before, a member could remove that file through the Storage
-- API; the gallery_photos row stayed and the public tile broke.
--
-- The owner can still delete a file behind a pending photo, and a file with no
-- row (an upload whose add_gallery_photo failed). Reviewers are unchanged.
-- deleteGalleryPhoto removes the row before the file, so an owner deleting
-- their own pending photo still works.
--
-- gallery_select is left as it is. It stays at least as wide as
-- gallery_delete, which is all a DELETE needs (20261021000003 header).
-- The subquery reads gallery_photos as the caller; approved rows are visible
-- to every authenticated user (gallery_photos_select_authenticated).

drop policy gallery_delete on storage.objects;

create policy gallery_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gallery'
    and (
      ((owner_id = auth.uid()::text or owner = auth.uid())
        and not exists (
          select 1 from public.gallery_photos gp
           where gp.storage_path = name
             and gp.status = 'approved'))
      or case
        when (storage.foldername(name))[1]
             ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.can_review_gallery(((storage.foldername(name))[1])::uuid)
        else false
      end
    )
  );
