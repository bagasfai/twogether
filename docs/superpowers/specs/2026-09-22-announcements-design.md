# Announcements — Design

Status: approved for planning
Date: 2026-09-22
Scope: Important (CLAUDE.md §6) — "announcements"

## Problem

The `announcements` table and its RLS policies were designed and shipped in
the core schema migrations (`20260911000006_announcements_galleries.sql`,
`20260911000009_rls_operations.sql`), including seed data
(`supabase/seed.sql`), but no application code reads or writes it. Hosts have
no way to post session-specific notes (e.g. "bring your own shuttlecocks"),
admins have no way to post community-wide notices, and neither members nor
visitors have anywhere to read either.

This spec wires the existing schema up end to end: host and admin write
surfaces, and read surfaces on the public session page, the marketing landing
page, and the member dashboard.

## Non-goals

- **Draft/publish workflow.** The schema supports it (`published_at`
  nullable), but every announcement created through this app is published
  immediately (`published_at = now()` at insert time). A host or admin who
  wants to hold something back simply doesn't create it yet. Revisit only if
  a real need for scheduled/held announcements shows up.
- **Delete.** Only create and edit. A mistaken announcement is corrected in
  place, not removed. If removal turns out to matter, RLS already permits it
  (`announcements_write` is `for all`) — it's an additive follow-up, not a
  blocked path.
- **Unpublish (take down without deleting).** Same reasoning as delete —
  no distinct "was live, now hidden" state in this pass.
- **Galleries.** `public.galleries` / `public.gallery_photos` shipped in the
  same migration as `announcements` but are a separate 🔵 Growth/Branding
  concern (CLAUDE.md §6) with their own read/write surfaces. Out of scope
  here.
- **Rich text / attachments.** `title`/`body` are plain text columns; the
  UI renders `body` as plain text (whitespace-preserved), no markdown or
  image embedding.
- **Per-member read receipts or notifications.** An announcement appearing
  in a feed is the only delivery mechanism — no push/email notification that
  one was posted (WhatsApp sharing already covers the "make sure people see
  this" need per CLAUDE.md §1, and is unaffected by this feature).

## Schema

None. `public.announcements` and its RLS policies already exist:

```sql
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`session_id is null` means community-wide; non-null means scoped to that
session. `published_at is null` means draft (never produced by this app, per
Non-goals, but the read policies already account for it).

Read (`announcements_select`, `to anon, authenticated`):
`published_at is not null and (session_id is null or session_is_public(session_id))`
— OR `session_id is not null and is_session_host(session_id)` (a host reading
their own, regardless of published state) — OR `is_admin()`.

Write (`announcements_write`, `to authenticated`, `for all`): `session_id is
null → is_admin()`, else `is_session_host(session_id)`. `is_session_host()`
already OR's in `is_admin()`
(`supabase/migrations/20260911000007_rls_helpers.sql`), so an admin can also
write session-scoped announcements for any session — matching CLAUDE.md §4's
"Admin: everything a Host can do, plus...". This means **one generic
create/update action serves both the host UI and the admin UI**; RLS alone
discriminates who's allowed to do what, no app-level role branching needed.

No new migration, no `types/supabase.ts` regeneration — the generated types
for `announcements` already exist from the original migration.

## DAL (`lib/dal/announcements.ts`, new file)

```ts
export type AnnouncementRow = {
  id: string;
  sessionId: string | null;
  title: string;
  body: string;
  publishedAt: string;
  createdAt: string;
};
```

Five read functions, split by which Supabase client they need:

**Anon-safe (`createPublicClient()`, no auth check — same pattern as
`lib/dal/public-sessions.ts`), used from `(marketing)` routes:**

- `listPublicCommunityAnnouncements(limit = 5)` — `session_id is null`,
  ordered `published_at desc`, `.limit(limit)`. Landing page.
- `listPublicSessionAnnouncements(sessionId)` — `session_id = id`, ordered
  `published_at desc`. Public session detail page. (RLS's
  `published_at is not null` + `session_is_public` disjunct does the real
  filtering; the query doesn't need to duplicate it, same as
  `getPublicSession` not re-checking session visibility itself.)

**Authenticated (`createClient()` + `getCurrentUser()`), used from `(app)`
routes:**

- `listMyAnnouncementsFeed()` — community-wide announcements UNION
  announcements for sessions the caller is currently registered in
  (non-cancelled, upcoming — reuses the same session-id set
  `listMyUpcomingRegistrations` would return, rather than re-deriving it: get
  the caller's upcoming session ids first, then one `.in("session_id", [...,
  null-handled separately])` query). Combined, sorted `published_at desc`.
  Dashboard.
- `listHostAnnouncements(sessionId)` — gated via the existing
  `getHostSession(sessionId)` (returns `[]` if not found/not hosted, same
  convention as `searchAddableMembers`). All announcements for that session.
  Manage page.
- `listCommunityAnnouncementsForAdmin()` — gated via `getCurrentUser()`
  (the admin page itself already gates with `requireAdmin`; this follows the
  DAL convention of every function checking auth at the source rather than
  trusting the caller). `session_id is null`, all rows, ordered
  `published_at desc`. Admin page.

## Validation (`lib/validation/announcement.ts`, new file)

```ts
export const announcementSchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200, "Title is too long"),
  body: z.string().trim().min(1, "Write something").max(2000, "That's too long"),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;
```

Single schema, reused for both create and update — same shape either way.

## Server Actions (`lib/actions/announcements.ts`, new file)

Both follow the existing `ActionResult`/`fail`/`ok`/`failFromZod` pattern
(`lib/actions/result.ts`).

```ts
createAnnouncement(input: AnnouncementInput & { sessionId: string | null }): Promise<ActionResult<{ id: string }>>
```
Validates, requires `getCurrentUser()`, inserts with `created_by: user.id`,
`published_at: new Date().toISOString()`. RLS refusal (`42501`) maps to
`fail("not_authorized")` — reachable if a member somehow submits this (the UI
never offers the form to a member, so this is a defense-in-depth path, not a
UI state). Revalidates, mirroring `updateSession`'s existing path strings
(`lib/actions/sessions.ts`) rather than inventing a new convention:
`sessionId === null` → `revalidatePath("/")` (landing) and
`revalidatePath("/dashboard")`; `sessionId` set → `revalidatePath(\`/sessions/${sessionId}\`)`
(public detail page), `revalidatePath(\`/sessions/${sessionId}/manage\`)`, and
`revalidatePath("/dashboard")`.

```ts
updateAnnouncement(id: string, input: AnnouncementInput): Promise<ActionResult<null>>
```
Validates, updates `title`/`body` by `id`. RLS scopes which rows a given
caller can touch; `42501` → `fail("not_authorized")`. The action doesn't know
`sessionId` up front, so it re-selects it as part of the update
(`.update(...).eq("id", id).select("session_id").single()`) and revalidates
the same path set as `createAnnouncement` above, based on whether the
returned `session_id` is null or set.

## UI

### `components/sessions/announcement-form.tsx` (new, client)

One dialog component shared by the host and admin surfaces, following
`add-guest-dialog.tsx`'s lightweight pattern (plain `useState`, no
react-hook-form — two fields, no need for the heavier machinery `SessionForm`
uses). Props: `sessionId: string | null`, and either nothing (create mode,
trigger button reads "Post announcement") or `announcement: AnnouncementRow`
(edit mode, trigger reads "Edit", fields pre-filled). Calls `createAnnouncement`
or `updateAnnouncement` accordingly, toasts result, closes + `router.refresh()`
on success.

### `components/sessions/announcement-list.tsx` (new, server-renderable list + client edit triggers)

Renders a list of `AnnouncementRow` as simple cards (title, body, relative
`publishedAt`), each with an `AnnouncementForm` in edit mode as its action.
Reused by the manage page and the admin page (both need "list + create +
edit"); the public/dashboard read surfaces render their own simpler read-only
list markup inline rather than reusing this component, since they have no
create/edit affordance at all — pulling in the edit-capable component there
would mean passing down capability flags for no reason.

### Wiring

- **`app/(app)/sessions/[id]/manage/page.tsx`** — new card above
  `ManageTabs` (not a 4th tab: announcements aren't a live/rotation concern
  like courts/matches/roster, and forcing them into `ManageTabs`'s
  mobile tab-strip layout — currently a fixed 3-column grid, see
  `manage-tabs.tsx`'s `TabId` union — would couple an unrelated feature to
  that component's layout math for no benefit). Fetches via
  `listHostAnnouncements(id)`, renders `AnnouncementList` with a
  `sessionId={id}` create trigger.
- **`app/(app)/admin/page.tsx`** — new section below the existing member
  table. Fetches via `listCommunityAnnouncementsForAdmin()`, renders
  `AnnouncementList` with `sessionId={null}`.
- **`app/[locale]/(marketing)/sessions/[id]/page.tsx`** — new read-only
  section (after the description, before the capacity `dl`) via
  `listPublicSessionAnnouncements(id)`. Empty → section omitted entirely,
  same convention as the dashboard's hosted-sessions section.
- **`app/[locale]/(marketing)/page.tsx`** — new read-only section via
  `listPublicCommunityAnnouncements()`. This page currently does no data
  fetching at all and has no `revalidate` export (next-intl static markup
  only) — adding a DB read means adding `export const revalidate = 60`,
  matching `(marketing)/sessions/page.tsx`'s existing value, so the page
  keeps its ISR caching instead of becoming fully dynamic.
- **`app/(app)/dashboard/page.tsx`** — new read-only section via
  `listMyAnnouncementsFeed()`, placed above "Your upcoming sessions" (an
  announcement is more likely to be time-sensitive than the registration
  list below it).

## Error handling

No new error shape — both actions return `ActionResult` and map `42501` to
`not_authorized`, consistent with every other action in `lib/actions/`.
Read-side DAL functions throw on unexpected Supabase errors and return `[]`
for "not authorized to see anything here", same convention as
`listRoster`/`searchAddableMembers`.

## Testing

- Unit: `announcementSchema` (`lib/validation/announcement.ts`) — trims,
  rejects empty, rejects over-length, per
  `superpowers:test-driven-development`.
- No new RLS/pgTAP coverage — `announcements_select`/`announcements_write`
  already exist and are presumably covered by the existing invariant test
  suite from when the schema shipped; this feature adds no new policy.
- DAL functions are straight query mirrors of existing patterns
  (`getPublicSession`, `listRoster`, `searchAddableMembers`) with no new
  derivation logic — skip, per the same judgment call as the session-history
  feature.
- Manual verification in-browser (no e2e harness, logged gap in
  `docs/superpowers/core-schema-follow-ups.md`): post a session announcement
  as host, confirm it shows on that session's public page; post a
  community announcement as admin, confirm it shows on the landing page and
  on a member's dashboard; edit each and confirm the change persists; log in
  as a plain member and confirm neither manage-page nor admin-page write UI
  is reachable (both pages are already role-gated via `requireHost`/
  `requireAdmin`, so this is confirming existing gating, not new checks).

## Files touched

- `lib/dal/announcements.ts` — new
- `lib/validation/announcement.ts` — new
- `lib/actions/announcements.ts` — new
- `tests/unit/validation.test.ts` — modified (this repo keeps all zod-schema unit tests in one shared file; the plan correctly redirected here instead of creating a new file)
- `components/sessions/announcement-form.tsx` — new
- `components/sessions/announcement-list.tsx` — new
- `app/(app)/sessions/[id]/manage/page.tsx` — add announcements section
- `app/(app)/admin/page.tsx` — add announcements section
- `app/[locale]/(marketing)/sessions/[id]/page.tsx` — add announcements section
- `app/[locale]/(marketing)/page.tsx` — add announcements section + `revalidate`
- `app/(app)/dashboard/page.tsx` — add announcements section

## Future cost callouts (🟢 Future territory)

- None. This feature doesn't touch registration, waitlist, matches, or
  rotation — the areas where CLAUDE.md §6 flags Future-tier features
  (automatic match generation, skill balancing, etc.) as a cost
  consideration. Announcements are additive and self-contained.
