# About and FAQ Pages — Design

Status: draft, awaiting review
Date: 2026-10-22
Scope: Growth/Branding (CLAUDE.md §6) — "about", "FAQ", and the admin editing
that keeps them current

## Problem

The public site has a landing page, sessions and a gallery, but no About page and
no FAQ. A first-time visitor has nowhere to learn who the community is, when it
plays, or how to join, and there is no indexable content to support
SEO-driven member acquisition.

The text on these pages changes over time (venue, schedule, fees, rules), and
the people who know the current answers are admins, not developers. So the
content must be editable in the app, not in the repo.

This spec delivers the public About and FAQ pages, the tables that hold their
content, and an admin editor for both.

## Non-goals

- **Publish/draft state.** Every saved entry is public immediately. Admins delete
  entries they no longer want. No `published` flag on FAQ items or About.
- **Rich text or markdown.** About body and FAQ answers are plain text rendered
  with `whitespace-pre-wrap`. No HTML, no sanitizer, no XSS surface.
- **Optional translations and fallback.** Both `en` and `id` are required on every
  entry. There is no fallback logic.
- **Drag-to-reorder.** Ordering is move up / move down buttons only.
- **Sitemap, robots, community stats.** These are the remaining Growth items and
  get their own slice. This spec adds per-page metadata and FAQ structured data
  only.
- **Host editing.** Only admins edit this content (CLAUDE.md §4: admins manage
  community info).
- **A localized admin UI.** The `(app)` shell has no `NextIntlClientProvider` and
  the existing admin page is English-only. The editor follows suit.

## Decisions

| Question | Decision |
|---|---|
| Who edits content | Admins, in the app (`/admin`) |
| Storage | Two typed tables: `community_about` (singleton) and `faq_items` |
| About shape | One title and one body per language |
| Languages | `en` and `id`, both required, enforced by the database |
| FAQ ordering | `sort_order` integer, changed by a `faq_move` RPC (move up / move down) |
| Visibility | No toggle; saved means public |
| Who reads | Everyone, including anonymous visitors |
| Who writes | Admins only |

Rejected alternatives: a generic `site_content` key/jsonb table (loses column
constraints and generated types, pushes validation into the app), and a
`translations` child table per entity (more normalized, but overkill for two
languages and awkward for "both required").

## Data model

One migration, `supabase/migrations/20261022000001_about_faq.sql`.

### `community_about`

Singleton row.

| Column | Type | Notes |
|---|---|---|
| `id` | `boolean` | primary key, `default true`, `check (id)` — a second row is impossible |
| `title_en`, `title_id` | `text` | `not null`, `check (length(btrim(...)) > 0)`, max 120 chars |
| `body_en`, `body_id` | `text` | `not null`, non-blank check, max 8000 chars |
| `updated_at` | `timestamptz` | `not null default now()`, maintained by a trigger using the existing `public.set_updated_at()` (`20260911000001_enums_and_utils.sql`) |
| `updated_by` | `uuid` | references `profiles(id)` `on delete set null` |

The migration seeds one placeholder row (neutral title and body in both
languages) so the page never renders empty. It seeds no FAQ rows.

### `faq_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key, `default gen_random_uuid()` |
| `question_en`, `question_id` | `text` | `not null`, non-blank check, max 200 chars |
| `answer_en`, `answer_id` | `text` | `not null`, non-blank check, max 4000 chars |
| `sort_order` | `integer` | `not null`, unique |
| `created_at`, `updated_at` | `timestamptz` | `not null default now()`; `updated_at` uses the same `set_updated_at()` trigger |

`sort_order` uniqueness is `deferrable initially immediate` so `faq_move` can
swap two values inside one statement without a transient violation.

### RLS and grants

- RLS enabled on both tables.
- `select` policy `using (true)` for `anon` and `authenticated`.
- One `update` policy per table, `using/with check (public.is_admin())`. There are
  no insert or delete policies on either table: the singleton is seeded by the
  migration and never created or deleted by a client, and FAQ rows are created and
  deleted only through RPCs.
- Table grants follow the repo's narrowing practice (compare
  `20261021000002_gallery_photos_moderation.sql`): `anon` gets `select` only.
  `authenticated` gets `select`, plus column-level `update` on the text columns
  (and `updated_by` on `community_about`). `insert` and `delete` are revoked, and
  `sort_order` is excluded from the `faq_items` update grant, so ordering can only
  change through the RPCs below.
- Role checks live in RLS first. The Server Action's role check is a UX
  convenience on top, per CLAUDE.md §3.2.

### RPCs

All `security definer`, `search_path = public, pg_temp`, `execute` revoked from
`public` and `anon`, granted to `authenticated`. Each checks `public.is_admin()`
inside the body and raises `JB007` otherwise.

- **`faq_create(p_question_en, p_question_id, p_answer_en, p_answer_id) returns
  uuid`** — takes a lock, inserts with `sort_order = coalesce(max(sort_order), 0)
  + 1`. The lock makes two concurrent creates produce distinct, gapless
  positions. A plain insert with a client-computed position is a
  check-then-write race.
- **`faq_move(p_id uuid, p_direction text) returns void`** — `p_direction` is
  `'up'` or `'down'`. Takes the same lock, finds the neighbour in that direction,
  swaps the two `sort_order` values in one statement. At the top or bottom edge
  it does nothing and returns. Unknown id raises `JB008`; bad direction raises
  `JB011`.
- **`faq_delete(p_id uuid) returns void`** — takes the same lock, deletes the
  row, then closes the gap by renumbering rows after it. Unknown id raises
  `JB008`. Keeping positions gapless keeps `faq_move` a pure neighbour swap.

The lock is `pg_advisory_xact_lock` on a fixed key, the same technique the
registration RPCs use. Those RPCs also assert READ COMMITTED isolation (`JB006`),
because the lock only serializes callers under that level; the FAQ RPCs do the
same, and `wrong_isolation` is already mapped. Concurrency reasoning: ordering is a shared
resource across all rows, so a table-wide lock is correct, and contention is
negligible because only admins write and only occasionally.

Edits to the text of an existing item and to About use plain `update` under RLS;
they do not touch `sort_order`, so they need no lock.

### Error codes

No new codes. Reuse `JB007` (`not_authorized`), `JB008` (`not_found`), `JB011`
(`validation`). `lib/errors/rpc.ts` already maps all three.

## Public pages

Both pages live under `app/[locale]/(marketing)/`, so they get the `en` and `id`
locale prefixes like gallery and sessions.

### Data access

`lib/dal/community-content.ts`:

- `getAbout(locale)` → `{ title, body } | null`
- `listFaqItems(locale)` → `{ id, question, answer }[]` ordered by `sort_order`

The DAL selects the `_en` or `_id` columns for the given locale and returns
single-language shapes. Components never see both languages. Locale comes from
the request (`getLocale()` from `next-intl/server`).

### `/about`

- Title as `h1`, body in a `whitespace-pre-wrap` block, same typographic style as
  the announcements on the landing page.
- A sign-up call to action below the body (plain `NextLink` to `/signup`, which
  lives outside `app/[locale]`).
- `getAbout` returning null (row deleted by hand) renders a short empty state
  rather than throwing.

### `/faq`

- Native `<details>/<summary>` accordion: no client JavaScript, works without
  scripting.
- Empty list renders a short "nothing here yet" message.
- Emits `FAQPage` JSON-LD built from the same rows, in the page's language.

### Metadata and navigation

- `generateMetadata` on both pages: localized title and description, canonical,
  and `alternates.languages` for `en` and `id`.
- About and FAQ links added to the marketing header nav and the footer. Header
  must still not scroll horizontally at 320px (the layout comment documents
  this constraint); check the added links against it.
- New strings (nav labels, empty states, CTA, metadata) added to
  `messages/en.json` and `messages/id.json`.

### Rendering

`(marketing)/layout.tsx` calls `getCurrentUser()`, which forces every page in the
group to render dynamically. These pages follow suit and set `revalidate = 60`
for consistency with the landing and sessions pages, as the landing page's
comment explains. Admin writes call `revalidatePath` for every locale so the
change is visible immediately even if the group later becomes static.

## Admin editor

Two new sections on `app/(app)/admin/page.tsx`, below announcements and gallery.
The page already calls `requireAdmin`.

### About section

`components/admin/about-editor.tsx` — one `react-hook-form` form with
`title_en`, `title_id`, `body_en`, `body_id`, prefilled from `community_about`.
Saves through `updateAbout`. Shows the saved/failed state and per-field errors.

### FAQ section

`components/admin/faq-editor.tsx` — a list of cards, each showing the question
and answer in both languages, with Edit, Delete, Move up and Move down.

- Add and Edit share one dialog (`faq-item-dialog.tsx`) with the four fields.
- Delete uses the existing `components/gallery/hold-to-confirm-button.tsx`
  because it is destructive and irreversible.
- Move up is disabled on the first item, Move down on the last. The RPC still
  no-ops at the edges, so a stale page cannot corrupt order.
- Buttons are at least 44px touch targets, matching the gallery fixes.

### Validation

`lib/validation/community-content.ts` holds one zod schema per entity
(`aboutSchema`, `faqItemSchema`). Fields are trimmed, non-empty and length
capped to match the database checks. The same schema validates the form on the
client and the input in the Server Action, per CLAUDE.md §7. The database
constraints are the backstop, not the first line.

### Server Actions

`lib/actions/community-content.ts`: `updateAbout`, `createFaqItem`,
`updateFaqItem`, `deleteFaqItem`, `moveFaqItem`. They return the `ActionResult`
shape from `lib/actions/result.ts`, validate with zod (`failFromZod`), call the
RPC or the RLS-guarded update, map RPC errors with `failFromRpc`, and
`revalidatePath` with the `[locale]` pattern form (`/[locale]/(marketing)/about`, type `page`), which invalidates every locale in one call, as `lib/gallery/revalidate.ts` does.

Registration and waitlist are not touched, so the concurrency rule in CLAUDE.md
§3.1 is not engaged here. The advisory lock above covers the one genuinely shared
write, the FAQ ordering.

## Testing

**pgTAP** (`supabase/tests/028_about_faq.test.sql`):
- anonymous and authenticated users can `select` both tables;
- anonymous, member and host cannot insert, update or delete; admin can;
- a second `community_about` row is rejected;
- blank, whitespace-only and over-length text is rejected on every column;
- `faq_create` assigns consecutive positions;
- `faq_move` swaps with the neighbour, no-ops at the top and bottom edges, rejects
  a bad direction and an unknown id, and rejects non-admins;
- `faq_delete` closes the gap in `sort_order`;
- direct `update` of `sort_order` is refused by the column grant.

**Grant-surface negatives**: add the new tables and RPCs to the style of
`022_grant_surface_negatives.test.sql` and
`026_gallery_grant_surface_negatives.test.sql`. The follow-ups doc records that
suite passing after deleting guards happened five times, so each policy, grant
and `is_admin()` check gets an assertion that goes red when it is removed.

**Concurrency** (`scripts/test-concurrent-faq-order.sh`): run parallel
`faq_create` and `faq_move` calls on separate connections and assert
`sort_order` stays unique and gapless. pgTAP runs on a single connection, so it
cannot prove this property.

**Vitest**: the zod schemas (trimming, blank, length caps) and the DAL locale
selection.

No end-to-end tests, per the project's current stance.

## Rollout notes

- After the migration, regenerate types: `supabase gen types typescript` into
  `types/supabase.ts`.
- Before writing page code, read the relevant guide in
  `node_modules/next/dist/docs/` (metadata, `generateMetadata`, JSON-LD), as
  AGENTS.md requires for this Next.js version.
- Seeded About text is a placeholder. An admin must replace it before launch.

## Future cost (🟢)

- **A third language** means new columns on both tables, or a move to a
  `translations` child table. No Core or Important work depends on this.
- **Markdown in About** would need a sanitizing renderer and a preview in the
  editor. The plain-text columns migrate cleanly, since plain text is valid
  markdown.
- **Draft/publish** would add a column and an RLS clause that shows unpublished
  rows only to admins. It does not change the current schema shape.
- **Per-venue or per-city About pages** would turn `community_about` from a
  singleton into a keyed table, which is a migration but not a rewrite.
