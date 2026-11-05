# Admin Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins four date-ranged reports (attendance & no-show, revenue, members & memberships, hosts & sessions) at `/admin/reports`, each downloadable as CSV.

**Architecture:** Four admin-only `security definer` Postgres RPCs do all aggregation. A thin DAL wraps them, Server Component pages render the rows, and one Route Handler streams the CSV from the same DAL function. A zod schema and a pure `toCsv` are shared by pages and the route.

**Tech Stack:** Next.js App Router, Supabase (Postgres RPC, pgTAP), zod, date-fns, shadcn/ui, vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-admin-reporting-design.md`

## Global Constraints

- No new npm dependencies. CSV only; no XLSX/PDF.
- Every RPC: `security definer`, `set search_path = ''`, first statement raises `forbidden` with errcode `42501` unless `public.is_admin()`. `revoke execute ... from public; grant execute ... to authenticated;`. All object references schema-qualified.
- Every RPC takes `p_from date default null, p_to date default null`. `p_to` is inclusive. Null `p_to` = today; null `p_from` = `p_to - 29`.
- Revenue is cash basis: session revenue counts only `paid_at is not null` at `sessions.price`; a participant with a live `membership_usages` row (`refunded_at is null`) is quota-covered and adds no session revenue; membership sales count on `payment_received_at` at `memberships.price_idr`.
- Cancelled sessions are excluded from attendance and revenue; only the host report counts them. Guests (`participants.user_id is null`) count in session/revenue totals, never in per-member attendance.
- CSV: UTF-8 BOM prefix, RFC 4180 quoting, CRLF, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="twogether-<report>-<from>_<to>.csv"`. Cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'`. Money is a plain integer (IDR); dates are ISO.
- Authorization is enforced by the RPCs; pages and the route also guard as UX. Raw database errors never reach the client.
- Invalid date params: pages fall back to the last 30 days with a notice; the CSV route returns 400.
- `types/supabase.ts` is regenerated (`npx supabase gen types typescript --local > types/supabase.ts`), never hand-edited.

**Decisions the spec left open** (this plan fixes them):
- Row cap `REPORT_ROW_CAP = 5000`. RPCs `limit 5001`; the DAL slices to 5000 and sets `truncated`.
- "In range" means `(sessions.starts_at at time zone 'Asia/Jakarta')::date between p_from and p_to`.
- Attendance and revenue also exclude `draft` sessions (they cannot have attendees).
- "Registered" = participant rows with `status = 'confirmed'`; "attended" = confirmed with `checked_in_at` set; "no-show" = confirmed with `no_show_at` set; "cancelled" = `status = 'cancelled'`.
- Fill rate = confirmed count ÷ `max_participants`, as a percentage rounded to 1 decimal. Rates are `null` when the denominator is 0.
- DAL rows keep the generated snake_case column names (no camelCase remapping).
- Date inputs are native `<input type="date">` via `components/ui/input`, not `calendar`/`popover`.

## Review Focus

- Member with null `full_name`: every RPC returns `'Unnamed member'`, never null. (Task 2 test)
- Session with null `price`: treated as 0; sums are 0, not null. (Task 3 test)
- Member with zero confirmed registrations: `attendance_rate` is null, no division error. (Task 2 test)
- Session starting at 00:30 Jakarta time on the first day of the range (previous day in UTC) is included; one at 23:30 on `p_to` is included, 00:30 the next day is not. (Task 2 test)
- Exactly `REPORT_ROW_CAP` rows is not truncated; `REPORT_ROW_CAP + 1` is, and the CSV gets a note row. (Task 6 test)

## File Structure

- Create `supabase/migrations/20261104000001_report_attendance.sql` … `20261104000004_report_hosts.sql`, one RPC each.
- Create `supabase/tests/049_report_attendance.test.sql` … `052_report_hosts.test.sql`.
- Create `lib/reports/params.ts`, `lib/reports/csv.ts`, `lib/reports/definitions.ts`.
- Create `lib/dal/reports.ts`.
- Create `app/(app)/admin/reports/layout.tsx`, `page.tsx` (redirect), `attendance/page.tsx`, `revenue/page.tsx`, `members/page.tsx`, `hosts/page.tsx`, `[report]/export/route.ts`.
- Create `components/admin/reports/report-filters.tsx`, `report-nav.tsx`, `attendance-table.tsx`, `revenue-table.tsx`, `members-table.tsx`, `hosts-table.tsx`.
- Modify `app/(app)/admin/page.tsx` (Reports card), `proxy.ts` (`isProtected`).
- Create `tests/unit/report-params.test.ts`, `tests/unit/report-csv.test.ts`, `tests/unit/report-definitions.test.ts`, `tests/unit/is-protected.test.ts` (extend if a proxy test already exists).

---

### Task 1: Date-range params and CSV builder

**Files:**
- Create: `lib/reports/params.ts`, `lib/reports/csv.ts`
- Test: `tests/unit/report-params.test.ts`, `tests/unit/report-csv.test.ts`

**Interfaces:**
- Produces (`params.ts`):
  - `export const REPORT_ROW_CAP = 5000`
  - `export type ReportRange = { from: string; to: string }` (both `yyyy-MM-dd`)
  - `export type ReportPreset = "7d" | "30d" | "this-month" | "last-month" | "all"`
  - `export function defaultRange(today: Date): ReportRange` (last 30 days, inclusive of today)
  - `export function presetRange(preset: ReportPreset, today: Date): ReportRange` (`all` = `2020-01-01`..today)
  - `export function parseReportRange(input: { from?: string; to?: string }, today: Date): { ok: true; range: ReportRange } | { ok: false; reason: "invalid" | "order" }` — both missing = ok with `defaultRange`; one missing, malformed, or non-calendar date = `invalid`; `from > to` = `order`.
- Produces (`csv.ts`):
  - `export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null }`
  - `export function toCsv<T>(columns: CsvColumn<T>[], rows: T[], opts?: { note?: string }): string`

- [ ] **Step 1: Write failing tests**

`report-params.test.ts`: `defaultRange gives 30 inclusive days ending today`; `presetRange this-month / last-month boundaries` (use 2026-11-04 and 2026-01-15 so last-month crosses a year); `presetRange all starts 2020-01-01`; `parseReportRange both missing returns default`; `rejects one missing`; `rejects 2026-02-30`; `rejects from after to with reason order`; `accepts from equal to`.

`report-csv.test.ts`: `starts with UTF-8 BOM`; `header row then rows, CRLF endings`; `quotes cells containing comma, quote, newline and doubles quotes`; `null renders empty`; `numbers rendered plain`; `prefixes ' to cells starting with = + - @ tab CR` (assert `=SUM(A1)` → `'=SUM(A1)`, and a leading-`-` text name, but a negative number value stays `-5`); `empty rows returns header only`; `note appended as a final row whose first cell is the note`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/report-params.test.ts tests/unit/report-csv.test.ts` — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement `params.ts`** with a zod schema for the date string (`/^\d{4}-\d{2}-\d{2}$/` plus a real-calendar check via date-fns `isValid(parseISO())`), formatting with date-fns `format(d, "yyyy-MM-dd")`.
- [ ] **Step 4: Implement `csv.ts`.** The injection guard applies only to string values; number values are never prefixed.
- [ ] **Step 5: Run** the same command — Expected: PASS.
- [ ] **Step 6: Commit** `feat(reports): add report range params and CSV builder`.

---

### Task 2: `report_attendance` RPC

**Files:**
- Create: `supabase/migrations/20261104000001_report_attendance.sql`
- Test: `supabase/tests/049_report_attendance.test.sql`

**Interfaces:**
- Produces: `public.report_attendance(p_from date default null, p_to date default null) returns table (member_id uuid, full_name text, registered_count int, attended_count int, no_show_count int, cancelled_count int, attendance_rate numeric, last_attended_at timestamptz)`; ordered by `attended_count desc, full_name`; `limit 5001`.

- [ ] **Step 1: Write the failing pgTAP file** (same `begin; select plan(n); … finish(); rollback;` shape as `008_rls_core.test.sql`; seed `auth.users`, promote one to admin with `update public.profiles set role = 'admin'`, then `set local role authenticated` + `set local request.jwt.claims`). Assertions:
  - member caller → `throws_ok` errcode `42501`; host caller → same; admin → `lives_ok`.
  - Counts: member with 3 confirmed (2 checked in, 1 of those with `no_show_at`… use distinct rows: 1 checked in, 1 no-show, 1 plain), 1 cancelled → registered 3, attended 1, no_show 1, cancelled 1, rate `33.3`.
  - Member with zero confirmed rows but one cancelled → `attendance_rate is null`.
  - Guest participant row (`user_id null`, `guest_name` set) never appears as a row.
  - Cancelled and draft sessions contribute nothing.
  - Member with null `full_name` shows `'Unnamed member'`.
  - Date boundaries: session at `'2026-11-01 00:30+07'` is in `p_from = '2026-11-01'`; session at `'2026-11-30 23:30+07'` is in `p_to = '2026-11-30'`; session at `'2026-12-01 00:30+07'` is not.
  - Null/null params use the last 30 days (seed one session inside, one 40 days back).
- [ ] **Step 2: Run** `npx supabase test db` — Expected: FAIL (`function public.report_attendance does not exist`).
- [ ] **Step 3: Write the migration.** `language plpgsql stable security definer set search_path = ''`, admin check first, aggregate over `public.profiles` left-joined to confirmed/cancelled participants of in-range sessions; include only members with at least one participant row in range. `attendance_rate = round(100.0 * attended / nullif(registered, 0), 1)`.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db` — Expected: all files pass.
- [ ] **Step 5: Commit** `feat(reports): add report_attendance rpc`.

---

### Task 3: `report_revenue` RPC

**Files:**
- Create: `supabase/migrations/20261104000002_report_revenue.sql`
- Test: `supabase/tests/050_report_revenue.test.sql`

**Interfaces:**
- Produces: `public.report_revenue(p_from date default null, p_to date default null) returns table (row_kind text, ref_id uuid, label text, occurred_at timestamptz, price int, confirmed_count int, covered_count int, paid_count int, unpaid_count int, cash_collected bigint, outstanding bigint)`. `row_kind` is `'session'` (ref = session id, label = title, occurred_at = `starts_at`) or `'membership'` (ref = membership id, label = member name, occurred_at = `payment_received_at`, `price` = `price_idr`, `paid_count` 1, `cash_collected` = `price_idr`, other counts 0). Ordered `row_kind desc, occurred_at desc`; `limit 5001`.
- Session row math: `confirmed_count` counts confirmed participants incl. guests; `covered_count` those with a live usage; `paid_count` = confirmed, not covered, `paid_at is not null`; `unpaid_count` = confirmed, not covered, `paid_at is null`; `cash_collected = paid_count * coalesce(price, 0)`; `outstanding = unpaid_count * coalesce(price, 0)`.
- Membership rows: memberships with `payment_received_at` whose Jakarta date is in range, regardless of `cancelled_at` (there is no refund ledger yet).

- [ ] **Step 1: Write the failing pgTAP file.** Assertions: non-admin rejected (`42501`); session priced 50000 with 4 confirmed (1 paid, 1 unpaid, 1 quota-covered with `paid_at` also set, 1 guest unpaid) → covered 1, paid 1, unpaid 2, cash 50000, outstanding 100000; a covered participant whose usage has `refunded_at` set counts as paid/unpaid by `paid_at`; null-price session → cash 0, outstanding 0 (not null); cancelled/draft sessions absent; membership paid in range appears with `cash_collected = price_idr`; membership with null `payment_received_at` absent; membership paid at `'2026-12-01 00:30+07'` is outside a November range.
- [ ] **Step 2: Run** `npx supabase test db` — Expected: FAIL (function missing).
- [ ] **Step 3: Write the migration** with a `union all` of the two selects; admin check first.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(reports): add report_revenue rpc`.

---

### Task 4: `report_members` RPC

**Files:**
- Create: `supabase/migrations/20261104000003_report_members.sql`
- Test: `supabase/tests/051_report_members.test.sql`

**Interfaces:**
- Produces: `public.report_members(p_from date default null, p_to date default null) returns table (member_id uuid, full_name text, plan_price_idr int, quota_total int, quota_used int, quota_left int, started_at timestamptz, expires_at timestamptz, has_active_membership boolean, attended_count int)`; one row per profile, ordered `attended_count desc, full_name`; `limit 5001`.
- Active membership = `started_at is not null and cancelled_at is null and expires_at > now()` (at most one per user; queued ones have null `started_at`). `quota_used` = that membership's usages with `refunded_at is null`; `quota_left = quota_total - quota_used`. Members with no active membership have null plan/quota columns and `has_active_membership = false`. `attended_count` = in-range confirmed participations with `checked_in_at` set.

- [ ] **Step 1: Write the failing pgTAP file.** Assertions: non-admin rejected; member with active membership (quota 8, 3 live usages, 1 refunded) → used 3, left 5, active true; expired membership → active false, plan columns null; queued membership (null `started_at`) ignored; cancelled membership ignored; member with no membership still listed with their attended count; null `full_name` → `'Unnamed member'`; attendance outside the range is not counted.
- [ ] **Step 2: Run** `npx supabase test db` — Expected: FAIL.
- [ ] **Step 3: Write the migration** using a `left join lateral` for the active membership.
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(reports): add report_members rpc`.

---

### Task 5: `report_hosts` RPC

**Files:**
- Create: `supabase/migrations/20261104000004_report_hosts.sql`
- Test: `supabase/tests/052_report_hosts.test.sql`

**Interfaces:**
- Produces: `public.report_hosts(p_from date default null, p_to date default null) returns table (host_id uuid, full_name text, sessions_hosted int, completed_sessions int, cancelled_sessions int, avg_fill_rate numeric, peak_waitlist int, participant_cancellations int)`; one row per user in `session_hosts` (owners and co-hosts) with at least one non-draft session in range; ordered `sessions_hosted desc, full_name`; `limit 5001`.
- `sessions_hosted` counts non-draft sessions including cancelled; `avg_fill_rate` averages confirmed ÷ `max_participants` (percent, 1 decimal) over non-cancelled sessions only, null if none; `peak_waitlist` = max `waiting_list` count over those sessions (0 if none); `participant_cancellations` = `status = 'cancelled'` participants in the host's sessions.

- [ ] **Step 1: Write the failing pgTAP file.** Assertions: non-admin rejected; host with 3 sessions (1 completed at 8/16 confirmed, 1 completed at 16/16, 1 cancelled) → hosted 3, completed 2, cancelled 1, fill `75.0`; waitlist peak across sessions; participant cancellations counted; a co-host appears with the same session counts; a host whose only session is cancelled → `avg_fill_rate is null`; draft sessions excluded; null `full_name` → `'Unnamed member'`.
- [ ] **Step 2: Run** `npx supabase test db` — Expected: FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db` — Expected: all pass.
- [ ] **Step 5: Regenerate types:** `npx supabase gen types typescript --local > types/supabase.ts`; confirm `report_attendance`, `report_revenue`, `report_members`, `report_hosts` appear under `Functions`.
- [ ] **Step 6: Commit** `feat(reports): add report_hosts rpc and regenerate types`.

---

### Task 6: DAL and report definitions

**Files:**
- Create: `lib/dal/reports.ts`, `lib/reports/definitions.ts`
- Test: `tests/unit/report-definitions.test.ts`

**Interfaces:**
- Consumes: `ReportRange`, `REPORT_ROW_CAP` (Task 1); `CsvColumn` (Task 1); generated `Database["public"]["Functions"]` types (Task 5); `getCurrentUser` from `@/lib/dal/user`.
- Produces (`lib/dal/reports.ts`, `import "server-only"`):
  - `export class ReportForbiddenError extends Error {}`
  - `export type ReportResult<T> = { rows: T[]; truncated: boolean }`
  - `export type AttendanceRow`, `RevenueRow`, `MembersRow`, `HostsRow` = element type of the matching generated `Returns`.
  - `getAttendanceReport`, `getRevenueReport`, `getMembersReport`, `getHostsReport`, each `(range: ReportRange) => Promise<ReportResult<…>>`. Each throws `ReportForbiddenError` when there is no admin user or the RPC returns code `42501`, and rethrows other errors. A shared helper slices to `REPORT_ROW_CAP` and sets `truncated` when more than `REPORT_ROW_CAP` rows came back.
- Produces (`definitions.ts`): `export type ReportSlug = "attendance" | "revenue" | "members" | "hosts"`; `export function isReportSlug(s: string): s is ReportSlug`; `export const REPORT_DEFINITIONS: { [K in ReportSlug]: { title: string; fetch: (range: ReportRange) => Promise<ReportResult<…>>; columns: CsvColumn<…>[] } }`. Pure of `server-only` imports is not required, but `columns` must be unit-testable, so export them separately as `ATTENDANCE_COLUMNS`, `REVENUE_COLUMNS`, `MEMBERS_COLUMNS`, `HOSTS_COLUMNS` from `lib/reports/columns.ts` (create) and have `definitions.ts` import them.

- [ ] **Step 1: Write failing tests** in `report-definitions.test.ts` against `lib/reports/columns.ts` only: `each column set has unique headers`; `revenue columns emit integers for money`; `attendance rate renders empty when null`; and for the truncation rule, test the slicing helper exported from `lib/reports/params.ts` as `export function applyRowCap<T>(rows: T[]): { rows: T[]; truncated: boolean }` — `REPORT_ROW_CAP rows → truncated false`, `REPORT_ROW_CAP + 1 rows → truncated true and length REPORT_ROW_CAP`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/report-definitions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `applyRowCap`, `columns.ts`, `definitions.ts`, and `lib/dal/reports.ts` (the DAL uses `applyRowCap`).
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(reports): add reports dal and csv column definitions`.

---

### Task 7: Pages, filters, and admin entry point

**Files:**
- Create: `app/(app)/admin/reports/layout.tsx`, `page.tsx`, `attendance/page.tsx`, `revenue/page.tsx`, `members/page.tsx`, `hosts/page.tsx`; `components/admin/reports/report-filters.tsx` (client), `report-nav.tsx`, `attendance-table.tsx`, `revenue-table.tsx`, `members-table.tsx`, `hosts-table.tsx`
- Modify: `app/(app)/admin/page.tsx`

**Interfaces:**
- Consumes: `parseReportRange`, `defaultRange`, `presetRange`, `ReportRange` (Task 1); the four DAL functions and `ReportResult`, `ReportForbiddenError` (Task 6); `requireAdmin(nextPath)` from `@/lib/dal/user`.
- Produces: each page is `async function Page({ searchParams }: PageProps<"/admin/reports/<slug>">)`, calls `requireAdmin`, parses `await searchParams` with `parseReportRange` (on `ok: false` it uses `defaultRange(new Date())` and renders an inline notice), fetches, and renders its table plus a "Download CSV" link to `/admin/reports/<slug>/export?from=…&to=…`. `ReportFilters` props: `{ range: ReportRange }`; it updates `?from=&to=` with `router.replace` and offers the five presets. Tables take `{ rows: …Row[]; truncated: boolean }`, show an empty-state row, and a "showing first 5000" note when `truncated`. The revenue table adds a totals row for `cash_collected` and `outstanding`.

- [ ] **Step 1: Read the Next.js 16 docs** under `node_modules/next/dist/docs/` for `searchParams` and `PageProps` before writing pages (AGENTS.md requirement).
- [ ] **Step 2: Implement** layout, nav, filters, and the redirecting index page (`redirect("/admin/reports/attendance")`).
- [ ] **Step 3: Implement** the four pages and tables, reusing `components/ui/table`.
- [ ] **Step 4: Modify `app/(app)/admin/page.tsx`:** add a "Reports" `AdminSection`-style card linking to `/admin/reports`, placed above "Members".
- [ ] **Step 5: Verify** `npx tsc --noEmit && npm run lint` — Expected: clean. Then run the app, seed from `supabase/demo/`, sign in as admin, and confirm each of the four pages renders, the date filter and presets change the URL and data, and an empty range shows the empty state.
- [ ] **Step 6: Commit** `feat(reports): add admin reports pages`.

---

### Task 8: CSV route and route protection

**Files:**
- Create: `app/(app)/admin/reports/[report]/export/route.ts`
- Modify: `proxy.ts`
- Test: `tests/unit/is-protected.test.ts`

**Interfaces:**
- Consumes: `REPORT_DEFINITIONS`, `isReportSlug` (Task 6); `parseReportRange`, `REPORT_ROW_CAP` (Task 1); `toCsv` (Task 1); `getCurrentUser`; `ReportForbiddenError`.
- Produces: `export async function GET(request: NextRequest, ctx: RouteContext<"/admin/reports/[report]/export">): Promise<Response>`. No user → 401; non-admin → 403; unknown slug → 404; invalid params → 400 with a plain-text reason; success → CSV with the headers from Global Constraints, `Cache-Control: private, no-store`, and a final note row `"Truncated at 5000 rows"` when `truncated`. `ReportForbiddenError` → 403; any other error is logged with `console.error` and returns 500 `"Report failed"`.
- `isProtected` returns true for `/admin` and any path under `/admin/`.

- [ ] **Step 1: Write the failing test** `is-protected.test.ts` (check for an existing proxy test first and extend it): `/admin`, `/admin/reports`, `/admin/reports/revenue/export` are protected; `/administrator` and `/` are not.
- [ ] **Step 2: Run** `npx vitest run tests/unit/is-protected.test.ts` — Expected: FAIL.
- [ ] **Step 3: Modify `isProtected`** in `proxy.ts` (`pathname === "/admin" || pathname.startsWith("/admin/")`).
- [ ] **Step 4: Implement the route handler.**
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build` — Expected: all pass.
- [ ] **Step 6: Manual check** as admin: download each of the four CSVs, open in a spreadsheet, confirm BOM-correct text, a profile named `=1+1` exports as `'=1+1`, `?from=2026-12-01&to=2026-11-01` returns 400, a signed-in non-admin gets 403, and signed-out is redirected to `/login`.
- [ ] **Step 7: Run** `npx supabase db reset && npx supabase test db` once more — Expected: all pass.
- [ ] **Step 8: Commit** `feat(reports): add csv export route and protect /admin`.
