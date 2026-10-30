# Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the shared accessibility, date and error-state problems from the design audit at the token, primitive and layout level so every later screen inherits the fixes.

**Architecture:** Contrast and touch-size fixes live in `app/globals.css` and `components/ui/*`, so call sites change only where they hardcode a colour. A single pure date helper replaces every unpinned `toLocale…` call. Route states (`loading`, `error`, `not-found`, `global-error`) and landmark/nav/form-error semantics are added in the layouts and shared form primitives.

**Tech Stack:** Next.js 16.3.4 App Router, Tailwind v4 (`@theme inline`), shadcn/ui new-york, next-intl 4, Vitest 5 (node environment).

**Spec:** `docs/superpowers/specs/2026-10-28-foundations-design.md`. Audit: `docs/design-audit/2026-10-28-design-audit.md`.

## Global Constraints

- Time zone is always `Asia/Jakarta`; `(app)` date locale is `en-GB`, `hourCycle: "h23"`. Marketing passes its route locale.
- Touch targets: 44px below `md`, compact (`h-9`) from `md` up.
- Contrast: text pairs at least 4.5:1, input border at least 3:1, light theme only. The `.dark` block is not touched.
- Coral (`--accent`, `--ring`) stays for fills and rings. Small coral, green or red text uses the new `-text` tokens.
- No schema, RLS or Future-tier changes. No `title.template`, OG, hreflang or app i18n work.
- New strings in `(app)` and `(auth)` are hardcoded English. Only the new marketing 404 and error pages use `next-intl`, with `messages/en.json` and `messages/id.json` keeping identical keys.
- AGENTS.md rule: read the relevant `node_modules/next/dist/docs/` page before writing a Next file convention.
- Gates before every commit that touches code: `npx tsc --noEmit` clean and `npx vitest run` passing.

## Review Focus

1. A missing or invalid timestamp from the DB (for example a null `endsAt`) renders `—`, never `Invalid Date`. Pinned in Task 1.
2. A UTC instant late in the evening lands on the next calendar day in Jakarta. Pinned in Task 1.
3. `error.tsx` is server-rendered once before it hydrates, so reading `navigator.onLine` during render would crash. The offline hint must come from an effect. Pinned in Task 5.
4. A keyboard user's first Tab stop on every layout is the skip link, and it becomes visible on focus. Pinned in Task 7.
5. Nested routes highlight exactly one nav item: `/sessions/new` highlights "New session", not also "Sessions". Pinned in Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/format/datetime.ts` (new) | `formatDateTime`, `formatDate`, `formatTime`, Jakarta-pinned |
| `tests/unit/helpers/contrast.ts` (new) | oklch parsing and WCAG ratio math for tests |
| `app/globals.css` | new text tokens, darker `--input`, `--accent-foreground`, reduced-motion block |
| `components/ui/{button,input,select,dialog,dropdown-menu,checkbox,form}.tsx` | touch sizes, dialog scroll, token use, `role="alert"` |
| `components/ui/skeleton.tsx` (new, shadcn) | loading skeleton |
| `app/(app)/{loading,error}.tsx`, `app/{global-error,not-found}.tsx` (new) | app route states |
| `app/[locale]/(marketing)/{error,not-found}.tsx` (new) | localized route states |
| `components/skip-link.tsx`, `components/nav/nav-links.tsx`, `lib/nav/active-href.ts` (new) | skip link, active nav |
| `tests/unit/*.test.ts(x)` | one test file per task, named in each task |

---

### Task 1: Date formatter and call-site migration

**Files:**
- Create: `lib/format/datetime.ts`, `tests/unit/datetime.test.ts`, `tests/unit/no-unpinned-dates.test.ts`
- Modify (replace `new Date(x).toLocale…String()`): `app/(app)/dashboard/page.tsx:52,74,97`, `app/(app)/history/page.tsx:43,72`, `app/(app)/sessions/[id]/manage/page.tsx:73`, `app/[locale]/(marketing)/sessions/[id]/page.tsx:29,58`, `components/sessions/{announcement-list,match-history-list,membership-card,session-card,hosted-sessions-preview,roster-table}.tsx`, `components/admin/{member-role-table,memberships-table}.tsx`
- Not modified: `components/sessions/datetime-picker.tsx`, `components/ui/calendar.tsx`, `components/community-stats.tsx`, `formatAlbumDate`, `formatPhotoTime`, `lib/format/whatsapp-share.ts`.

**Interfaces:**
- Produces: `formatDateTime(value: string | Date | null | undefined, locale?: string): string` (`Fri, 30 Oct 2026, 18:00`), `formatDate(...)` (`30 Oct 2026`), `formatTime(...)` (`18:00`). `locale` defaults to `"en-GB"`. Invalid or missing input returns `"—"`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/datetime.test.ts`:
  - `formatDateTime("2026-10-30T11:00:00Z")` has parts day `30`, month `Oct`, year `2026`, hour `18`, minute `00` (assert with `Intl.DateTimeFormat(...).formatToParts` on the output's inputs, or by matching `/30 Oct 2026/` and `/18:00/`; do not assert the comma after the weekday).
  - Review Focus 2: `formatDate("2026-10-30T20:00:00Z")` contains `31 Oct 2026` (Jakarta is already the next day).
  - `formatDate("2026-10-30T11:00:00Z", "id-ID")` contains `30` and an Indonesian month name (`Okt`).
  - Review Focus 1: `formatDateTime(null)`, `formatDateTime(undefined)`, `formatDateTime("not a date")`, `formatDate("")` all return `"—"`.
  - `formatTime("2026-10-30T11:00:00Z")` equals `"18:00"`.
  - Accepts a `Date` instance.
- [ ] **Step 2: Run** `npx vitest run tests/unit/datetime.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `lib/format/datetime.ts` with the signatures above. Use `Intl.DateTimeFormat` with `timeZone: "Asia/Jakarta"` and `hourCycle: "h23"`, formatters cached in a module-level `Map` keyed by `${variant}:${locale}`. Date-only uses `day: "numeric", month: "short", year: "numeric"`; date-time adds `weekday: "short"`, `hour`/`minute: "2-digit"`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Write the guard test** `tests/unit/no-unpinned-dates.test.ts`. It walks `app/` and `components/` for `.ts`/`.tsx` files and fails on the regex `/new Date\([^)]*\)\.toLocale(Date|Time)?String\(/`. Assert the offending file paths in the failure message. Run it now. Expected: FAIL listing the call sites (the TDD red state for the migration).
- [ ] **Step 6: Migrate every call site** listed above. Server Components and Client Components both import from `@/lib/format/datetime`. Use `formatTime` for `match-history-list.tsx:19` and for the end time at `sessions/[id]/page.tsx:58`. Marketing `sessions/[id]/page.tsx` passes its route `locale` (read how that page already obtains it). Replace `membership-card.tsx`'s local formatter and `memberships-table.tsx`'s `value ? … : "-"` with `formatDate`, keeping the `"-"` empty-cell look only if a test or snapshot depends on it (grep first; otherwise `"—"` is fine). Re-grep with the guard regex for sites the audit missed (`roster-table.tsx:186,347` was one).
- [ ] **Step 7: Run** `npx vitest run tests/unit/no-unpinned-dates.test.ts`, then `npx tsc --noEmit` and `npx vitest run`. Expected: all PASS.
- [ ] **Step 8: Commit** `git add lib/format/datetime.ts tests/unit app components && git commit -m "fix: render dates in Asia/Jakarta with one shared formatter"`

---

### Task 2: Contrast tokens and call-site swap

**Files:**
- Create: `tests/unit/helpers/contrast.ts`, `tests/unit/contrast.test.ts`
- Modify: `app/globals.css`, `components/ui/{badge,form,button,select,dropdown-menu}.tsx`
- Modify (swap small text colour): `text-accent` to `text-accent-text` at `app/(app)/history/page.tsx:24,45,74`, `app/(app)/dashboard/page.tsx:31`, `app/(app)/sessions/[id]/manage/page.tsx:98`, `app/[locale]/(marketing)/page.tsx:30,62`, `app/[locale]/(marketing)/gallery/[id]/page.tsx:67`, `app/[locale]/(marketing)/sessions/[id]/page.tsx:64`. `text-destructive` to `text-destructive-text` at `components/auth/{login,signup}-form.tsx`, `components/profile/profile-form.tsx:117`, `components/sessions/{session-form.tsx:438,replace-seat-dialog.tsx:187}`, `components/gallery/{upload-panel.tsx:314,hold-to-confirm-button.tsx:125}`, `components/ui/form.tsx:105,156`. Keep `border-destructive`, `bg-destructive`, `ring-*` as they are.

**Interfaces:**
- Produces (test helper): `parseTokens(css: string, block: ":root" | ".dark"): Record<string, { l: number; c: number; h: number; alpha: number }>`, `contrastRatio(a: Rgb, b: Rgb): number`, `toRgb(token): Rgb`, `blend(fg: Rgb, bg: Rgb, alpha: number): Rgb`.
- Produces (CSS): `--accent-text`, `--success-text`, `--destructive-text` in `:root`, exposed as `--color-accent-text`, `--color-success-text`, `--color-destructive-text` in `@theme inline`.

- [ ] **Step 1: Write the failing test** `tests/unit/contrast.test.ts`. Read `app/globals.css`, parse `:root`, and assert ratios: `foreground`/`background` and `muted-foreground`/`background` at least 4.5; `accent-text`, `success-text`, `destructive-text` each on `background` at least 4.5; `success-text` on `blend(success, background, 0.15)` (the badge tint) at least 4.5; `foreground` on `accent` (hover fill) at least 4.5; `accent-foreground` on `accent` at least 4.5; `input` on `background` at least 3.
- [ ] **Step 2: Implement** `tests/unit/helpers/contrast.ts` (oklch to OKLab to linear sRGB to WCAG luminance). Run the test. Expected: FAIL on the missing tokens and on `input`.
- [ ] **Step 3: Edit `app/globals.css`**: add the three `-text` tokens (start from about `oklch(50% .17 32)`, `oklch(45% .14 150)`, `oklch(52% .20 25)`), darken `--input` (start `oklch(65% .01 35)`), set `--accent-foreground` to the same value as `--foreground` (ink on coral; run `grep -rn "accent-foreground" app components` first and confirm no solid-coral call site relies on paper text), and register the three `--color-*` aliases in `@theme inline`. Adjust values until the test passes.
- [ ] **Step 4: Swap call sites** per the list above, `badge.tsx:21` success variant text to `text-success-text`, and the hover/focus fills in `button.tsx`, `select.tsx`, `dropdown-menu.tsx` to use ink text on the accent fill (verify with `grep -n "accent-foreground" components/ui`).
- [ ] **Step 5: Run** `npx vitest run tests/unit/contrast.test.ts`, `npx tsc --noEmit`, `npx vitest run`. Expected: PASS.
- [ ] **Step 6: Commit** `git add -A app components tests && git commit -m "fix: meet AA contrast for text and input borders"`

---

### Task 3: Touch targets and dialog scroll

**Files:**
- Create: `tests/unit/ui-primitives.test.tsx`
- Modify: `vitest.config.mts` (include `tests/unit/**/*.test.{ts,tsx}`), `components/ui/{button,input,select,dialog,dropdown-menu,checkbox}.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: tsx tests are now picked up by Vitest. `renderToStaticMarkup` from `react-dom/server` is the test renderer (node environment, no new dependencies).

- [ ] **Step 1: Write the failing test** in `tests/unit/ui-primitives.test.tsx` using `renderToStaticMarkup`: `<Button>` markup contains `h-11` and `md:h-9`; `size="sm"` contains `h-11` and `md:h-9`; `size="icon"` contains `size-11` and `md:size-9`; `<Input />` contains `h-11` and `md:h-9`.
- [ ] **Step 2: Update** `vitest.config.mts` `include`, run the test. Expected: FAIL on the class assertions.
- [ ] **Step 3: Edit the primitives.** `button.tsx` sizes: `default` `h-11 md:h-9`, `sm` `h-11 md:h-9`, `lg` `h-12 md:h-10`, `icon` `size-11 md:size-9`. `input.tsx` and the `select.tsx` trigger (both `data-[size]` heights) `h-11 md:h-9`. `dialog.tsx`: close button gets a 44px hit area (for example `p-3 -m-3` or a `size-11` wrapper with the 16px glyph kept) and `DialogContent` gets `max-h-[calc(100dvh-2rem)] overflow-y-auto`. `dropdown-menu.tsx` and `select.tsx` items get `py-2.5 md:py-1.5`. `checkbox.tsx`: keep the `size-4` glyph and add padding or a pseudo-element hit area of 44px below `md`.
- [ ] **Step 4: Run** the new test, `npx tsc --noEmit`, `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Manual check** with `npm run dev` at a 375px window: open `/login`, `/dashboard`, a manage page, and the Edit session dialog. Confirm controls are 44px, the dialog scrolls and its footer is reachable, and no toolbar breaks layout. Fix any wrap in this task (spec risk 1).
- [ ] **Step 6: Commit** `git add -A && git commit -m "fix: 44px touch targets on mobile and scrollable dialogs"`

---

### Task 4: Reduced motion and checkbox import drift

**Files:**
- Modify: `app/globals.css`, `components/ui/button.tsx`, `components/sessions/session-card.tsx:11`, `components/ui/checkbox.tsx`
- Test: `tests/unit/ui-primitives.test.tsx` (extend)

- [ ] **Step 1: Add the failing assertions** to `ui-primitives.test.tsx`: `Button` markup does not contain `hover:-translate-y-px`; `app/globals.css` text contains `prefers-reduced-motion: reduce`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `hover:-translate-y-px active:translate-y-0 … disabled:translate-y-0` translate classes and `hover:translate-y-0` from the button variants; remove `hover:-translate-y-0.5` from `session-card.tsx`. Add to `globals.css` an `@media (prefers-reduced-motion: reduce)` block setting `animation-duration`, `animation-iteration-count`, `transition-duration` to near zero (`0.01ms`, `1`) and `scroll-behavior: auto` on `*, *::before, *::after`. Re-point `checkbox.tsx` to `import { cn } from "@/lib/utils"` and `import * as CheckboxPrimitive from "@radix-ui/react-checkbox"` (add `@radix-ui/react-checkbox` via `npm install` if it is not already present). Do not remove the `cn` or `radix-ui` packages: `calendar`, `popover`, `select` and `tooltip` still import them (spec M-12 allowed removal only if unused).
- [ ] **Step 4: Run** `npx tsc --noEmit` and `npx vitest run`. Expected: PASS. Spot-check a checkbox on the roster in `npm run dev`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "fix: honour reduced motion and align checkbox imports"`

---

### Task 5: App route states

**Files:**
- Create: `components/ui/skeleton.tsx` (via `npx shadcn@latest add skeleton`), `app/(app)/loading.tsx`, `app/(app)/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `tests/unit/error-boundary.test.tsx`
- Read first: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{error,loading,not-found}.md`

**Interfaces:**
- `app/(app)/error.tsx` default export `AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void })`. Installed Next 16.3.4 declares the prop as `retry` (see `node_modules/next/dist/client/components/error-boundary.d.ts`); confirm with `tsc`.
- Produces for Task 6: the same props shape for the marketing error component.

- [ ] **Step 1: Write the failing test** `tests/unit/error-boundary.test.tsx`: render `AppError` with `renderToStaticMarkup`, assert it contains "Something went wrong" and a "Try again" button, and does not throw when `navigator` is undefined (Review Focus 3). Call the component function directly with a stub `retry` and assert the button element's `onClick` invokes it.
- [ ] **Step 2: Run** it. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** `error.tsx` is a Client Component: heading, short explanation, a "Try again" `Button` calling `retry()`. The offline hint ("Check your connection") comes from `useState` plus a `useEffect` reading `navigator.onLine` and the `online`/`offline` events, never from render. Log `error.digest` in an effect. `loading.tsx` renders a header-bar skeleton and three card-block skeletons. `global-error.tsx` ('use client') defines its own `<html lang="en"><body>` with minimal inline styles and a Try again button. `not-found.tsx` shows a branded 404 and a link to `/`.
- [ ] **Step 4: Run** the test, `npx tsc --noEmit`, `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Manual check** in `npm run dev` at 375px: visit `/does-not-exist`, then temporarily throw in a `(app)` page to see `error.tsx` render inside the shell, and revert the throw.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: add loading, error and not-found states for the app"`

---

### Task 6: Localized marketing route states

**Files:**
- Create: `app/[locale]/(marketing)/error.tsx`, `app/[locale]/(marketing)/not-found.tsx`, `tests/unit/marketing-error-messages.test.ts`
- Modify: `messages/en.json`, `messages/id.json`

**Interfaces:**
- Consumes: Task 5's `error.tsx` props shape.
- Produces: message keys `errors.notFound.{title,body,home}` and `errors.generic.{title,body,offline,retry}` in both files.

- [ ] **Step 1: Write the failing test**: both message files contain every key above with non-empty strings, and the sets of keys in `en.json` and `id.json` are identical (extend the existing parity pattern in `tests/unit/home-stats-messages.test.ts` if it already has a helper).
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the keys with Indonesian translations in `id.json`. `error.tsx` is a Client Component using `useTranslations("errors.generic")`; the `app/[locale]` layout provides the client provider, so it works under the boundary. Same `retry` prop and effect-based offline hint as Task 5. `not-found.tsx` uses `getTranslations("errors.notFound")` and the locale-aware `Link`.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS. Manual: `/en/does-not-exist` and `/id/does-not-exist` render in their own language at 375px.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: add localized marketing 404 and error pages"`

---

### Task 7: Landmarks, skip link, active nav, page titles

**Files:**
- Create: `components/skip-link.tsx`, `components/nav/nav-links.tsx`, `lib/nav/active-href.ts`, `tests/unit/active-href.test.ts`, `tests/unit/nav-semantics.test.tsx`
- Modify: `app/(app)/layout.tsx`, `app/[locale]/(marketing)/layout.tsx`, `app/(auth)/layout.tsx`, `components/ui/card.tsx` (CardTitle only if `asChild` is the chosen route), `app/(auth)/{login,signup}/page.tsx`, `components/auth/{login,signup}-form.tsx`, `app/auth/error/page.tsx`, and a `metadata.title` export on `app/(app)/{dashboard,history,leaderboard,profile,admin,sessions/new,sessions/[id]/manage,sessions/[id]/matches}/page.tsx`.

**Interfaces:**
- Produces: `activeHref(pathname: string, hrefs: string[]): string | null` returns the longest `href` where `pathname === href` or `pathname.startsWith(href + "/")`.
- Produces: `<NavLinks items={{ href: string; label: string }[]} localized?: boolean className?: string linkClassName?: string />` (client), sets `aria-current="page"` on the active link. With `localized`, it uses the `Link` and `usePathname` from `@/i18n/navigation`; otherwise `next/link` and `next/navigation`.
- Produces: `<SkipLink />` renders `<a href="#main">Skip to content</a>`, `sr-only focus:not-sr-only` and a visible focus style.

- [ ] **Step 1: Write failing tests.** `active-href.test.ts` (Review Focus 5): `activeHref("/sessions/new", ["/sessions", "/sessions/new", "/history"])` returns `"/sessions/new"`; `activeHref("/sessions/abc/manage", [...])` returns `"/sessions"`; `activeHref("/", ["/sessions"])` returns `null`. `nav-semantics.test.tsx`: `SkipLink` markup has `href="#main"` and is the first element of the `(app)` layout's header region (assert on the component output); `NavLinks` markup carries `aria-current="page"` on exactly one link for a given mocked pathname (mock the two `usePathname` modules with `vi.mock`).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** `lib/nav/active-href.ts` and `NavLinks` per the interfaces; the active style is `text-accent-text` plus `font-medium`. Add `<SkipLink />` as the first child of the `(app)` and marketing layouts (Review Focus 4). Wrap page content in `<main id="main">` in all three layouts (the `(app)` and marketing layouts already have a `<main>`; add the id and keep their classes; add `<main>` to `(auth)`). Give both `<nav>` elements `aria-label="Main"` and replace their hand-written link lists with `NavLinks`, keeping the existing class strings, the `canHost`/`admin` conditions and the marketing locale-aware links. Render a real `<h1>` for the card title on login, signup and the auth error page. Add the `metadata.title` exports (for example `"Dashboard"`, `"History"`, `"New session"`, `"Manage session"`, `"Log in"`, `"Sign up"`, `"Sign-in problem"`); no `title.template` in this plan.
- [ ] **Step 4: Run** the tests, `npx tsc --noEmit`, `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Manual check** in `npm run dev`: press Tab once on `/dashboard` and `/en`, and confirm the skip link appears first and jumps to the content; confirm the tab titles differ per page.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: add skip link, main landmarks, active nav and page titles"`

---

### Task 8: Form error semantics

**Files:**
- Create: `tests/unit/form-errors.test.tsx`
- Modify: `components/ui/form.tsx`, `components/auth/{login,signup}-form.tsx`, `components/profile/profile-form.tsx`, `components/sessions/{session-form,announcement-form,add-guest-dialog,match-panel,auto-match-panel}.tsx`

**Interfaces:**
- Consumes: Task 2's `text-destructive-text` (root error `<p>` elements already use it).

- [ ] **Step 1: Write the failing test** in `tests/unit/form-errors.test.tsx`: render `FormMessage` inside a minimal react-hook-form `Form`/`FormField` stub with a field error and assert the markup contains `role="alert"`. Add one assertion that `components/auth/login-form.tsx` source contains `role="alert"` on the root error element (a source-text check, since these forms need a DOM to render).
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.** `FormMessage` gets `role="alert"`. Add `role="alert"` to the root-error `<p>` in `login-form.tsx`, `signup-form.tsx`, `profile-form.tsx`, `session-form.tsx` and the equivalent error elements in `announcement-form.tsx` and `add-guest-dialog.tsx`. After a failed submit, move focus to the first invalid field via react-hook-form `shouldFocusError` (default on; confirm it is not disabled) and, when only a root error exists, focus the error element (`tabIndex={-1}` plus a ref). In `session-form.tsx` give the native `<textarea>` (line 160) and `<select>` (lines 179, 410, 426) the focus ring classes the `Input` primitive uses, or swap in the `Textarea`/`Select` primitives where that does not change submitted values; do the same for the native controls in `match-panel.tsx` and `auto-match-panel.tsx`. Associate each `Select` trigger with its label via `htmlFor`/`id` or `aria-label`.
- [ ] **Step 4: Run** the test, `npx tsc --noEmit`, `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Manual check** in `npm run dev`: submit `/login` with a wrong password and confirm the error is announced (role alert) and keyboard Tab shows a visible ring on the session form's native controls.
- [ ] **Step 6: Commit** `git add -A && git commit -m "fix: announce form errors and show focus rings on native controls"`

---

### Task 9: Hygiene and final verification

**Files:**
- Modify: `app/sitemap.ts`

- [ ] **Step 1: Delete** the `TEMP` `console.log` block (lines 15-20) from `app/sitemap.ts`. Keep the early `if (!siteUrl) return []`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/sitemap.test.ts`, then the full gates: `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run build`. Expected: all pass. If `npm run build` needs env that is not set locally, report that and run it with the values from `.env.local`.
- [ ] **Step 3: Final browser pass** at 375px on `/login`, `/dashboard`, a manage page, Edit session dialog, `/en`, `/en/does-not-exist`. Confirm against the spec's testing summary; record any deviation instead of hiding it.
- [ ] **Step 4: Commit** `git add app/sitemap.ts && git commit -m "chore: remove temporary sitemap debug log"`
