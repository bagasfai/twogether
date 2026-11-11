# Admin Reporting — Design

Date: 2026-11-04
Tier: Important (see CLAUDE.md section 6). Nothing here touches the Future tier.

## 1. Intent

Admins running the community need to answer four questions from the data the app already stores: who attends and no-shows, how much money came in and what is outstanding, which members and memberships are active, and how hosts and sessions perform. Today the app has live views (leaderboards, roster toggles, WhatsApp copy, history lists) but no aggregation and no export.

Success means an admin can open `/admin/reports`, pick a date range, read four reports, and download each one as CSV, with authorization enforced in the database.

Decisions from brainstorming:

- Primary reader: admins. Hosts and members get no new reports in this scope.
- Scope: attendance and no-show, revenue and payments, member activity and memberships, host and session performance.
- Export: CSV only. No XLSX or PDF, no new dependencies.
- Revenue rule: cash basis. A session participant counts as revenue only when `paid_at` is set, at the session price. Membership sales count on the purchase date at the snapshot `price_idr`. Attendance covered by a live membership usage adds no session revenue.
- Data layer: admin-only SQL RPCs, one per report (approach A). Views with filters and TypeScript aggregation were rejected.

## 2. Data layer

Four functions in a new migration. Each is `security definer`, uses `set search_path = ''`, and begins with a check that raises `forbidden` (errcode `42501`) unless `public.is_admin()` is true. Each takes `p_from date, p_to date`, filters on `sessions.starts_at`, treats `p_to` as inclusive, and defaults to the last 30 days when both are null.

| RPC | One row per | Columns |
|---|---|---|
| `report_attendance` | member | sessions registered, attended (`checked_in_at` set), no-shows (`no_show_at` set), cancelled, attendance rate, last attended |
| `report_revenue` | session, plus a membership-sales section | session price, paid count, unpaid count, cash collected, outstanding; membership sales summed by purchase date |
| `report_members` | member | active plan, quota used and left, expiry, sessions attended in range |
| `report_hosts` | host | sessions hosted, average fill rate (confirmed over capacity), peak waitlist length, cancellation count, completed vs cancelled sessions |

Rules:

- A participant is quota-covered when a `membership_usages` row exists for `participant_id` with `refunded_at is null`. A refunded usage does not count as covered, so that participant falls back to `paid_at`.
- Guests appear in session and revenue counts but not in per-member attendance, because they have no profile.
- Cancelled sessions are excluded from attendance and revenue and counted only in the host report.
- Row counts are capped inside each RPC. The cap value is fixed in the implementation plan.
- After the migration, regenerate `types/supabase.ts`.

## 3. Routes and UI

- `app/(app)/admin/reports/layout.tsx`: header, shared date-range filter, link-based navigation between the four reports.
- Pages: `admin/reports/attendance`, `revenue`, `members`, `hosts`. `/admin/reports` redirects to attendance.
- `app/(app)/admin/reports/[report]/export/route.ts`: CSV download. It uses the same params schema and DAL function as the page.
- The existing `/admin` page gets a "Reports" card linking to `/admin/reports`.

Sub-routes are used instead of tabs because `components/ui` has no `tabs` component. Sub-routes give shareable URLs and per-report loading states without a new dependency.

Pages are Server Components that read `searchParams` and call the DAL. The date range lives in the URL as `?from=YYYY-MM-DD&to=YYYY-MM-DD`. The filter is a small client form with two inputs and presets: 7 days, 30 days, this month, last month, all time.

New files:

- `lib/dal/reports.ts`: four typed functions wrapping the RPCs.
- `lib/reports/params.ts`: zod schema and preset logic, shared by pages and the CSV route.
- `lib/reports/csv.ts`: pure `toCsv(columns, rows)`.
- `components/admin/reports/`: `report-filters.tsx` (client) and one table component per report, built on `components/ui/table`, each with an empty state. Revenue has a totals row.

Tables show the RPC's default order. There is no client-side sorting.

## 4. CSV export

- `GET /admin/reports/[report]/export?from=&to=`.
- Headers: `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="twogether-<report>-<from>_<to>.csv"`.
- A UTF-8 BOM is prepended so Excel reads non-ASCII text correctly.
- RFC 4180 quoting, CRLF line endings.
- CSV injection guard: any cell that starts with `=`, `+`, `-`, `@`, tab, or CR gets a leading `'`. Member and display names are user-controlled, so this is required.
- Money is a plain integer in IDR. Dates are ISO.
- Same row cap as the page. If the cap is hit, a final comment row notes truncation.

## 5. Authorization

- The RPCs enforce `is_admin()`. This is the real gate.
- The route handler and pages also call the existing admin guard: 403 for the route, redirect or not-found for pages. This is a UX layer on top of the database check.
- Verify that `/admin/reports` is covered by `isProtected` in `proxy.ts`. `docs/superpowers/core-schema-follow-ups.md:174` records that `/history` was missed, so check this explicitly.

## 6. Errors

- RPC error `42501` maps to forbidden.
- Any other RPC error is logged server-side and shown through the existing `error.tsx` boundary as a generic message. Raw database messages never reach the client.
- Invalid date params on a page fall back to the last 30 days with an inline notice. The CSV route returns 400 instead, because a silent fallback would export the wrong data.
- `from > to` is rejected by the schema.
- Empty results show an empty-state row. The CSV still downloads with only the header row.

## 7. Testing

- SQL: `supabase/tests/0NN_reports.test.sql` covering rejection of member and host callers, cash-basis revenue with a quota-covered attendee, a refunded usage falling back to `paid_at`, attendance and no-show counts, guest handling, and date-range boundaries (inclusive `p_to`).
- Unit: `toCsv` (quoting, BOM, injection guard) and the params schema (presets, bad input, `from > to`), using the repo's existing test runner. The implementation plan confirms which runner that is.
- Manual: check each page and CSV against seeded data in `supabase/demo/`.

## 8. Known limitations

- There is no `participant_events` audit table (deferred in `2026-09-11-core-schema-rls-design.md`). Reports use each participant's current state, so registration-flow history, such as when someone registered before cancelling, is not recoverable. Adding that table later is additive and would not change these RPCs.
- Hosts and members get no reports in this scope.
- No XLSX, PDF, charts, scheduled or emailed reports.

## 9. Out of scope

Payment gateway, automation, tournaments, and other Future-tier items. Host-facing and member-facing reports are not part of this spec.
