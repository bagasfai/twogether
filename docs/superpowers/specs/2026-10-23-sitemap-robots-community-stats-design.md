# Sitemap, Robots and Community Stats — Design

Status: draft, awaiting review
Date: 2026-10-23
Scope: Growth/Branding (CLAUDE.md §6) — the last three marketing-site items:
sitemap, robots, community stats

## Problem

The public site has a landing page, sessions, a gallery, About and FAQ, but
search engines have no sitemap to discover them and no robots file telling them
to stay out of the member and admin areas. The landing page also gives a
first-time visitor no evidence that the community is active.

This spec delivers `app/sitemap.ts`, `app/robots.ts`, and a public community
stats strip on the landing page backed by one aggregate RPC.

## Non-goals

- **Admin toggle for the stats strip.** Visibility is a code constant, not a
  settings table.
- **OG images and structured data for sessions.** Separate slice.
- **Fixing the dynamic-rendering cause.** The marketing layout reads cookies via
  `getCurrentUser()`, so every marketing page renders dynamically and `revalidate`
  is inert. This spec works around it for stats (explicit data cache) and does not
  change the layout.
- **Per-member or per-session breakdowns.** Stats are four site-wide counts.
- **Real-time stats.** A five-minute-stale count is fine.

## Decisions

| Decision | Choice |
|---|---|
| Stats shown | Sessions held, matches played, total check-ins, active members |
| Active member | Distinct member with `checked_in_at` in the last 90 days |
| Small numbers | Hide the whole strip until `sessions_held >= STATS_MIN_SESSIONS` (10) |
| Stats source | One `security definer` RPC, `public_community_stats()` |
| Caching | `unstable_cache`, 300 s, tag `community-stats` (`cacheComponents` is off, so `use cache` is unavailable) |
| Sitemap entries | Static routes plus public sessions and albums, each with `id`/`en` alternates |
| Robots | Allow marketing paths, disallow app, auth, admin and api paths |

## Database

New migration `supabase/migrations/20261023000001_public_community_stats.sql`.

```sql
create function public.public_community_stats()
returns table (
  sessions_held bigint,
  matches_played bigint,
  total_checkins bigint,
  active_members bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.sessions where status = 'completed'),
    (select count(*) from public.matches where status = 'completed'),
    (select count(*) from public.participants where checked_in_at is not null),
    (select count(distinct user_id) from public.participants
       where checked_in_at >= now() - interval '90 days')
$$;
```

- **Why definer.** `participants` is readable by anon only for non-cancelled
  rosters of public sessions, and `profiles` not at all. Counting across the
  whole table needs the owner's rights. The function returns four integers and
  no identifiers, so nothing about an individual member leaves the database.
- **Grants.** `revoke execute ... from public;` then
  `grant execute ... to anon, authenticated;`. Supabase grants EXECUTE on new
  `public` functions to `anon` and `authenticated` by default, so the explicit
  grant documents intent rather than adding access. The migration comment says so,
  in the style of `20260911000010_registration.sql`.
- **Check-ins and cancellations.** `total_checkins` and `active_members` count
  any row with `checked_in_at` set, regardless of later status. A player who
  checked in was physically present.
- **Index.** Existing `participants_checked_in_idx` is partial on
  `(session_id) where checked_in_at is not null`. At current scale a sequential
  scan of that subset is fine, and the result is cached for five minutes. No new
  index.
- **Types.** Regenerate `types/supabase.ts` after the migration
  (`supabase gen types typescript`).

## Stats in the app

### `lib/dal/community-stats.ts`

```ts
export const STATS_MIN_SESSIONS = 10;

export type CommunityStats = {
  sessionsHeld: number;
  matchesPlayed: number;
  totalCheckins: number;
  activeMembers: number;
};

export function shouldShowStats(stats: CommunityStats): boolean {
  return stats.sessionsHeld >= STATS_MIN_SESSIONS;
}

export const getCommunityStats: () => Promise<CommunityStats>;
```

- `getCommunityStats` calls `createPublicClient().rpc("public_community_stats")`
  inside `unstable_cache(fn, ["community-stats"], { revalidate: 300, tags: ["community-stats"] })`.
  `createPublicClient()` never touches `cookies()`, so it is allowed inside the
  cache scope.
- The RPC returns `bigint`, which PostgREST serialises as a JSON number. Counts
  are far below `Number.MAX_SAFE_INTEGER`; the DAL converts with `Number()` and
  throws on a missing row.
- Errors propagate. The landing page must not silently drop to "no stats" on a
  database error, so the page does not catch.
- `shouldShowStats` is pure so the threshold is unit-testable without the
  database. `STATS_MIN_SESSIONS` lives next to it, not in env, so changing it is a
  reviewed code change.

### `components/community-stats.tsx`

Server component. Props: `stats: CommunityStats`. Renders four tiles in a
responsive grid (2 columns below `sm`, 4 from `sm`), each a large number and a
label. Numbers use `toLocaleString` with the page locale. Styling follows the
neighbouring landing sections: `px-6 py-16`, `max-w-3xl`, `<hr className="border-t-2 border-border" />`
between sections. Returns nothing when `shouldShowStats` is false; the caller
omits the surrounding `<hr>` in the same case.

### Landing page

`app/[locale]/(marketing)/page.tsx` fetches `getCommunityStats()` in the existing
`Promise.all` and renders `<CommunityStats />` between the hero and the
"running" section, with its own `<hr>`.

### i18n

`messages/en.json` and `messages/id.json` get `home.stats.title`,
`home.stats.sessionsHeld`, `home.stats.matchesPlayed`, `home.stats.totalCheckins`
and `home.stats.activeMembers`. Both locales must carry every key. The plan
adds a unit test that compares the `home.stats` key sets of the two files.

## Sitemap

`app/sitemap.ts` default-exports `async function sitemap(): Promise<MetadataRoute.Sitemap>`.

### URL building: `lib/seo/urls.ts`

```ts
export function getSiteUrl(): string | null;
export function localizedUrls(path: string): {
  url: string;
  languages: { id: string; en: string };
};
```

- `getSiteUrl()` reads `NEXT_PUBLIC_SITE_URL`, validates it with `new URL()` inside
  a try/catch, and returns the origin without a trailing slash, or `null` when
  unset or malformed. `app/layout.tsx` switches to this helper, which resolves the
  logged follow-up that a malformed value throws from `new URL()`.
- `localizedUrls` applies the routing rule from `i18n/routing.ts`:
  `defaultLocale: "id"` with `localePrefix: "as-needed"`, so `id` is unprefixed
  and `en` is `/en` + path. The root path is `/` for `id` and `/en` for `en`.
- `url` is the `id` (default-locale) URL; `languages` lists both locales, which
  Next renders as `xhtml:link rel="alternate" hreflang` entries.

### Entries

| Source | Paths | `lastModified` |
|---|---|---|
| Static | `/`, `/sessions`, `/gallery`, `/about`, `/faq` | none |
| Sessions | `/sessions/[id]` for status `scheduled`, `live`, `completed` | `updated_at` |
| Albums | `/gallery/[id]` for albums with at least one approved photo | latest approved photo `created_at`, else none |

- Sessions and albums are read through `createPublicClient()`, so RLS decides what
  is public. A draft or cancelled session never appears.
- Albums reuse the `listPublicAlbums()` rule (≥ 1 approved photo). The sitemap
  needs ids only, so it gets its own narrow query rather than reusing the cover
  and sort work. It must not diverge from the rule: an album page with no approved
  photos shows an empty state and should not be advertised.
- Dynamic queries are capped by PostgREST `max_rows` (1000). The sitemap protocol
  allows 50 000 URLs, and the community is far below 1000 sessions, so no
  pagination is built now. A comment records the cap so growth does not silently
  truncate.
- When `getSiteUrl()` returns `null`, the sitemap returns an empty array: relative
  URLs in a sitemap are invalid. The failure is visible (an empty `/sitemap.xml`)
  rather than emitting wrong URLs.

## Robots

`app/robots.ts` default-exports `function robots(): MetadataRoute.Robots`.

```ts
export const DISALLOWED_PATHS = [
  "/dashboard", "/profile", "/admin", "/login", "/signup",
  "/auth", "/api", "/sessions/new",
];
```

- Rules: `{ userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS }`, and `sitemap`
  set to `${siteUrl}/sitemap.xml` when the site URL is known (omitted otherwise).
- None of the disallowed paths exist under `/en`. `proxy.ts` `isMarketingPath` only
  localises the marketing safelist, so `/en/dashboard` and the like are not routes.
  The list therefore needs no `/en` variants.
- `/sessions/[id]/manage` is covered by neither `/sessions/new` nor a prefix. It
  needs a pattern. Robots supports `*`, so the list includes `/sessions/*/manage`.
- `DISALLOWED_PATHS` is exported from `lib/seo/robots-paths.ts` so a test can
  reference it.
- Robots is advisory. Authorization stays in RLS and the DAL; this file only keeps
  crawlers away from pages that would redirect to `/login` anyway.

## Testing

Unit tests (Vitest, in `tests/unit/`):

- `shouldShowStats`: below, at and above `STATS_MIN_SESSIONS`.
- `getSiteUrl`: unset, valid, trailing slash, malformed, non-http scheme.
- `localizedUrls`: root, nested path, and the unprefixed-default-locale rule.
- Sitemap: given stubbed data, static plus dynamic entries carry both alternates;
  empty when the site URL is missing; draft sessions never appear (stub reflects
  the filter being applied in the query).
- Robots: output contains every `DISALLOWED_PATHS` entry and the sitemap line.
- Guard test: every top-level route directory under `app/(app)` and `app/(auth)`,
  plus `app/auth` and `app/api`, is covered by `DISALLOWED_PATHS`. A new
  authenticated area added without updating the list fails the test. This is the
  same gap that `proxy.ts` `isMarketingPath` leaves as a manual safelist.

Database test: `scripts/test-public-community-stats.sh`, in the style of the
existing `scripts/test-concurrent-*.sh`:

- anon can `select * from public_community_stats()`;
- anon still cannot `select` from `profiles`;
- counts match a fixture: completed and non-completed sessions and matches,
  checked-in and not-checked-in participants, a check-in older than 90 days that
  counts toward `total_checkins` but not `active_members`, and a member checked in
  to two sessions who is counted once in `active_members`;
- function is `stable` and `search_path` is pinned (read from `pg_proc`).

Manual: view `/sitemap.xml` and `/robots.txt` on the dev server; load `/` with the
fixture below and above the threshold.

## Future-tier cost

None of this blocks 🟢 Future features. Automatic match generation or tournaments
would add matches that count toward `matches_played`; the definition (completed
match) stays correct. If skill balancing adds per-member rating, it must not be
added to this RPC, which is deliberately counts only.

## Known limitations

- Stats can lag by up to five minutes.
- The marketing layout still forces dynamic rendering, so the landing page itself is
  not static; only the stats query is cached.
- `max_rows` caps sitemap session and album lists at 1000 each.
