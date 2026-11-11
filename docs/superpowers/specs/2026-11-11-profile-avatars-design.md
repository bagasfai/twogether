# Profile avatars: display everywhere, upload, default fallback

Date: 2026-11-11. Status: draft, awaiting review.

## Intent

Show a member's photo wherever the app shows a person's name, let members upload
their own photo, and show an initials avatar when no photo exists. Guests (no
account) always get the initials avatar.

Success: every surface in "Surfaces" renders an avatar; a member can upload,
replace and remove a photo from the profile page; no surface shows a broken
image; no new data becomes visible to anyone who could not already read it.

Out of scope: crop UI beyond a centered square crop, animated avatars,
per-viewer privacy settings, avatars in admin report tables / CSV, WhatsApp
share text, emails.

## Current state (verified in code)

- `profiles.avatar_url text` exists. It is written by `handle_new_user` from
  OAuth metadata and by `updateProfile` (`lib/actions/profile.ts`).
- The profile form (`components/profile/profile-form.tsx`) has a free-text
  "Avatar URL" input. `lib/validation/profile.ts` accepts any URL. Noted as
  design audit M-16.
- No avatar component exists. No avatar bucket exists.
- `profiles_select_authenticated` (`using (true)`) already lets every signed-in
  user read every profile's `avatar_url`.
- Queries that already select `avatar_url`: `getCurrentUser`, `getMyProfile`,
  `listRoster`, `listMatches`, `getRotationQueue`, `listAllMembers`,
  `searchAddableMembers`.
- Queries that do not: `listPublicRoster`, leaderboard RPCs
  (`all_time_leaderboard`, session leaderboard), gallery uploader joins
  (`listPendingPhotos` / `listApprovedPhotos` / `listMyPhotos`),
  `listMembershipsForAdmin`.
- Bucket pattern to follow: `gallery` (public, 5 MB, jpeg/png/webp), with
  `lib/gallery/image.ts` doing client-side resize to webp.

## Decisions

1. **Public bucket `avatars`**, objects at `{user_id}/avatar.webp`. Same model as
   `gallery`: public reads via the bucket URL, writes gated by storage policy.
   Rejected: private bucket with signed URLs (slow lists, breaks ISR/static
   caching for no gain, since `profiles.avatar_url` is already readable by all
   authenticated users and the user id is not guessable).
2. **One fixed object path per user and extension** (`avatar.webp`, or
   `avatar.jpg` where the browser cannot encode webp). Re-upload overwrites
   (upsert) and `setAvatar` removes the other extension, so there are no
   orphaned files. Cache busting through `?v=<epoch ms>` appended to the
   stored URL.
3. **No new dependency.** A small `Avatar` component built on `next/image` /
   `<img>` plus an `onError` fallback. (`@radix-ui/react-avatar` is not a direct
   dependency; adding it needs separate approval and buys little here.)
4. **Avatar data is added to existing query shapes, not new RPCs**, except the
   two leaderboard RPCs, which need a return-column change (see Data).

## Design

### 1. Storage and database (one migration)

`supabase/migrations/<ts>_avatars_storage.sql`:

- Bucket `avatars`: public, `file_size_limit = 524288` (512 KB),
  `allowed_mime_types = {image/webp, image/jpeg, image/png}`. Use
  `on conflict (id) do update`, same as `gallery`.
- Storage policies on `storage.objects`, `bucket_id = 'avatars'`. The first path
  segment is compared as text to `auth.uid()::text`; no uuid cast is needed, so
  no malformed-path error can occur.
  - `avatars_insert` (authenticated): `(storage.foldername(name))[1] = auth.uid()::text`.
  - `avatars_update` (authenticated): same predicate in `using` and `with check`
    (needed for upsert overwrite).
  - `avatars_select` (authenticated): own folder, or `public.is_admin()`. Needed
    for the same DELETE/upsert visibility reason documented in the gallery
    migration; anon and others still cannot list the bucket.
  - `avatars_delete` (authenticated): own folder, or `public.is_admin()`.
- Constrain the object name to exactly `{uid}/avatar.webp` or `{uid}/avatar.jpg`
  in the insert and update `with check`, so a user cannot store arbitrary files
  in their folder. The `.jpg` variant exists because WebKit (all iOS browsers,
  desktop Safari) cannot encode webp; `encodeWithFallback` in
  `lib/gallery/image.ts` then returns jpeg, and the extension must match the
  bytes.
- Column integrity: a `check` on `profiles.avatar_url` is NOT added. Legacy rows
  and OAuth-provided URLs (Google) must stay valid. Enforcement of "own bucket
  only" is in the server action (below).

Role/RLS touchpoints: Member writes own avatar (policy above). Admin may delete
any avatar (moderation). Host: no extra rights. Visitor: no profile reads (anon
has no grant on `profiles`).

### 2. Avatar component

`components/ui/user-avatar.tsx`, props: `name`, `id?`, `src?`, `size`
(`xs 20 | sm 28 | md 40 | lg 96`), `className`.

- Renders the image when `src` is set and loads; on `onError` or no `src`,
  renders initials.
- Initials: first letters of the first and last word of `name` (max 2), uppercase;
  `?` if the name is empty.
- Background color: picked from a fixed palette of 6 token-based colors by a
  stable hash of `id ?? name`. Palette uses existing theme tokens only, and text
  contrast is checked against each. Guests pass `name` only.
- Always has `alt=""` plus `aria-hidden` when the name is rendered next to it
  (decorative); otherwise `aria-label={name}`.
- Image is `loading="lazy"`, fixed width/height to avoid layout shift. Plain
  `<img>` for Supabase storage URLs unless the project's `next.config` already
  allow-lists the Supabase host for `next/image` (verify when planning).

### 3. Upload flow (profile page)

`components/profile/avatar-uploader.tsx`, replacing the "Avatar URL" input in
`profile-form.tsx`.

- File picker (jpeg/png/webp, original up to 10 MB checked before decode).
- Client pipeline: decode, center-crop to square, resize to 256x256, encode
  webp (quality 0.82). Reuse `fitWithin` / encode helpers from
  `lib/gallery/image.ts` where they fit; add a small `cropSquare` helper next to
  them rather than a second image module. Result must be under 512 KB or the
  upload is refused with a clear message.
- Upload with the browser Supabase client to `avatars/{uid}/avatar.webp`
  (`upsert: true`), then call a new server action
  `setAvatar(path)` which validates and writes `profiles.avatar_url`.
- Remove button: server action `removeAvatar()` deletes the object and sets
  `avatar_url = null`.
- Preview shows the current avatar (or initials) at `lg` size with upload /
  remove buttons. States: idle, uploading (disabled, spinner), error (toast +
  inline message). The form's Save button is unaffected: avatar changes apply
  immediately and independently, and the field is dropped from `profileSchema`.

### 4. Server actions and validation

In `lib/actions/profile.ts` (zod in `lib/validation/profile.ts`):

- `setAvatar({ ext, version })`: derives the URL server-side from the
  authenticated user id and the project's public bucket URL
  (`{SUPABASE_URL}/storage/v1/object/public/avatars/{uid}/avatar.{ext}?v={version}`).
  The client never supplies a URL, so arbitrary or third-party URLs cannot be
  stored through this path. `ext` is `webp` or `jpg`; `version` is a positive
  integer. It also deletes the other extension's object (best effort), so a user
  who switches browsers does not leave an orphan.
- `removeAvatar()`: removes the object (best effort) and nulls the column.
- `updateProfile` no longer accepts `avatarUrl` (removed from `profileSchema`;
  its existing unit tests are updated). It therefore also stops clobbering
  `avatar_url` to null on every save, which the current form would do once the
  input is gone.
- OAuth-provided avatars (Google) stay as-is until the user uploads or removes.
  `removeAvatar` on an external URL only nulls the column.
- After writes: `revalidatePath("/profile")`, `revalidatePath("/dashboard")`, and
  the layout so the menu updates.

### 5. Surfaces

Each row: add `avatar_url` to the query where missing, thread `avatarUrl`
through the DAL type, render `UserAvatar`.

| Surface | Source | Query change |
|---|---|---|
| App header user menu (`app/(app)/layout.tsx`) | `getCurrentUser` | none |
| Profile page and form | `getMyProfile` | none |
| Session page "registered participants" | `listPublicRoster` | add `avatar_url` to embed |
| Host roster (`roster-table.tsx`) | `listRoster` | none (add `avatarUrl` to component type) |
| Match panel, court panel, match history | `listMatches` | none |
| Rotation queue | `getRotationQueue` | none |
| Add participant / replace seat dialogs | `searchAddableMembers` | none |
| Admin members table | `listAllMembers` | none |
| Leaderboards (all-time, session) | RPCs | add `avatar_url` to RETURNS in a migration; `security definer` functions already read profiles |
| Gallery review queue / photos panel uploader | gallery DAL joins | add `avatar_url` to `uploader:profiles(...)` |
| Admin memberships list | `listMembershipsForAdmin` | add `avatar_url` to `member:profiles(...)` |
| Guests (roster, register panel) | none | initials from `guestName` |

Not changed: admin report tables, CSV, WhatsApp share text, emails (see Out of
scope).

### 6. Privacy and RLS check

- `profiles_select_authenticated` already exposes `avatar_url` to all signed-in
  users, so listing it in more places grants no new read access.
- `listPublicRoster` is served by an API route that requires a signed-in user
  (`app/api/sessions/[id]/participants/route.ts`), so no avatar reaches anon.
- The bucket is public: anyone with the full object URL can fetch it. The path
  contains the uuid, which is not enumerable. This is the same exposure model as
  `gallery` and is accepted.
- Leaderboard RPCs gain a column but keep their existing grants (`authenticated`).
- `all_time_leaderboard` now returns `avatar_url`, whose storage path embeds the
  member's user id. Accepted: `profiles_select_authenticated` already lets every
  signed-in user read every profile id and name.
- Members can still write `profiles.avatar_url` directly through the Supabase
  client, skipping `setAvatar`. The render-side allowlist `isAllowedAvatarSrc`
  is what enforces "only our bucket or Google". A DB-level guard was considered
  and left out because the database does not know the project URL.

### 7. Future-tier impact (flagged per project rules)

None of this blocks Future items. If per-viewer privacy ("hide my photo") is
ever wanted, avatar would move behind a `profiles_private`-style flag and the
public bucket would become private with signed URLs; the single `UserAvatar`
component and the server-derived URL in `setAvatar` keep that change local.

## Error handling

- Image fails to load: initials fallback, no broken-image icon.
- Upload rejected by policy or size: toast with the message, state returns to
  idle, `avatar_url` unchanged.
- `setAvatar` fails after a successful upload: the object exists but the column
  is unchanged; the next upload overwrites the same path, so nothing leaks.
- Storage unreachable: error toast, form still usable.

## Testing

- pgTAP (`supabase/tests/`): user can insert/update/delete only
  `{own uid}/avatar.webp`; cannot write another user's folder or a different
  filename; anon cannot insert; admin can delete any; mime and size limits
  enforced by the bucket.
- Unit: initials, color hash stability, `cropSquare` geometry,
  `profileSchema` without `avatarUrl`, `setAvatar` URL derivation.
- Component: `UserAvatar` fallback on missing src and on image error; guests.
- Manual (local stack): upload, replace, remove, Google-avatar user, a roster
  with mixed photo/no-photo/guest rows, both themes, mobile width.
- Run lint, `tsc`, and the existing unit suite before reporting done.

## Rollout

1. Apply migration (bucket, policies, leaderboard RPC columns) locally, then
   hosted via `supabase db push`.
2. Regenerate `types/supabase.ts`.
3. Ship UI. No data backfill: existing `avatar_url` values keep working;
   members without one see initials.
