# Sitemap, Robots and Community Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `app/sitemap.ts`, `app/robots.ts`, and a landing-page community stats strip backed by one aggregate RPC.

**Architecture:** A `security definer` Postgres function returns four counts to anon. A DAL wraps it in `unstable_cache`. Sitemap and robots are Next metadata routes built from pure helpers in `lib/seo/`, so they unit-test without a database.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before using any Next API; `AGENTS.md` warns this version differs), Supabase (Postgres RPC, anon client), next-intl, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-sitemap-robots-community-stats-design.md`

## Global Constraints

- `cacheComponents` is off in `next.config.ts`: use `unstable_cache` from `next/cache`, never `use cache`.
- Locales: `id` (default, unprefixed) and `en` (`/en`), per `i18n/routing.ts` (`localePrefix: "as-needed"`).
- `STATS_MIN_SESSIONS = 10`; active member = distinct `participants.user_id` with `checked_in_at >= now() - interval '90 days'`; cache `revalidate: 300`, tag `community-stats`.
- The RPC returns counts only, never ids. Anon must still have no access to `profiles`.
- Site URL comes from `NEXT_PUBLIC_SITE_URL`; relative URLs in the sitemap are invalid, so a missing/malformed value yields an empty sitemap, not wrong URLs.
- After the migration, regenerate types: `npx supabase gen types typescript --local > types/supabase.ts`.
- Both `messages/en.json` and `messages/id.json` carry every new key.
- Unit tests live in `tests/unit/*.test.ts` and import via the `@/` alias. Run with `npm run test:unit`.
- Commit messages are lowercase conventional (`feat:`, `fix:`, `test:`, `docs:`), as in `git log`.

## Review Focus

- Landing page with the RPC returning exactly 9 vs 10 sessions: strip hidden at 9, shown at 10 (Task 5).
- A member checked in to two sessions counts once in `active_members` but twice in `total_checkins` (Task 1).
- A check-in 91 days ago counts toward `total_checkins` but not `active_members` (Task 1).
- `NEXT_PUBLIC_SITE_URL` set with a trailing slash or a path: URLs must not contain `//` (Task 2).
- A draft or cancelled session never reaches the sitemap; an album with only pending/rejected photos never does either (Task 4).
- A new authenticated route directory added without updating the robots list (Task 3).

---

### Task 1: `public_community_stats()` RPC

**Files:**
- Create: `supabase/migrations/20261023000001_public_community_stats.sql`
- Create: `scripts/test-public-community-stats.sh`
- Modify: `types/supabase.ts` (regenerated)

**Interfaces:**
- Produces: `public.public_community_stats()` returning one row `(sessions_held bigint, matches_played bigint, total_checkins bigint, active_members bigint)`, callable by `anon` and `authenticated`. Task 5 calls it as `supabase.rpc("public_community_stats")`.

- [ ] **Step 1: Write `scripts/test-public-community-stats.sh`** in the style of `scripts/test-concurrent-faq-order.sh` (derive `DB_URL` from `supabase status`, guard that `to_regproc('public.public_community_stats')` and `public.participants` exist, cleanup trap, pre-clean). It builds fixtures in one transaction-per-step with `psql`: two auth users and profiles, three sessions (one `completed`, one `scheduled`, one `completed`), matches (two `completed`, one `scheduled`), participants: user A checked in to two sessions (both within 90 days), user B checked in 91 days ago, user C registered but never checked in. It asserts, comparing against the baseline taken before fixtures (counts are deltas, since the DB may hold other rows): `sessions_held +2`, `matches_played +2`, `total_checkins +3`, `active_members +1`. Further assertions: running the query as `anon` (`set local role anon`) succeeds; `select count(*) from public.profiles` as `anon` fails with permission denied; `pg_proc` shows `prosecdef = true`, `provolatile = 's'`, and `proconfig` contains `search_path=`.
- [ ] **Step 2: Run it to see it fail**

Run: `bash scripts/test-public-community-stats.sh`
Expected: FAIL with the guard message (function does not exist).

- [ ] **Step 3: Write the migration** exactly as in the spec's Database section (`language sql stable security definer set search_path = ''`, the four subselects). Follow the grant pattern in `20260911000010_registration.sql`: `revoke execute ... from public;` then `grant execute ... to anon, authenticated;` with a comment explaining that Supabase grants anon execute by default and the explicit grant documents intent.
- [ ] **Step 4: Apply and test**

Run: `npx supabase db reset && bash scripts/test-public-community-stats.sh`
Expected: PASS, script exits 0.

- [ ] **Step 5: Regenerate types**

Run: `npx supabase gen types typescript --local > types/supabase.ts`
Expected: `types/supabase.ts` now has `public_community_stats` under `Functions`.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261023000001_public_community_stats.sql scripts/test-public-community-stats.sh types/supabase.ts
git commit -m "feat: add public community stats rpc"
```

### Task 2: Site URL and locale URL helpers

**Files:**
- Create: `lib/seo/urls.ts`
- Create: `tests/unit/seo-urls.test.ts`
- Modify: `app/layout.tsx:19-23`

**Interfaces:**
- Produces: `getSiteUrl(): string | null` (origin, no trailing slash, `null` when unset/malformed/non-http(s)); `localizedUrls(path: string, siteUrl: string): { url: string; languages: { id: string; en: string } }` where `path` starts with `/` (`"/"` for root). Tasks 3 and 4 consume both.

- [ ] **Step 1: Write failing tests** in `tests/unit/seo-urls.test.ts`. `getSiteUrl` (stub `process.env.NEXT_PUBLIC_SITE_URL` with `vi.stubEnv`): unset → `null`; `"https://jakbar.example"` → same; `"https://jakbar.example/"` → `"https://jakbar.example"`; `"https://jakbar.example/app"` → `"https://jakbar.example"` (origin only, no `//`); `"not a url"` → `null`; `"ftp://x.example"` → `null`. `localizedUrls("/about", "https://s.example")` → `url: "https://s.example/about"`, `languages: { id: "https://s.example/about", en: "https://s.example/en/about" }`; `localizedUrls("/", ...)` → id `https://s.example`, en `https://s.example/en`.
- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/seo-urls.test.ts`
Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/seo/urls.ts`** per the interface. Use `new URL()` in try/catch and return `url.origin`. Derive the default-locale/prefix rule from `routing` in `@/i18n/routing` rather than hardcoding `"en"`/`"id"` literals where practical.
- [ ] **Step 4: Switch `app/layout.tsx`** to `getSiteUrl()` for `metadataBase` (keep the "omitted when unset" behaviour and update the comment: a malformed value no longer throws).
- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/seo-urls.test.ts`
Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add lib/seo/urls.ts tests/unit/seo-urls.test.ts app/layout.tsx
git commit -m "feat: add site url and localized url helpers"
```

### Task 3: Robots

**Files:**
- Create: `lib/seo/robots-paths.ts`
- Create: `app/robots.ts`
- Create: `tests/unit/robots.test.ts`

**Interfaces:**
- Consumes: `getSiteUrl()` from Task 2.
- Produces: `DISALLOWED_PATHS: string[]` = `["/dashboard", "/profile", "/admin", "/history", "/login", "/signup", "/auth", "/api", "/sessions/new", "/sessions/*/manage"]` (note: `/history` is in addition to the spec's list; `app/(app)/history` exists and is a member-only page). Default export `robots(): MetadataRoute.Robots`.

- [ ] **Step 1: Write failing tests** in `tests/unit/robots.test.ts`:
  - `robots()` returns one rule with `userAgent: "*"`, `allow: "/"`, `disallow` equal to `DISALLOWED_PATHS`.
  - With `NEXT_PUBLIC_SITE_URL=https://s.example` the result has `sitemap: "https://s.example/sitemap.xml"`; with it unset the `sitemap` key is absent.
  - Guard: read the directory names with `fs.readdirSync` under `app/(app)` and `app/(auth)`, plus `auth` and `api` under `app/`; every name except `sessions` must have `/${name}` as a prefix of some `DISALLOWED_PATHS` entry; and `"/sessions/new"` and `"/sessions/*/manage"` must be present (the shared `sessions` prefix is public). The failure message names the uncovered directory.
- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/robots.test.ts`
Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `lib/seo/robots-paths.ts` (the constant, with a comment that the guard test enforces coverage) and `app/robots.ts`. Check `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md` for the return type.
- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/robots.test.ts`
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/seo/robots-paths.ts app/robots.ts tests/unit/robots.test.ts
git commit -m "feat: add robots with route guard test"
```

### Task 4: Sitemap

**Files:**
- Create: `lib/seo/sitemap.ts`
- Create: `lib/dal/sitemap.ts`
- Create: `app/sitemap.ts`
- Create: `tests/unit/sitemap.test.ts`

**Interfaces:**
- Consumes: `getSiteUrl()`, `localizedUrls()` from Task 2.
- Produces:
  - `type SitemapSession = { id: string; updatedAt: string }`, `type SitemapAlbum = { id: string; lastModified: string | null }` in `lib/dal/sitemap.ts`, with `listSitemapSessions(): Promise<SitemapSession[]>` and `listSitemapAlbums(): Promise<SitemapAlbum[]>`.
  - `buildSitemap(siteUrl: string | null, sessions: SitemapSession[], albums: SitemapAlbum[]): MetadataRoute.Sitemap` in `lib/seo/sitemap.ts`. Returns `[]` when `siteUrl` is `null`.

- [ ] **Step 1: Write failing tests** in `tests/unit/sitemap.test.ts` against `buildSitemap` only:
  - `null` site URL → `[]`.
  - Static entries `/`, `/sessions`, `/gallery`, `/about`, `/faq` are present, each with `alternates.languages` containing `id` and `en` URLs.
  - A session `{ id: "s1", updatedAt: "2026-10-01T00:00:00Z" }` yields `https://s.example/sessions/s1` with `lastModified` equal to that date and `en` alternate `https://s.example/en/sessions/s1`.
  - An album with `lastModified: null` yields an entry without `lastModified`.
  - No URL in the output contains `//` after the scheme.
- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/sitemap.test.ts`
Expected: FAIL, module not found.
- [ ] **Step 3: Implement `buildSitemap`** in `lib/seo/sitemap.ts` using `localizedUrls`.
- [ ] **Step 4: Implement `lib/dal/sitemap.ts`** with `createPublicClient()`. `listSitemapSessions` selects `id, updated_at` where `status in ('scheduled','live','completed')` (RLS already enforces this; the explicit filter makes the intent readable and stays correct for a signed-in reviewer, as `listPublicAlbums` does). `listSitemapAlbums` selects `id, gallery_photos(created_at, status)` filtered to `gallery_photos.status = 'approved'`, drops albums with zero approved photos, and sets `lastModified` to the newest approved photo `created_at`. Add a comment on both that PostgREST `max_rows` (1000) caps the list and the sitemap limit is 50 000. Throw on error.
- [ ] **Step 5: Implement `app/sitemap.ts`**: `getSiteUrl()`, load sessions and albums in parallel, return `buildSitemap(...)`. Skip the queries when the site URL is `null`. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md` first; the file is cached by default unless it uses a request-time API, so decide whether to set `export const revalidate = 3600` and note the choice in a comment.
- [ ] **Step 6: Run tests, then smoke the route**

Run: `npx vitest run tests/unit/sitemap.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: build succeeds, `/sitemap.xml` and `/robots.txt` appear in the route list.
- [ ] **Step 7: Commit**

```bash
git add lib/seo/sitemap.ts lib/dal/sitemap.ts app/sitemap.ts tests/unit/sitemap.test.ts
git commit -m "feat: add sitemap with locale alternates"
```

### Task 5: Community stats DAL

**Files:**
- Create: `lib/dal/community-stats.ts`
- Create: `tests/unit/community-stats.test.ts`

**Interfaces:**
- Consumes: `public_community_stats` RPC and regenerated types from Task 1.
- Produces: `STATS_MIN_SESSIONS = 10`; `type CommunityStats = { sessionsHeld: number; matchesPlayed: number; totalCheckins: number; activeMembers: number }`; `shouldShowStats(stats: CommunityStats): boolean`; `getCommunityStats(): Promise<CommunityStats>`. Task 6 consumes all of these.

- [ ] **Step 1: Write failing tests** for the pure parts, in `tests/unit/community-stats.test.ts`. `shouldShowStats`: `sessionsHeld` 9 → `false`; 10 → `true`; 11 → `true`; 0 with large other counts → `false`. Also test an exported pure mapper `toCommunityStats(row: Database["public"]["Functions"]["public_community_stats"]["Returns"][number] | undefined): CommunityStats` (name it exactly so): maps snake_case to camelCase with `Number()`, and throws on `undefined`.
- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/community-stats.test.ts`
Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `lib/dal/community-stats.ts` (`import "server-only"` is incompatible with Vitest's node environment unless the repo already mocks it; check how `tests/unit/community-content.test.ts` imports `lib/dal` code, and if needed keep the pure `STATS_MIN_SESSIONS`, `shouldShowStats` and `toCommunityStats` in `lib/community-stats.ts` and import them from the DAL). `getCommunityStats` wraps `createPublicClient().rpc("public_community_stats")` in `unstable_cache(fn, ["community-stats"], { revalidate: 300, tags: ["community-stats"] })`, throws on RPC error, and passes `data?.[0]` to `toCommunityStats`.
- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/community-stats.test.ts`
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/dal/community-stats.ts lib/community-stats.ts tests/unit/community-stats.test.ts
git commit -m "feat: add cached community stats dal"
```

(Drop `lib/community-stats.ts` from the `git add` if the pure code stayed in the DAL.)

### Task 6: Stats strip on the landing page

**Files:**
- Create: `components/community-stats.tsx`
- Modify: `app/[locale]/(marketing)/page.tsx`
- Modify: `messages/en.json`, `messages/id.json` (`home.stats`)
- Create: `tests/unit/home-stats-messages.test.ts`
- Modify: `docs/superpowers/core-schema-follow-ups.md:168`

**Interfaces:**
- Consumes: `CommunityStats`, `shouldShowStats`, `getCommunityStats` from Task 5.
- Produces: `CommunityStatsStrip({ stats }: { stats: CommunityStats })` server component.

- [ ] **Step 1: Write failing test** `tests/unit/home-stats-messages.test.ts`: import both message files; assert `Object.keys(en.home.stats).sort()` equals `Object.keys(id.home.stats).sort()` and equals `["activeMembers", "matchesPlayed", "sessionsHeld", "title", "totalCheckins"]`, and every value is a non-empty string.
- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/home-stats-messages.test.ts`
Expected: FAIL (`home.stats` undefined).
- [ ] **Step 3: Add `home.stats` keys** to both message files. English: title "Community so far", labels "Sessions held", "Matches played", "Check-ins", "Active members (last 90 days)". Indonesian equivalents; match the tone of the existing `home` block.
- [ ] **Step 4: Implement `components/community-stats.tsx`**: renders nothing when `!shouldShowStats(stats)`; otherwise a `<section className="px-6 py-16">` with `max-w-3xl`, the title in the style of the sibling `h2`, and a grid (`grid-cols-2 sm:grid-cols-4`) of four tiles. Format numbers with `toLocaleString(locale)` using `getLocale()` from `next-intl/server`; labels via `getTranslations("home.stats")`. Make it an async server component.
- [ ] **Step 5: Wire into the landing page**: add `getCommunityStats()` to the existing `Promise.all` in `app/[locale]/(marketing)/page.tsx`; render the strip after the hero, with its `<hr className="border-t-2 border-border" />` only when `shouldShowStats(stats)` is true (so no orphan rule renders when hidden).
- [ ] **Step 6: Update the follow-up note**: in `docs/superpowers/core-schema-follow-ups.md`, replace the "Still to do for the marketing site: sitemap, robots and community stats." line with a note that these shipped, and add one line each for: `/history` is not in `isProtected` in `proxy.ts` (page-level DAL check only), and `STATS_MIN_SESSIONS` is a code constant.
- [ ] **Step 7: Run all verification**

Run: `npm run test:unit && npm run lint && npm run build`
Expected: all pass.
- [ ] **Step 8: Commit**

```bash
git add components/community-stats.tsx "app/[locale]/(marketing)/page.tsx" messages/en.json messages/id.json tests/unit/home-stats-messages.test.ts docs/superpowers/core-schema-follow-ups.md
git commit -m "feat: show community stats on the landing page"
```

### Task 7: End-to-end check

**Files:** none (verification only)

- [ ] **Step 1: Run the app** (`npm run dev`) against the local stack. Fetch `/sitemap.xml` and `/robots.txt` with `curl`. Expected: the sitemap lists static, session and album URLs with `xhtml:link` alternates for `id` and `en`; robots lists every `DISALLOWED_PATHS` entry plus the `Sitemap:` line. Confirm neither response is a redirect (the `proxy.ts` matcher still runs on these paths; `isProtected` and `isMarketingPath` are both false for them).
- [ ] **Step 2: Landing page both ways**: with fewer than 10 completed sessions the page shows no stats strip and no stray `<hr>`; after inserting fixtures that bring completed sessions to 10 (delete them afterwards) and waiting out or tagging the cache, the strip shows four numbers in `id` and `/en`.
- [ ] **Step 3: Report** the observed outputs. If any check fails, fix it in the owning task's files and re-run that task's tests before re-checking.
