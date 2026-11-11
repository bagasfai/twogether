# Profile Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show member photos wherever the app shows a person's name, let members upload their own photo, and fall back to an initials avatar.

**Architecture:** A public Storage bucket `avatars` (`{uid}/avatar.webp|jpg`) written by the browser under owner-only storage policies; a server action derives and stores the public URL in `profiles.avatar_url`. One `UserAvatar` component renders photo-or-initials and is dropped into every surface; queries that lack `avatar_url` gain it.

**Tech Stack:** Next.js App Router, Supabase (Postgres, Storage, RLS, pgTAP), zod, react-hook-form, vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-11-11-profile-avatars-design.md`

## Global Constraints

- Bucket `avatars`: public, `file_size_limit = 524288`, mime `image/webp`, `image/jpeg`, `image/png`.
- Object name is exactly `{auth.uid()}/avatar.webp` or `{auth.uid()}/avatar.jpg`.
- Stored avatar is 256x256, center-cropped square, quality 0.82. Original pick limit 10 MB (`MAX_ORIGINAL_BYTES` from gallery is 40 MB; avatar uses its own 10 MB constant).
- `profiles.avatar_url` gets no `check` constraint (legacy and Google URLs stay valid).
- The client never supplies the stored URL; `setAvatar` derives it from the session user id.
- No new npm dependency. Plain `next/image` with `unoptimized`, no `@radix-ui/react-avatar`.
- No explanatory code comments beyond what the codebase already does for non-obvious constraints.
- Out of scope: admin report tables, CSV, WhatsApp share text, emails.
- Regenerate `types/supabase.ts` after the migrations (`supabase gen types typescript --local > types/supabase.ts`).
- Commits only when the user asks; no commit steps below.

## Review Focus

1. Empty, whitespace-only, emoji or non-Latin names: initials must not crash or show garbage (`?` for empty; use code points, not UTF-16 units).
2. `avatar_url` pointing at a dead or external (Google) URL: shows initials, no broken-image icon.
3. Saving the profile form must not clear an existing avatar (the regression the old form would cause).
4. Picking a non-image, a GIF, an empty file, or a huge file: refused with a message, `avatar_url` unchanged.
5. Safari/iOS (webp encode falls back to jpeg): upload still succeeds under the `.jpg` path, and a later webp upload removes the stale `.jpg`.

## File Structure

- `supabase/migrations/20261111000001_avatars_storage.sql` (new): bucket + storage policies.
- `supabase/migrations/20261111000002_leaderboard_avatar.sql` (new): `all_time_leaderboard` returns `avatar_url`.
- `supabase/tests/053_avatars_storage.test.sql`, `054_leaderboard_avatar.test.sql` (new).
- `lib/avatar/initials.ts` (new): `getInitials`, `avatarColorIndex`.
- `lib/avatar/image.ts` (new): `AVATAR_SIZE`, `MAX_AVATAR_ORIGINAL_BYTES`, `squareCrop`, `avatarObjectPath`, `resizeAvatar`.
- `lib/avatar/url.ts` (new): `avatarPublicUrl`.
- `components/ui/user-avatar.tsx` (new): `UserAvatar`.
- `components/profile/avatar-uploader.tsx` (new): upload/remove UI.
- `lib/validation/profile.ts`, `lib/actions/profile.ts` (modify): drop `avatarUrl`; add `setAvatarSchema`, `setAvatar`, `removeAvatar`.
- `components/profile/profile-form.tsx`, `app/(app)/profile/page.tsx` (modify).
- Surface files listed per task 7 and 8.
- Tests: `tests/unit/avatar-initials.test.ts`, `avatar-image.test.ts`, `avatar-url.test.ts`, `user-avatar.test.tsx`, `profile-avatar-actions.test.ts`; update the avatar cases in `tests/unit/validation.test.ts` (around lines 102 and 165).

---

### Task 1: Avatars bucket and storage policies

**Files:**
- Create: `supabase/migrations/20261111000001_avatars_storage.sql`
- Test: `supabase/tests/053_avatars_storage.test.sql` (copy the fixture, claims and `storage.allow_delete_query` setup style from `027_gallery_storage.test.sql`)

**Interfaces:**
- Produces: bucket id `avatars`; policies `avatars_insert`, `avatars_update`, `avatars_select`, `avatars_delete` on `storage.objects`.

- [ ] **Step 1: Write the pgTAP test.** Cases, as `authenticated` with JWT claims: (a) bucket exists, public, limit 524288, mimes as in Global Constraints; (b) user inserts `{own}/avatar.webp` and `{own}/avatar.jpg`: succeeds; (c) insert `{own}/other.png`, `{own}/sub/avatar.webp`, and `{other}/avatar.webp`: `throws_ok` 42501; (d) update (upsert overwrite) of own `avatar.webp` affects 1 row, update of someone else's affects 0; (e) delete own affects 1, delete another user's affects 0, admin deletes anyone's (1 row); (f) `anon` insert throws 42501; (g) a member cannot select another member's object (0 rows) but admin can.
- [ ] **Step 2: Run** `supabase test db` and confirm 053 fails (bucket missing).
- [ ] **Step 3: Write the migration.** Insert the bucket with `on conflict (id) do update` (same shape as `20261021000003_gallery_storage.sql`). Policies compare `(storage.foldername(name))[1] = auth.uid()::text` (text compare, no uuid cast) and `name ~ ('^' || auth.uid()::text || '/avatar\.(webp|jpg)$')` in insert and update `with check`. Select and delete: owner folder or `public.is_admin()`. Update `using` = owner folder.
- [ ] **Step 4: Run** `supabase db reset && supabase test db`; expected: 053 passes, no other test regresses.

---

### Task 2: Leaderboard RPC returns avatar_url

**Files:**
- Create: `supabase/migrations/20261111000002_leaderboard_avatar.sql`
- Test: `supabase/tests/054_leaderboard_avatar.test.sql`
- Modify: `lib/dal/stats.ts` (`getAllTimeLeaderboard` and `AllTimeLeaderboardRow`), `app/(app)/leaderboard/page.tsx`; add `avatar_url` to the `profiles!participants_user_id_fkey(...)` embed in `getSessionLeaderboard` and `avatarUrl` to `SessionLeaderboardRow`; render in `components/sessions/session-leaderboard.tsx`.

**Interfaces:**
- Consumes: `UserAvatar` from Task 4 (render step only; do the SQL and DAL parts first).
- Produces: `all_time_leaderboard(p_limit int)` returns `(full_name text, avatar_url text, games_played bigint, is_me boolean)`; `AllTimeLeaderboardRow.avatarUrl: string | null`; `SessionLeaderboardRow.avatarUrl: string | null` (guests `null`).

- [ ] **Step 1: Write the pgTAP test.** Seed two members with and without `avatar_url`, one completed match; assert the function returns the new column for both, `null` for the member without, and that it still excludes guests and keeps its grants (`authenticated` yes, `anon` no).
- [ ] **Step 2: Run** `supabase test db`; confirm 054 fails.
- [ ] **Step 3: Write the migration.** The return type changes, so `drop function public.all_time_leaderboard(int)` then recreate with the same body plus `pr.avatar_url` (add it to `group by`), then re-apply the exact `revoke`/`grant` from `20261026000004_match_stats.sql`.
- [ ] **Step 4: Run** `supabase db reset && supabase test db`; expect pass. Regenerate `types/supabase.ts`.
- [ ] **Step 5: DAL and types.** Map `avatar_url` to `avatarUrl` in both leaderboard functions; run `npx tsc --noEmit` and fix the callers it flags.
- [ ] **Step 6: Render** the avatar beside the name in the leaderboard page and `session-leaderboard.tsx` once Task 4 exists (`size="sm"`, `name`, `id` not available for the RPC rows so omit `id`).

---

### Task 3: Pure avatar helpers

**Files:**
- Create: `lib/avatar/initials.ts`, `lib/avatar/image.ts`, `lib/avatar/url.ts`
- Test: `tests/unit/avatar-initials.test.ts`, `tests/unit/avatar-image.test.ts`, `tests/unit/avatar-url.test.ts`

**Interfaces:**
- Produces:
  - `getInitials(name: string | null | undefined): string`
  - `avatarColorIndex(key: string, palette = 6): number`
  - `AVATAR_SIZE = 256`, `MAX_AVATAR_ORIGINAL_BYTES = 10 * 1024 * 1024`, `MAX_AVATAR_BYTES = 524288`
  - `squareCrop(width: number, height: number): { sx: number; sy: number; side: number }`
  - `avatarObjectPath(userId: string, ext: "webp" | "jpg"): string`
  - `resizeAvatar(file: File): Promise<EncodedPhoto>` (browser-only; reuses `encodeWithFallback` and `ImageEncodeError` from `lib/gallery/image.ts`)
  - `avatarPublicUrl(supabaseUrl: string, userId: string, ext: "webp" | "jpg", version: number): string`

- [ ] **Step 1: Write failing tests.** `getInitials("Dimas Pratama") === "DP"`, `("siti") === "S"`, `("  Ana  Maria  Lopez ") === "AL"` (first and last word), `("") === "?"`, `(null) === "?"`, `("   ") === "?"`, `("👍 Budi") === "👍B"` code-point safe, `("Åsa Öberg") === "ÅÖ"`. `avatarColorIndex` is stable for equal input, always `0..5`, and spreads 200 random uuids over all 6 buckets. `squareCrop(400, 300)` = `{ sx: 50, sy: 0, side: 300 }`, `(300, 400)` = `{ sx: 0, sy: 50, side: 300 }`, `(256, 256)` = `{ sx: 0, sy: 0, side: 256 }`. `avatarObjectPath("u1","jpg") === "u1/avatar.jpg"`. `avatarPublicUrl("https://x.supabase.co","u1","webp",5) === "https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar.webp?v=5"`; a trailing slash on `supabaseUrl` must not double the slash.
- [ ] **Step 2: Run** `npm run unit -- avatar`; confirm failures.
- [ ] **Step 3: Implement** the signatures above. `getInitials` iterates with `Array.from`. `avatarColorIndex` uses a simple 32-bit string hash modulo `palette`. `resizeAvatar` mirrors `resizeForUpload` (`createImageBitmap` with `imageOrientation: "from-image"`, canvas, `encodeWithFallback`) but draws the `squareCrop` region into a 256x256 canvas.
- [ ] **Step 4: Run** `npm run unit -- avatar`; expect pass.

---

### Task 4: UserAvatar component

**Files:**
- Create: `components/ui/user-avatar.tsx`
- Test: `tests/unit/user-avatar.test.tsx` (follow the setup of `tests/unit/error-boundary.test.tsx`)

**Interfaces:**
- Consumes: `getInitials`, `avatarColorIndex` (Task 3).
- Produces: `UserAvatar(props: { name: string | null | undefined; id?: string; src?: string | null; size?: "xs" | "sm" | "md" | "lg"; decorative?: boolean; className?: string })`. Sizes in px: xs 20, sm 28, md 40, lg 96. `decorative` defaults to `true` (name is rendered next to it): the wrapper gets `aria-hidden`; when `false` it gets `role="img"` and `aria-label={name}`.

- [ ] **Step 1: Write failing tests.** With `src`: renders one `img` with fixed `width`/`height` matching the size. Without `src` or with `src=""`: renders initials text and no `img`. Firing `error` on the `img` swaps to initials. Two renders with the same `id` get the same color class; a different `id` may differ. `name=null` shows `?`. Changing `src` after an error shows the new image again (error state resets on `src` change).
- [ ] **Step 2: Run** `npm run unit -- user-avatar`; confirm failure.
- [ ] **Step 3: Implement** as a client component using `next/image` with `unoptimized`. Palette: 6 existing theme token pairs (background and foreground); check each pair against `tests/unit/contrast.test.ts` conventions and add the six pairs to that test.
- [ ] **Step 4: Run** `npm run unit -- user-avatar contrast`; expect pass.

---

### Task 5: Server actions and validation

**Files:**
- Modify: `lib/validation/profile.ts`, `lib/actions/profile.ts`, `tests/unit/validation.test.ts`
- Test: `tests/unit/profile-avatar-actions.test.ts` (mock `@/lib/supabase/server` and `@/lib/dal/user` the way `tests/unit/featured-posts-actions.test.ts` does)

**Interfaces:**
- Consumes: `avatarPublicUrl`, `avatarObjectPath` (Task 3).
- Produces: `setAvatarSchema = z.object({ ext: z.enum(["webp","jpg"]), version: z.number().int().positive() })`; `setAvatar(input: z.input<typeof setAvatarSchema>): Promise<ActionResult<{ avatarUrl: string }>>`; `removeAvatar(): Promise<ActionResult<null>>`. `profileSchema` no longer has `avatarUrl`.

- [ ] **Step 1: Write failing tests.** `profileSchema` rejects nothing new but its parsed output has no `avatarUrl` key; the two old avatar cases in `validation.test.ts` are removed or inverted. `setAvatar` unauthenticated returns `fail("not_authenticated")` and writes nothing; `{ ext: "png" }` and `{ version: 0 }` and `{ version: 1.5 }` return the zod failure; valid input updates `profiles.avatar_url` with exactly `avatarPublicUrl(NEXT_PUBLIC_SUPABASE_URL, user.id, ext, version)` filtered by `eq("id", user.id)`, removes the other extension's object (`avatars/{uid}/avatar.{otherExt}`), calls `revalidatePath("/profile")`, `"/dashboard"`. `removeAvatar` removes both possible objects and sets `avatar_url` to `null`; on an external (non-bucket) stored URL it only nulls the column. `updateProfile`'s update payload contains `full_name` and no `avatar_url` key.
- [ ] **Step 2: Run** `npm run unit -- profile-avatar validation`; confirm failures.
- [ ] **Step 3: Implement.** Remove `optionalUrl` and `avatarUrl` from `profileSchema`; drop `avatar_url` from the `updateProfile` update. Add the two actions in `lib/actions/profile.ts` using the same `getCurrentUser` / `createClient` / `fail` / `ok` pattern. Storage removal failures are ignored (best effort); a DB failure returns `fail("unknown", "Could not save your photo.")`.
- [ ] **Step 4: Run** `npm run unit`; expect pass. Run `npx tsc --noEmit` and fix `profile/page.tsx` and `profile-form.tsx` type errors by completing Task 6 before merging this one if needed.

---

### Task 6: Profile page upload UI

**Files:**
- Create: `components/profile/avatar-uploader.tsx`
- Modify: `components/profile/profile-form.tsx` (remove the "Avatar URL" field and `avatarUrl` default), `app/(app)/profile/page.tsx`

**Interfaces:**
- Consumes: `UserAvatar` (Task 4), `resizeAvatar`, `avatarObjectPath`, `MAX_AVATAR_ORIGINAL_BYTES`, `MAX_AVATAR_BYTES` (Task 3), `setAvatar`, `removeAvatar` (Task 5), `validatePickedFile` and `ACCEPTED_TYPES` from `lib/gallery/image.ts`.
- Produces: `AvatarUploader(props: { userId: string; name: string | null; initialUrl: string | null })`.

- [ ] **Step 1: Implement the component.** Shows `UserAvatar size="lg" decorative={false}`, an Upload/Replace button (hidden `input type="file" accept` from `ACCEPTED_TYPES`) and a Remove button (shown only when a URL exists). Pick flow: `validatePickedFile` plus a `MAX_AVATAR_ORIGINAL_BYTES` check, `resizeAvatar`, refuse if `blob.size > MAX_AVATAR_BYTES`, browser Supabase client `storage.from("avatars").upload(avatarObjectPath(userId, ext), blob, { upsert: true, contentType: blob.type })`, then `setAvatar({ ext, version: Date.now() })`, then update local state with the returned URL. States: idle, working (buttons disabled), error (Sonner toast with a short message; separate messages for type, size, encode failure, and upload failure). Use the same `toast`/`startTransition` conventions as `profile-form.tsx`.
- [ ] **Step 2: Wire into the page.** `profile/page.tsx` passes `userId`, `name`, `initialUrl={profile.avatarUrl}` and renders the uploader above the form; remove `avatarUrl` from the form's `defaultValues`.
- [ ] **Step 3: Verify.** `npx tsc --noEmit`, `npx eslint components/profile app/(app)/profile`, `npm run unit`; expect clean. Do not run the dev server; manual checks happen in Task 9.

---

### Task 7: Surfaces whose data already carries avatar_url

**Files (modify):** `app/(app)/layout.tsx`, `components/sessions/roster-table.tsx` (add `avatarUrl: string | null` to its `Entry` type; `listRoster` already returns it), `components/sessions/match-panel.tsx`, `components/sessions/court-panel.tsx`, `components/sessions/match-history-list.tsx`, the rotation queue component that consumes `getRotationQueue` (find with `grep -rn "RotationEntry\|getRotationQueue" components app`), `components/sessions/add-participant-dialog.tsx`, `components/sessions/replace-seat-dialog.tsx`, `components/admin/member-role-table.tsx`, `components/sessions/register-panel.tsx` (guest list: initials from `guest.guestName`).

**Interfaces:**
- Consumes: `UserAvatar` (Task 4).
- Produces: nothing new. Each person row renders `<UserAvatar name={...} id={userId} src={avatarUrl} size="sm" />` left of the name; guest rows pass `name={guestName}` and no `id`/`src`. In the header user menu use `size="sm"` and `decorative={false}`.

- [ ] **Step 1: Per surface**, add the avatar next to the existing name element without changing its text, truncation or click targets. Rows with a name that already has `aria-label`/text keep `decorative` default.
- [ ] **Step 2: Verify** `npx tsc --noEmit`, `npx eslint` on the touched files, `npm run unit`; expect clean.

---

### Task 8: Surfaces that need an avatar_url query change

**Files (modify):**
- `lib/dal/participants.ts`: `listPublicRoster` select `profiles(full_name, avatar_url)` (around line 359), `PublicRosterEntry` gains `avatarUrl: string | null`; `components/sessions/registered-participants.tsx` and the route `app/api/sessions/[id]/participants/route.ts` pass it through (also update the runtime type guard if the component validates the response shape).
- `lib/dal/galleries.ts`: add `avatar_url` to the three `uploader:profiles!gallery_photos_uploaded_by_fkey(...)` embeds, expose `uploaderAvatarUrl`; render in `components/gallery/review-queue.tsx` and `components/gallery/photos-panel.tsx` beside `uploaderName`.
- `lib/dal/memberships.ts`: add `avatar_url` to `member:profiles(...)`, expose `memberAvatarUrl`; render in the admin memberships list component (find with `grep -rn "memberName" components app`).

**Interfaces:**
- Consumes: `UserAvatar` (Task 4).

- [ ] **Step 1: Make the query and type changes**, then `npx tsc --noEmit` and fix every consumer it flags.
- [ ] **Step 2: Render** the avatar per surface as in Task 7. In `registered-participants.tsx`, guest entries (`guest_name` set, no profile) use initials.
- [ ] **Step 3: Verify** `npx tsc --noEmit`, `npx eslint` on touched files, `npm run unit`; expect clean.

---

### Task 9: Final verification

- [ ] **Step 1:** `supabase db reset && supabase test db`, `npx tsc --noEmit`, `npx eslint .`, `npm run unit`; expect all green.
- [ ] **Step 2: Local manual check** (the user runs the app; list this for them): upload a jpeg, a png, a webp; replace; remove; a Google-avatar account (set `avatar_url` to an external URL by SQL); a roster with photo, no-photo and guest rows; light and dark theme; 375px width; Safari/iOS upload if available.
- [ ] **Step 3: Hosted rollout**, only when the user approves: `supabase db push` (this also pushes the four pending `20261104*` report migrations), then regenerate types against hosted if schema drift is suspected.
- [ ] **Step 4:** Report: what was searched and reused (`lib/gallery/image.ts` helpers, the `gallery` bucket policy pattern), which surfaces got avatars, and any deviation from the spec (the `.jpg` variant is already recorded in the spec).
