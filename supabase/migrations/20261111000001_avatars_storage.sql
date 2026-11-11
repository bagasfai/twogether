-- Avatars Storage bucket and policies
-- (docs/superpowers/specs/2026-11-11-profile-avatars-design.md, section 1).
--
-- One public bucket, objects at '{auth.uid()}/avatar.webp' or
-- '{auth.uid()}/avatar.jpg' (jpg exists because WebKit cannot encode webp).
-- Public reads go through the bucket's public URL and need no policy.
--
-- The first path segment is compared as text to auth.uid()::text, so a
-- malformed path is denied by policy (42501) and never raises a cast error.
--
-- avatars_select exists for the same reason as gallery_select
-- (20261021000003_gallery_storage.sql): a DELETE or upsert UPDATE with a WHERE
-- only reaches rows that also pass a SELECT policy. It grants the owner folder
-- and admins nothing wider, so other members and anon cannot list the bucket.
--
-- profiles.avatar_url gets no check constraint: legacy rows and OAuth (Google)
-- URLs must stay valid. The server action restricts what it writes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  524288,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/avatar\.(webp|jpg)$')
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/avatar\.(webp|jpg)$')
  );

create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
