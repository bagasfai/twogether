# Photo Gallery — Design

Status: approved for planning
Date: 2026-10-21
Scope: Growth/Branding (CLAUDE.md §6) — "gallery", plus the "Start session" host
action it depends on

## Problem

`public.galleries` and `public.gallery_photos` shipped in the core schema
(`20260911000006_announcements_galleries.sql`, RLS in
`20260911000009_rls_operations.sql`) but nothing uses them: there is no Storage
bucket, no upload path, no moderation, and no UI. The community has no public
record of its open plays, and the people who were actually there have no way to
contribute photos.

This spec delivers the gallery end to end: automatic per-session albums, photo
upload by people who were checked in, host/admin approval before anything is
public, and the public pages that show approved photos.

A prerequisite gap surfaced while exploring: **nothing in the app ever sets
`sessions.status = 'live'`.** The enum value exists and registration/RLS accept
it, but hosts currently go `scheduled` → `completed` directly via the close
action in `lib/actions/sessions.ts`. The "album is created when the session goes
live" rule needs a real transition to hang off, so this spec adds a "Start
session" action.

## Non-goals

- **Reordering UI.** `gallery_photos.sort_order` already exists and is used here
  for append order only. A drag-to-reorder UI for admins/hosts is a later,
  migration-free addition.
- **Rejection reasons, email/push notifications.** Reject is a hard delete; the
  uploader just sees the photo disappear.
- **Reporting, tagging, comments.** Deferred (see Future cost).
- **Private/pending bucket.** One public bucket, unguessable UUID paths. A
  pending photo's file is technically fetchable by anyone holding the URL; this
  was accepted as the tradeoff for a single bucket.
- **A global per-user upload flag.** Considered and dropped: eligibility is
  derived from being checked in at the session, not from a flag.
- **E2E tests.** Verified by pgTAP and Vitest only, per the project's current
  stance.
- **Cleanup of orphaned Storage files.** A file with no row can occur if an
  upload succeeds but the RPC (or a post-reject Storage remove) fails. Paths are
  unguessable and the files are harmless; a cleanup script is a later follow-up.

## Decisions

| Question | Decision |
|---|---|
| Model | Albums (`galleries`) of photos, one auto-album per session plus admin-made unlinked albums |
| Who can upload | Admins and session hosts/co-hosts to any album they manage; **checked-in participants** to their session's album within **7 days after `sessions.ends_at`** |
| Who needs approval | Anyone who is not an admin or host of that session; their photos are `pending` |
| Who approves | An admin, or any `session_hosts` row for the album's session (owner or co-host). One signature |
| Reject | Hard delete of the row and the Storage file |
| Album creation | Automatic when a session goes `live`; manual creation is admin-only |
| Storage | One public bucket `gallery`, paths `{gallery_id}/{uuid}.webp` |
| Resize | Client-side, max 2000px long edge, webp ~0.82 |

`is_session_host(session_id)` is `is_admin() OR exists (session_hosts row)`, so
it already covers co-hosts. The existing practice of a host nominating a temporary
co-host for a session they cannot attend therefore grants approval rights with no
extra work.

## Data model

### Start session

`start_session(p_session_id uuid)` — `SECURITY DEFINER`, `search_path` pinned.
Requires `is_session_host(p_session_id)` and `status = 'scheduled'`, sets
`status = 'live'`. Granted to `authenticated`, revoked from `public`/`anon`, in
the style of the existing registration RPCs. Exposed as a Server Action
`startSession` (alongside `closeSession` in `lib/actions/sessions.ts`) and a
button visible only for `scheduled` sessions on the live dashboard and manage page.

### Auto album

An `after update` trigger on `sessions` fires when `old.status is distinct from
new.status and new.status = 'live'` and inserts a `galleries` row: `title` =
session title, `description` null, `session_id` = the session, `created_by` =
`sessions.created_by`. The function is `SECURITY DEFINER` so it works regardless
of the caller's role.

- Idempotent: `create unique index galleries_session_id_key on galleries
  (session_id) where session_id is not null`, and the insert uses `on conflict do
  nothing`. A session flipped back and forth never gets two albums.
- `galleries.created_by` becomes nullable with `on delete set null`, matching the
  `sessions.created_by` change in `20260924000002`. `sessions.created_by` can now
  be null, so the trigger must not assume it is set.
- The album shows the session's date by reading `sessions.starts_at` at query
  time. It is not copied into the title, so a rescheduled session stays correct.
- Backfill of already-live/completed sessions is not needed: no session has ever
  been `live`, and past `completed` sessions have no photos to show.

### `galleries` write policy

Replaces `galleries_write` (which let hosts of a linked session insert/delete):
- INSERT: admin only (unlinked albums). Auto-albums are created by the trigger.
- UPDATE (`title`, `description`): admin, or `is_session_host(session_id)` for
  that album's session.
- DELETE: admin only.
- SELECT unchanged (`anon, authenticated`, `using (true)`). The UI hides albums
  with no approved photos.

### `gallery_photos` columns

New enum `gallery_photo_status` = `('pending', 'approved')`. There is no
`rejected` value because reject deletes the row.

Added columns: `status gallery_photo_status not null default 'pending'`,
`reviewed_by uuid references profiles(id) on delete set null`, `reviewed_at
timestamptz`. `storage_path` gains a unique constraint. Existing columns
(`uploaded_by`, `caption`, `sort_order`) are reused as-is.

`gallery_photos` privileges are narrowed:
- Direct INSERT revoked from `authenticated`; rows are created only by
  `add_gallery_photo`.
- UPDATE limited by column grant to `(caption, sort_order)`, restricted by policy
  to admin or `is_session_host` of the album's session. `status`, `reviewed_*`
  and `storage_path` are only changeable inside `review_gallery_photo`.
- DELETE: admin, `is_session_host` of the album's session, or the uploader while
  the photo is `pending`.

SELECT policy:
- `anon`: `status = 'approved'` only.
- `authenticated`: approved photos, plus the uploader's own rows, plus all rows
  of an album the caller reviews (`is_admin()` or `is_session_host(album.session_id)`).

## Eligibility

`can_upload_to_gallery(p_gallery_id uuid)` — `SECURITY DEFINER`, stable,
`search_path` pinned. True when:

1. the caller is an admin; or
2. the album has a `session_id` and `is_session_host(session_id)`; or
3. the album has a `session_id` and the caller has a `participants` row for it
   with `status = 'confirmed'` and `checked_in_at is not null`, and `now() <=
   sessions.ends_at + interval '7 days'`.

Albums with no `session_id` return true only for admins. The 7-day window is
anchored on `ends_at` because `sessions` has no completion timestamp. A session
that is closed early still gets the full week from its scheduled end.

Granted to `authenticated` (the UI also calls it to decide whether to show the
upload panel).

## RPCs

All `SECURITY DEFINER`, `search_path = public, pg_temp`, EXECUTE revoked from
`public`/`anon` and granted to `authenticated`, errors raised with new `JB`
codes mapped in `lib/errors/rpc.ts` (the plan allocates the numbers after
reading the current file). Neither is a check-then-write in application code.

### `add_gallery_photo(p_gallery_id, p_path, p_caption)`

1. Require `auth.uid()`; take `pg_advisory_xact_lock` on the `(gallery, user)`
   pair so two parallel uploads cannot both slip under the cap.
2. Require `can_upload_to_gallery(p_gallery_id)`.
3. Require `p_path` to start with `p_gallery_id || '/'`.
4. Require a matching `storage.objects` row (`bucket_id = 'gallery'`, `name =
   p_path`, `owner = auth.uid()`). No row can exist without its file.
5. For non-reviewers, require fewer than 20 `pending` photos by this user in this
   album.
6. Insert with `uploaded_by = auth.uid()`, `sort_order = max(sort_order) + 1`
   (ties from concurrent uploaders by different users are harmless; display
   orders by `sort_order, created_at`), and `status`:
   - `approved` with `reviewed_by = auth.uid()`, `reviewed_at = now()` when the
     caller is an admin or `is_session_host` of the album's session;
   - `pending` otherwise.

### `review_gallery_photo(p_photo_id, p_action text)`

`p_action` is `'approve'` or `'reject'`. Requires admin or `is_session_host` of
the photo's album session, and `status = 'pending'`.
- `approve`: sets `status = 'approved'`, `reviewed_by`, `reviewed_at`.
- `reject`: deletes the row and returns its `storage_path`.

## Storage

Bucket created by migration (`insert into storage.buckets ... on conflict (id)
do update`) so it works locally and on hosted Supabase: `id = 'gallery'`, `public =
true`, `file_size_limit` 5 MB, `allowed_mime_types` jpeg/png/webp. `do update`
refreshes the limits on re-run, but it would also flip a pre-existing private
`gallery` bucket to public.

`storage.objects` policies for `bucket_id = 'gallery'`:
- INSERT: the first path segment must match a UUID regex (so a malformed path is
  denied rather than raising a cast error) and `can_upload_to_gallery(that
  uuid)` must be true. The regex is lower-case only, so upload paths must use the
  lower-case album id.
- DELETE: admin, or `is_session_host` of that album's session, or the uploader.
  Ownership rule: `(owner_id = auth.uid()::text or owner = auth.uid())`.
- SELECT (`gallery_select`, authenticated): owner or reviewer. It exists even
  though the bucket is public, because a DELETE with a WHERE clause needs a
  SELECT-visible row (probed on local storage-api).
- No UPDATE policy, so client uploads use `upsert: false`.

An unknown album makes `add_gallery_photo` raise JB012 for every caller (see the
RPCs section). Gallery error codes: JB012 not eligible to upload (or unknown
album), JB013 upload window closed, JB014 pending cap reached, JB015 invalid
upload path (wrong prefix, path already used, or no uploaded file), JB016
invalid state (session not scheduled, photo not pending, or bad review action).

**File deletion goes through the Storage API, not SQL.** Deleting from
`storage.objects` in SQL does not remove the file from the backend. Rejecting a
photo, or a member deleting their own pending photo, is therefore a Server Action
that calls the RPC/DELETE (which returns the `storage_path`) and then
`storage.remove([path])` as the signed-in user, allowed by the DELETE policy. If
the remove fails the result is an unguessable orphan file; it is logged, and the
action still reports success because the row is gone.

## Upload flow

1. The member picks files. A client helper resizes each on a canvas to a maximum
   of 2000px on the long edge and encodes webp at ~0.82 quality. Resize is a
   convenience; the bucket's size and MIME limits are the enforcement.
2. Upload to `{gallery_id}/{uuid}.webp` with the browser Supabase client, up to 3
   at a time, with per-file progress and a per-file retry.
3. For each uploaded file, call the Server Action `addGalleryPhoto` (input
   validated by one zod schema shared with the form), which calls
   `add_gallery_photo` and `revalidatePath`s the public gallery pages.
4. Errors map through `lib/errors/rpc.ts`: not eligible, window closed, cap
   reached, bad path.

## Pages and components

### Public (`(marketing)`, ISR)

- `/gallery` — album index.
- `/gallery/[id]` — one album's photo grid with lightbox.

Both read through the cookieless anon client in `lib/supabase/public.ts`. Upload,
review, reject, delete and caption/description edits call `revalidatePath` on
them. `next.config.ts` gains `images.remotePatterns` for the Supabase host, taken
from `NEXT_PUBLIC_SUPABASE_URL` so local and hosted both work, and images render
through `next/image`. Per AGENTS.md, the plan's first task is to read the relevant
docs in `node_modules/next/dist/docs/` (images, ISR, `revalidatePath`) before
writing any of this.

### App

- **Start session button** — host action on the live dashboard and manage page,
  visible only while `scheduled`.
- **Member upload panel** — on the member session page when
  `can_upload_to_gallery` is true for the session's album: file picker, per-file
  progress, and the member's own photos with a `pending` badge and delete.
- **Photos tab on the manage page** (`components/sessions/manage-tabs.tsx`) — the
  review queue (approve/reject), caption and album description editing, delete,
  and the same upload panel.
- **Admin "Albums" section** — create an unlinked album, a cross-album review
  queue, delete album.

New code lives in `components/gallery/`, `lib/dal/galleries.ts`,
`lib/actions/galleries.ts` and `lib/validation/gallery.ts`. Translation keys are
added to both `messages/en.json` and `messages/id.json`.

## Design direction

Produced with the Hallmark skill. `design.md` exists at the repo root, so this is
a system-managed project: genre, theme, type, spacing, motion and CTA voice are
**locked** to the existing system (modern-minimal, Coral theme, Geist, ink-filled
pill CTAs, coral as a highlighter only). Nothing here introduces a token; every
colour, size and duration references a token from `tokens.css`.

Audience, use case and tone were inferred rather than asked (the work was
delegated with the spec already settled): audience is community members and
first-time visitors browsing photos of events they attended or are considering
joining; the one job is *look at photos and recognise yourself*, with a quiet
*add yours* path for people who were there; tone is warm and utilitarian, not
editorial.

**Macrostructures** (both within the existing marketing family, as `design.md`
allows):
- `/gallery` — **Catalogue**: a uniform grid of album cards, each one an
  instance of the same thing. Heading is a tagline plus an inventory line, no
  display type.
- `/gallery/[id]` — **Portfolio Grid** shape without the filter bar: a
  responsive photo grid where the lightbox is the detail layer.
- Nav and footer stay as the existing marketing nav and Ft2 per `design.md`; no new
  archetype is introduced. App-side UI (Photos tab, upload panel, Albums section)
  is **Workbench**: functional, no enrichment, no hero.

**`/gallery` page.** A short tagline ("Open play, in photos.") sets in `--text-xl`
display weight, followed by a Geist Mono inventory line built from real counts
("12 albums · 148 photos"). Counts come from the database; with zero approved
photos the page shows an honest empty state, never invented numbers. Album cards
use `--radius-card`, a 4:3 cover cropped with `object-fit: cover`, the title in
body weight 600, and the session date and photo count in Geist Mono
(`--text-xs`). Hover: 1px lift plus a border-colour shift over `--dur-short` with
`--ease-out`; no scale, shadow bloom or scroll-triggered reveal. The cover is the
first approved photo by `sort_order`. Grid: 2 columns at 320–414px, 3 at 768px, 4
at wide viewports, tracks written `minmax(0, 1fr)`.

**`/gallery/[id]` page.** Back link, album title, session date and venue in mono,
the album description as body copy (max ~65ch), then the photo grid at the same
column counts. Thumbnails are 1:1 crops (`object-fit: cover`) to keep the grid
even regardless of source orientation; the lightbox shows the original aspect
(`object-fit: contain`). Captions appear in the lightbox, not on the thumbnail.

**Lightbox.** shadcn Dialog with an ink scrim, focus trapped, `Esc` closes, `←`
and `→` navigate, the next image is preloaded. A mono "3 / 24" position and the
caption sit below the image. Reduced-motion collapses transitions to a ≤150ms
opacity change. Controls have visible 3px coral focus rings that appear instantly.
Every image has alt text: the caption when present, otherwise "Photo from {album
title}".

**Upload panel.** A dashed `--color-rule` dropzone with an ink-outlined pill
"Choose photos" button (secondary voice). Per-file rows show a thin ink progress
bar (not coral), and failures in `--color-danger` with a Retry action. Success is
silent: the new photo simply appears in the member's list with a `pending` badge
using `--color-warning`, per the system's silent-success stance (no toast per
file). Photos approved by a host or admin show no badge.

**Review queue.** Thumbnail, uploader name, time (mono), and two actions.
*Approve* is an ink-filled pill and optimistic. *Reject* and *Delete* are
destructive and irreversible (hard delete), so they use the system's
`--color-danger` outline that fills on **confirm-hold** (about 600ms, also
triggerable by holding Enter/Space, with the remaining time announced via an
`aria-live` region); no confirm dialog and no undo, because an undo would require
retaining the deleted file.

**Mobile.** Verified at 320, 375, 414 and 768px: no horizontal scroll, image grid
tracks use `minmax(0, 1fr)`, no two-line clickable text, lightbox controls at least
44px tap targets, and long album titles wrap with `overflow-wrap: anywhere`.

`design.md` currently lists `gallery` under "Out of scope for this pass"; the plan
includes updating that paragraph to point at this spec once the pages ship.

## Testing

pgTAP, in the repo's existing style (single-transaction files under
`supabase/tests/`):

- `start_session`: transitions, host-only, rejects non-`scheduled`.
- Auto-album trigger: created on `live`, idempotent on repeat transitions, works
  with a null `sessions.created_by`.
- `can_upload_to_gallery`: checked-in yes; registered but not checked in no;
  waitlisted no; cancelled no; the 7-day window edge on both sides; unlinked
  album admin-only; a co-host yes.
- `add_gallery_photo`: forced `pending` for members and `approved` for
  admin/host, the cap of 20, path-prefix mismatch, missing `storage.objects` row,
  another user's object, duplicate path.
- `review_gallery_photo`: approve and reject permissions, rejecting a non-pending
  photo, reject returns the path and deletes the row.
- Visibility: anon sees only approved; an uploader sees their own pending; a
  reviewer sees pending for their album only; a host of session A cannot see
  pending photos of session B.
- Negative grant surface in the style of `022_grant_surface_negatives.test.sql`:
  direct INSERT on `gallery_photos` denied, `status`/`reviewed_*`/`storage_path`
  not updatable by `authenticated`, EXECUTE of each new function not granted to
  `public`/`anon`.
- Storage policies, if pgTAP can exercise `storage.objects` locally; otherwise
  covered by a documented manual check in the plan.

The advisory-lock cap is a concurrency property; as the follow-ups doc notes,
single-transaction pgTAP cannot prove contention. The plan includes a variant of
`scripts/test-concurrent-registration.sh` for it (parallel `add_gallery_photo`
calls from one user must leave at most 20 pending rows).

Vitest: the zod schema and the resize helper's dimension/encode logic.

`types/supabase.ts` must be regenerated after the migrations.

## Migrations

Three, in order:
1. `start_session`, the auto-album trigger, the `galleries` nullable
   `created_by` and unique index, and the new `galleries` write policies.
2. `gallery_photo_status`, the new `gallery_photos` columns, privilege and policy
   changes, `can_upload_to_gallery`, `add_gallery_photo`, `review_gallery_photo`.
3. The `gallery` bucket and `storage.objects` policies.

## Future cost (🟢 Future and later-tier notes)

- **Reorder UI:** no schema change; `sort_order` and the column grant for
  admin/host updates are already in place.
- **Report / tag:** the `status` enum gains values or a sibling table references
  `gallery_photos`. Nothing here blocks either. A tagging feature would need to
  decide whether a tagged person can request removal, which interacts with the
  hard-delete reject.
- **Private pending bucket:** if unapproved photos ever need real privacy, move
  to a two-bucket flow (upload to a private bucket, copy to public on approve).
  That touches the upload policy, the review RPC, and introduces a copy step that
  can partially fail. The current single-bucket design avoids it deliberately.
- **Member-created albums:** would require album moderation as well as photo
  moderation and a decision about who owns an album. Out of scope; flagged so it
  is not mistaken for a small follow-up.
- **Deployment:** the hosted Supabase project needs the `gallery` bucket (created
  by migration 3) and the Supabase host allowed in `next.config.ts`. Both are
  environment-dependent, so the first deploy of this feature should verify them.
