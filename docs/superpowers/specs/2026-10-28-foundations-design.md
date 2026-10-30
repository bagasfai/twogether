# Foundations: design

Date: 2026-10-28. Branch: `dev`. Status: draft, awaiting review.

Source: `docs/design-audit/2026-10-28-design-audit.md`. This is sub-project 1 of the audit follow-up. The other sub-projects (host live-session reliability, auth, marketing SSG and SEO, admin and nav, app i18n) each get their own spec.

## Purpose

Fix the shared, low-level problems that every later screen inherits: unreadable text colours, undersized touch targets, dates shown in the wrong zone, no error, loading or not-found states, and missing page landmarks. These changes are small individually, but they sit in tokens, primitives and layouts, so they propagate everywhere. The host live-session work depends on them: it needs `error.tsx` to catch a failed action and it inherits the 44px control sizes.

Audit findings covered: X-01, X-02, X-03, X-04, X-06, X-07, X-09, H-03, M-06, M-12, S-10.

## Decisions already made

- Dates in `(app)` use the `en-GB` locale, 24-hour time, pinned to `Asia/Jakarta`. Marketing keeps its route locale.
- Touch targets use a responsive default: 44px below `md`, compact from `md` up.
- Dark mode (X-05) stays deferred. No dark-theme work in this spec.
- App and auth i18n (X-08) stays out of scope. New English strings in `(app)` and `(auth)` are hardcoded, like the rest of that half. Only the new marketing 404 and error pages are localized.

## Out of scope

- `title.template`, Open Graph and hreflang (SEO sub-project).
- Translating raw status enums such as `scheduled · registration open`.
- Removing the existing per-call `h-11` patches in admin and gallery.
- Consolidating `formatAlbumDate`, `formatPhotoTime` and `lib/format/whatsapp-share.ts` into the new date helper. They already pin the zone.
- Any change to the destructive button variant's look (M-14) or the `tokens.css` cleanup (M-13).

## 1. Tokens and primitives

### Contrast tokens

In `app/globals.css`, add to `:root`:

- `--accent-text`: about `oklch(50% .17 32)`. Darker coral for text on paper.
- `--success-text`: about 45% lightness.
- `--destructive-text`: about 52% lightness.

Expose each through `@theme inline` as a Tailwind colour (`text-accent-text`, `text-success-text`, `text-destructive-text`). Darken `--input` to about `oklch(65% .01 35)` so input boundaries reach 3:1 against the paper background.

The exact values are tuned until the test below passes. The numbers above are the audit's starting estimates, not final.

Coral (`--accent`, `--ring`) stays for fills and focus rings. Fills that carry text switch the text to ink: the `outline` and `ghost` hover states in `components/ui/button.tsx`, and the focus and hover fills in `select.tsx`, `dropdown-menu.tsx` and `form.tsx`. The success badge text moves to `--success-text`.

Small `text-accent`, `text-success` and `text-destructive` usages move to the `-text` tokens. The call sites are listed in audit row X-02 (`app/(app)/dashboard/page.tsx:31`, `history/page.tsx:24,45,74`, `sessions/[id]/manage/page.tsx:98`, marketing `page.tsx:30,62`, and the primitives named there). The plan re-greps for `text-accent`, `text-success` and `text-destructive` instead of trusting the line numbers.

The `.dark` block is not touched.

### Contrast test

A Vitest test converts the oklch tokens to sRGB (OKLab to linear sRGB to WCAG relative luminance) and asserts, for the light theme:

- every text and background pair used by the app is at least 4.5:1: foreground, muted foreground, `-text` tokens on paper, and ink on accent fills;
- `--input` against `--background` is at least 3:1.

The test reads the tokens from `globals.css`, so a later edit to a token that breaks a pair fails the build.

### Touch targets

- `Button`: `default` and `sm` become `h-11 md:h-9`. `lg` becomes `h-12 md:h-10`. `icon` becomes `size-11 md:size-9`.
- `Input` and the `Select` trigger become `h-11 md:h-9`.
- Dialog close button: padded to a 44px hit area while the glyph stays 16px.
- Dropdown and select items get taller vertical padding below `md`.
- `Checkbox`: the 16px glyph is kept, with padding that gives a 44px hit area.

Existing explicit `h-11` and `h-8` overrides keep winning through `cn`, so no call site changes behaviour except where it used the default. The roster table's desktop `h-8` buttons are explicit overrides and remain as they are, since they only render from 768px.

### Dialog scroll (H-03)

`DialogContent` gets `max-h-[calc(100dvh-2rem)] overflow-y-auto`. The Edit session dialog, which wraps the roughly 16-field `SessionForm`, becomes reachable on phones. Admin dialogs that already set `max-h-[90vh] overflow-y-auto` keep working because their class overrides the default.

### Reduced motion (X-06)

- A global `@media (prefers-reduced-motion: reduce)` block in `globals.css` that sets `animation-duration`, `transition-duration` and `scroll-behavior` to near zero and removes transforms.
- Remove `hover:-translate-y-px` from the button base class. It also causes sticky-hover jiggle on touch.
- Remove the same hover lift from `components/sessions/session-card.tsx`.

### Checkbox drift (M-12)

`components/ui/checkbox.tsx` imports `cn` from the `cn` npm package and `Checkbox` from the `radix-ui` monolith. Re-point it to `@/lib/utils` and `@radix-ui/react-checkbox`. If nothing else imports the `cn` or `radix-ui` packages afterwards, remove them from `package.json`. The plan verifies this with a grep before removing anything.

## 2. Date formatter (X-01)

New file `lib/format/datetime.ts`:

- `formatDateTime(value, locale = "en-GB")` returns for example `Fri, 30 Oct 2026, 18:00`.
- `formatDate(value, locale = "en-GB")` returns for example `30 Oct 2026`.
- `value` is an ISO string or a `Date`.
- Both use `Intl.DateTimeFormat` with `timeZone: "Asia/Jakarta"` and `hourCycle: "h23"`.
- An invalid or missing value returns `"—"`, never `"Invalid Date"`.
- `Intl.DateTimeFormat` instances are cached at module level, keyed by locale and variant.

Because locale and zone are explicit, Server Components and Client Components produce the same string. That removes the hydration-mismatch risk in `session-card`, `membership-card` and `hosted-sessions-preview`.

Replace every `toLocaleString()` and `toLocaleDateString()` in `app/` and `components/`. The audit lists about 14 sites:

- `app/(app)/dashboard/page.tsx` (3), `history/page.tsx` (2), `sessions/[id]/manage/page.tsx` (1);
- `components/sessions/announcement-list.tsx`, `match-history-list.tsx`, `membership-card.tsx`, `session-card.tsx`, `hosted-sessions-preview.tsx`;
- `components/admin/member-role-table.tsx`, `memberships-table.tsx`;
- `app/[locale]/(marketing)/sessions/[id]/page.tsx` (2), which pass the route `locale`.

The plan re-greps to catch any site the audit missed.

Left alone: `formatAlbumDate`, `formatPhotoTime`, and `lib/format/whatsapp-share.ts`.

### Tests

- A fixed UTC instant that falls on a different calendar day in Jakarta, proving the zone shift.
- `en-GB` and `id-ID` outputs asserted on `formatToParts` values, not whole strings, because ICU versions differ on the comma after the weekday.
- Invalid and missing input return `"—"`.
- A guard test that fails if `toLocaleString(` or `toLocaleDateString(` appears under `app/` or `components/`.

## 3. Route states and layout semantics

### Route states (X-04)

- `app/(app)/loading.tsx`: a skeleton built from the shadcn `Skeleton` primitive (add it via the shadcn CLI if it is not installed): a header bar and a few card blocks.
- `app/(app)/error.tsx`: a Client Component rendered inside the app shell. It shows "Something went wrong", adds "Check your connection" when `navigator.onLine` is false, and has a Retry button. It logs `error.digest`. The nav stays, so a failed action no longer replaces the whole console (audit L-01).
- `app/global-error.tsx`: last resort for root-layout failures. It defines its own `<html>` and `<body>` with minimal inline styling, because it replaces the root layout and skips global styles.
- `app/not-found.tsx`: branded English 404 with a link home. It covers `notFound()` outside marketing and unmatched URLs.
- `app/[locale]/(marketing)/not-found.tsx` and `error.tsx`: localized with `next-intl`. New keys are added to both `messages/en.json` and `messages/id.json` so key parity stays at 100%.

**Retry prop name.** The installed Next docs show `retry()` in the `error.tsx` props, but their own changelog says `unstable_retry` was added in 16.2.0. The plan must read the installed `next` type definitions and use whichever name they declare. It must not rely on either source of text alone.

### Layout semantics (X-07, M-06)

- `components/skip-link.tsx`: a link that is visually hidden until focused and points to `#main`. Used in the `(app)` and marketing layouts.
- `<main id="main">` in the `(app)`, marketing and `(auth)` layouts. Pages keep their own content inside it.
- Both `<nav>` elements get `aria-label="Main"`.
- A small client component `NavLink` reads `usePathname` and sets `aria-current="page"` plus an active style (coral text using `--accent-text`). Both navs use it. The marketing nav keeps the locale-aware `Link` from `@/i18n/navigation`.
- Auth pages (`/login`, `/signup`, the auth error page) get a real `<h1>` for the card title. `CardTitle` renders a `<div>` today, so the page passes `asChild` or renders its own heading.
- Each `(auth)` and `(app)` page exports its own `metadata.title`, so tabs stop all reading "Jakbar Twogether".

### Form errors (X-09)

- Root and server errors in the login, signup, profile, session, announcement and add-guest forms get `role="alert"`, and so does `FormMessage`.
- After a failed submit, focus moves to the first invalid field, or to the root error when no field is invalid.
- The native `<select>` and `<textarea>` in `session-form.tsx` and the match panels get a visible focus ring. Where the shadcn `Select` or `Textarea` fits without changing form behaviour, use the primitive. Otherwise add the focus-ring classes to the native element.
- Select triggers get an associated label through `htmlFor` or `aria-label`.

## 4. Hygiene

Delete the `TEMP` `console.log` in `app/sitemap.ts` (S-10). It prints the Supabase URL and anon-key length on every sitemap build.

## Testing summary

- Vitest: contrast math, date formatter, the no-`toLocale…` guard.
- Component tests: `error.tsx` renders and Retry calls the prop, `NavLink` sets `aria-current`, form errors carry `role="alert"`.
- Manual, once, in the browser at 375px: the 404 page, the error page, Edit session dialog scroll, and a 44px spot check of the nav, login form and manage console.
- Standard gates: `tsc` clean and the full Vitest suite passing.

## Risks

- **Taller controls change layouts.** Raising the default control height below `md` can wrap toolbars and tight rows. The manual 375px pass covers the manage console, login, signup and profile. Fixes for any wrap go in the same change.
- **Contrast tuning.** The `-text` token values are estimates. The contrast test is the source of truth, and values are adjusted until it passes. A value that passes but looks off is a review item, not a reason to weaken the test.
- **Retry prop name.** Covered above.
- **Removing `cn` and `radix-ui` packages.** Only if a grep shows no remaining imports.

## Future-tier note

Nothing here touches schema, RLS or the Future tier in CLAUDE.md §6.
