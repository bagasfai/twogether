-- Gallery Storage bucket and policies
-- (docs/superpowers/specs/2026-10-21-gallery-design.md, section "Storage").
--
-- One public bucket, objects at '{gallery_id}/{uuid}.webp'. Public reads go
-- through the bucket's public URL and need no policy.
--
-- Deviation from the spec ("No SELECT policy is needed"): a DELETE whose WHERE
-- reads columns only sees rows that also pass a SELECT policy, and storage-api
-- removes objects with exactly such a DELETE under the caller's role. Probing
-- the local stack showed an owner (who was also admin) get [] back from
-- DELETE /storage/v1/object/gallery with the file left in place when no SELECT
-- policy existed. gallery_select therefore grants visibility with the same
-- rule as gallery_delete (owner or reviewer), and nothing wider: anon and
-- other members still cannot list the bucket through the API.
--
-- The first path segment is cast to uuid only after it matches the UUID
-- regex, inside a CASE: AND/OR do not guarantee evaluation order, so
-- "seg ~ regex and can_upload_to_gallery(seg::uuid)" could still raise a cast
-- error (22P02) on a malformed path instead of being denied by policy (42501).
-- The regex is lower-case only: album ids are written in canonical uuid text
-- form, so an upper-case segment is denied rather than normalised.

-- on conflict do update, so a bucket that already exists (created by hand or
-- by scripts/test-concurrent-gallery-photos.sh) still gets these limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload: admin, host/co-host of the album's session, or a confirmed,
-- checked-in participant within 7 days of ends_at (can_upload_to_gallery).
create policy gallery_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gallery'
    and case
      when (storage.foldername(name))[1]
           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.can_upload_to_gallery(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

-- Select and delete: a reviewer of the album (admin, or host/co-host of its
-- session), or the object's owner. storage-api writes both owner (uuid,
-- deprecated) and owner_id (text); accept either, matching add_gallery_photo.
-- The two policies must stay identical: see the header for why SELECT exists.
create policy gallery_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'gallery'
    and (
      (owner_id = auth.uid()::text or owner = auth.uid())
      or case
        when (storage.foldername(name))[1]
             ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.can_review_gallery(((storage.foldername(name))[1])::uuid)
        else false
      end
    )
  );

create policy gallery_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gallery'
    and (
      (owner_id = auth.uid()::text or owner = auth.uid())
      or case
        when (storage.foldername(name))[1]
             ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.can_review_gallery(((storage.foldername(name))[1])::uuid)
        else false
      end
    )
  );
