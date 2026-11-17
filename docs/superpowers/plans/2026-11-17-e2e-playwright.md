# Playwright E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run test:e2e` drives signup, login, password reset, member registration and waitlist, host roster control and auto-match through the real UI against the local Supabase stack.

**Architecture:** Playwright (Chromium, one worker) starts or reuses `next dev` on `http://127.0.0.1:3000`. A support layer holds a service-role Supabase client that creates users and sessions and removes them again; specs log in through the real login form once per user and reuse the storage state. Nothing in Supabase is mocked.

**Tech Stack:** `@playwright/test`, `@supabase/supabase-js` (already installed), `@next/env` (ships with Next) to load `.env.local`.

**Spec:** `docs/superpowers/specs/2026-11-17-e2e-playwright-design.md`

## Global Constraints

- Local stack only. API `54331`, DB `54332`. The suite must refuse to run when `NEXT_PUBLIC_SUPABASE_URL` is not `127.0.0.1` or `localhost`.
- Base URL is `http://127.0.0.1:3000`, not `localhost` (it must match `site_url` in `supabase/config.toml` and `NEXT_PUBLIC_SITE_URL`, or auth cookies and confirm links break).
- Every test user's email is `delivered+e2e-<runId>-<label>@resend.dev`. Every session title starts with `E2E `. Cleanup keys on those two patterns and nothing else.
- Do not log in as, modify or delete seed users (`*@jakbar.local`) or any row the run did not create.
- `(app)`, `(auth)` and `/auth/*` routes are unprefixed and their copy is hardcoded English. Marketing routes are localized with default locale `id`; tests open them under `/en/` and take their labels from `messages/en.json`, never from a string typed into the spec.
- No `data-testid` exists today. Prefer `getByRole` / `getByLabel`; add a `data-testid` only where a control has no stable accessible name, and list each one added in the task's commit message.
- No explanatory comments in spec files beyond what a reader needs to understand a non-obvious wait.
- Read `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` before writing config.
- Vitest (`tests/unit/**`) and `npm run lint` must stay green after every task.

## Review Focus

1. **Pointed at the hosted project.** `.env.local` has held hosted values before. A run there would create and delete real users. Expected: the run aborts before any write. Pinned in Task 1.
2. **A previous run crashed.** Leftover `E2E ` sessions and `e2e-` users from a killed run must not break or pollute the next one. Expected: the next run sweeps them first. Pinned in Task 1.
3. **The `send-email` hook is down** (`supabase_edge_runtime_twogether` exited). Signup then returns an error while older UI showed "check your email". Expected: the signup spec fails on a clear assertion about the hook, not on a timeout ten steps later. Pinned in Task 2.
4. **The run's own cleanup is blocked by a restricting FK** (`guest_participants.registered_by`, `skill_levels.set_by`, `announcements.created_by`). Expected: sessions are deleted before users, and a failed user delete fails the run loudly instead of leaking accounts. Pinned in Task 1.
5. **Realtime refresh is slower than the default 5 s expect timeout.** The waitlist promotion and roster updates arrive through a debounced `router.refresh()`. Expected: those assertions use an explicit longer timeout, with a reload as the documented fallback only where the page has no realtime watcher. Pinned in Tasks 3 and 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `playwright.config.ts` | Test dir, base URL, one worker, Chromium, `webServer`, global setup/teardown |
| `tests/e2e/support/env.ts` | Load `.env.local`, export URLs and keys, the local-only guard |
| `tests/e2e/support/admin.ts` | Service-role client: users, sessions, participants, email links, sweep |
| `tests/e2e/support/fixtures.ts` | Playwright `test` with `users`, `asUser`, `makeSession` |
| `tests/e2e/support/messages.ts` | Typed access to `messages/en.json` |
| `tests/e2e/global-setup.ts`, `global-teardown.ts` | Guard, then sweep leftovers |
| `tests/e2e/auth.spec.ts` | Login, logout, protected redirect, signup + confirm |
| `tests/e2e/password-reset.spec.ts` | Request, recovery link, new password |
| `tests/e2e/registration.spec.ts` | Register, cancel, waitlist, promotion |
| `tests/e2e/host-roster.spec.ts` | Create session, add, override, cancel player, check in |
| `tests/e2e/auto-match.spec.ts` | Generate and confirm suggestions |

---

### Task 1: Harness, fixtures, and the login specs

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/support/env.ts`, `tests/e2e/support/admin.ts`, `tests/e2e/support/fixtures.ts`, `tests/e2e/support/messages.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/global-teardown.ts`, `tests/e2e/auth.spec.ts`
- Modify: `package.json` (script, dev dependency), `.gitignore`, `eslint.config.mjs`, `README.md`

**Interfaces (produced, used by every later task):**

```ts
// support/env.ts
export const env: { supabaseUrl: string; anonKey: string; serviceRoleKey: string; baseUrl: "http://127.0.0.1:3000" };
export function assertLocalStack(): void; // throws unless supabaseUrl host is 127.0.0.1 or localhost

// support/admin.ts
export type Role = "member" | "host" | "admin";
export type Gender = Database["public"]["Enums"]["gender"];
export type TestUser = { id: string; email: string; password: string; fullName: string; role: Role };
export function testEmail(label: string): string; // delivered+e2e-<runId>-<label>@resend.dev
export function createUser(o: { label: string; role?: Role; gender?: Gender }): Promise<TestUser>;
export function deleteUser(id: string): Promise<void>; // throws on failure
export function findUserIdByEmail(email: string): Promise<string | null>;
export type TestSession = { id: string; title: string };
export function createSession(owner: TestUser, o?: {
  maxParticipants?: number; waitlistCapacity?: number; courtCount?: number;
  status?: "draft" | "scheduled"; registrationState?: "open" | "closed";
}): Promise<TestSession>; // defaults: 8, 4, 2, "scheduled", "open"; starts tomorrow, 2 h long
export function deleteSession(id: string): Promise<void>;
export function addCheckedInParticipant(sessionId: string, user: TestUser): Promise<void>;
export function confirmationLink(email: string, password: string): Promise<string>; // path on baseUrl
export function recoveryLink(email: string): Promise<string>;
export function sweepE2eData(): Promise<void>; // sessions titled "E2E %" first, then e2e users

// support/fixtures.ts
export const test: /* base.extend */ {
  users: { host: TestUser; memberA: TestUser; memberB: TestUser }; // worker scope
  asUser: (user: TestUser) => Promise<Page>;   // new context, logged in; closed after the test
  makeSession: (owner: TestUser, o?: Parameters<typeof createSession>[1]) => Promise<TestSession>; // deleted after the test
};
export { expect } from "@playwright/test";

// support/messages.ts
export const en: typeof import("../../../messages/en.json");
```

- [ ] **Step 1: Install.** `npm i -D @playwright/test`, then `npx playwright install chromium`. Add script `"test:e2e": "playwright test"`.

- [ ] **Step 2: Config.** `playwright.config.ts`: `testDir: "tests/e2e"`, `workers: 1`, `fullyParallel: false`, `retries: 0`, `use.baseURL` = `http://127.0.0.1:3000`, `use.trace: "retain-on-failure"`, one `chromium` project, `globalSetup` / `globalTeardown`, and
  `webServer: { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120_000, env: { RESEND_API_KEY: "" } }`.
  Add `/test-results/`, `/playwright-report/`, `/tests/e2e/.auth/` to `.gitignore`, and `test-results/**`, `playwright-report/**` to the ESLint global ignores.

- [ ] **Step 3: `env.ts`.** Load with `loadEnvConfig(process.cwd())` from `@next/env`. Read `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; throw naming the missing variable if one is absent.

- [ ] **Step 4: `admin.ts`.** Decisions the signatures leave open:
  - `runId` is one random 6-character string per process.
  - `createUser`: `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, phone } })`; password is a fixed 12-character constant; `fullName` is `E2E <label> <runId>`. For `host` / `admin`, update `profiles.role` with the service-role client (`guard_profile_role_change` allows `service_role`). For `gender`, upsert `profiles_private (user_id, gender)`.
  - `createSession`: insert into `sessions` with `created_by = owner.id` (trigger `sessions_add_owner` adds the `session_hosts` row), then insert `courts` rows `1..courtCount` — the app's `createSession` in `lib/actions/sessions.ts:14-99` does this by hand and no trigger does. Read that action and `types/supabase.ts` for the full required column set (drilling and price columns were added later); `kind` is `open_play`. Title is `E2E <runId> <counter>`.
  - `addCheckedInParticipant`: sign in as the user with an anon client and call the `register_for_session` RPC (so consent and triggers run as in production), then set `checked_in_at = now()` on that row with the service-role client.
  - `confirmationLink`: `auth.admin.generateLink({ type: "signup", email, password })`, return `/auth/confirm?token_hash=<properties.hashed_token>&type=email&next=/dashboard`. `recoveryLink`: `type: "recovery"`, return `/auth/confirm?token_hash=<…>&type=recovery`. (`lib/auth/otp.ts:12` accepts only `email` and `recovery`.)
  - `sweepE2eData`: delete `sessions` where `title like 'E2E %'`, then every auth user whose email matches `delivered+e2e-%@resend.dev` (page through `auth.admin.listUsers`). Collect failures and throw one error listing them.

- [ ] **Step 5: Global setup and teardown.** Setup: `assertLocalStack()`, then a `GET` on `<supabaseUrl>/auth/v1/health` that throws `Local Supabase is not running on <url>; run "npx supabase start"` on failure, then `sweepE2eData()`. Teardown: `sweepE2eData()`.

- [ ] **Step 6: `fixtures.ts`.** `users` is worker-scoped and creates `host` (role `host`), `memberA`, `memberB`; it deletes them after the worker. `asUser` logs in through `/login` (fill `Email`, `Password`, click `Log in`, wait for `/dashboard`) the first time a user is seen in the worker, saves `storageState` to `tests/e2e/.auth/<user.id>.json`, and afterwards opens a new context from that file. `makeSession` tracks ids and deletes them after the test, before any user is removed.

- [ ] **Step 7: Write `auth.spec.ts` (login part).**

```ts
test("signed-out visitor is sent to login and back", async ({ page, users }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");
  await page.getByLabel("Email").fill(users.memberA.email);
  await page.getByLabel("Password").fill(users.memberA.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/dashboard");
});

test("wrong password shows the error and stays on login", async ({ page, users }) => {
  // fill memberA.email + "not-the-password", submit
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
  await expect(page).toHaveURL(/\/login/);
});

test("sign out returns home and re-protects the dashboard", async ({ asUser, users }) => {
  const page = await asUser(users.memberA);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");
});
```

  The sign-out test invalidates `memberA`'s saved state; make `asUser` drop its cached file for a user when the test asks (`asUser(user, { fresh: true })`) and use that here, so later specs are unaffected.

- [ ] **Step 8: Pin Review Focus 1, 2 and 4.**
  - Guard: run `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co npm run test:e2e` (a process variable wins over `.env.local`) and confirm it exits non-zero before any test with the guard's message.
  - Sweep: with the service-role client insert a session titled `E2E leftover` and a user `delivered+e2e-leftover-x@resend.dev`, run the suite, and confirm both are gone.
  - Loud delete: add a unit test `tests/unit/e2e-sweep.test.ts` that feeds `sweepE2eData` a stub client whose user delete fails for one id and asserts the thrown message names that id. Export the sweep with an injectable client for this.

- [ ] **Step 9: Run.** `npm run test:e2e` → 3 passed. `npm run test:unit` and `npm run lint` → green.

- [ ] **Step 10: README.** Add an "End-to-end tests" section: prerequisites (`npx supabase start`, the `supabase_edge_runtime_twogether` container up, `.env.local` holding local values), the command, `npx playwright test --ui`, and the note that test mail goes to Resend's `delivered@resend.dev` sink.

- [ ] **Step 11: Commit.** `test(e2e): add playwright harness and login specs`

---

### Task 2: Signup confirmation and password reset

**Files:**
- Modify: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/password-reset.spec.ts`

**Interfaces:** consumes `testEmail`, `createUser`, `deleteUser`, `findUserIdByEmail`, `confirmationLink`, `recoveryLink`.

- [ ] **Step 1: Signup test** in `auth.spec.ts`. Fields are `Name`, `Email`, `Phone number`, `Password`; submit is `Sign up`. Use a phone that passes `lib/validation/phone.ts` with random trailing digits.

```ts
test("signup, confirm by link, land on the dashboard", async ({ page }) => {
  const email = testEmail("signup");
  // fill the form, submit
  const alert = page.getByRole("alert");
  const heading = page.getByRole("heading", { name: "Check your email" });
  await expect(heading.or(alert)).toBeVisible();
  expect(await alert.count(), "signup was rejected: is supabase_edge_runtime_twogether running?").toBe(0);
  await page.goto(await confirmationLink(email, password));
  await expect(page).toHaveURL("/dashboard");
  // sign out, log in again with the same email and password, expect /dashboard
});
```

  Delete the user in `test.afterEach` via `findUserIdByEmail`. If the signup form reports hook failure somewhere other than `role="alert"`, assert on that element instead and say so in the commit.

- [ ] **Step 2: Invalid-link test.**

```ts
test("a bad confirmation link lands on the auth error page", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-token&type=email");
  await expect(page).toHaveURL("/auth/error?reason=invalid_link");
});
```

- [ ] **Step 3: `password-reset.spec.ts`.** Uses its own user (`createUser({ label: "reset" })`), deleted after the test, because the password changes.

```ts
test("request a reset, set a new password, log in with it", async ({ page }) => {
  await page.goto("/forgot-password");
  // fill Email, click "Send reset link"
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await recoveryLink(user.email));
  await expect(page).toHaveURL("/reset-password");
  // fill "New password" and "Repeat new password" with a new 12-char value, click "Save new password"
  await expect(page).toHaveURL("/dashboard");
  // sign out; old password -> alert "Email or password is incorrect."; new password -> /dashboard
});

test("mismatched passwords are rejected in the form", async ({ page }) => {
  // arrive through recoveryLink, fill two different values, submit
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await expect(page).toHaveURL("/reset-password");
});
```

- [ ] **Step 4: Run.** `npx playwright test auth password-reset` → all pass. Then stop the hook (`docker stop supabase_edge_runtime_twogether`), run the signup test, and confirm it fails on the hook assertion message, not a timeout; restart the container (`docker start supabase_edge_runtime_twogether`) and confirm green again.

- [ ] **Step 5: Commit.** `test(e2e): cover signup confirmation and password reset`

---

### Task 3: Member registration and waitlist

**Files:**
- Create: `tests/e2e/registration.spec.ts`

**Interfaces:** consumes `users`, `asUser`, `makeSession`, `en.register.*`.

The member page is the public `/en/sessions/<id>` (`app/[locale]/(marketing)/sessions/[id]/page.tsx`, `components/sessions/register-panel.tsx`). Labels: `en.register.register`, `en.register.cancel`, `en.register.confirmed`, `en.register.waitlistPosition` (takes `position`), `en.register.loginToRegister`, `en.register.registrationClosed`. Format the waitlist label with the catalog template, not a typed string.

- [ ] **Step 1: Write the tests.**

```ts
test("member registers and cancels", async ({ asUser, users, makeSession }) => {
  const s = await makeSession(users.host);
  const page = await asUser(users.memberA);
  await page.goto(`/en/sessions/${s.id}`);
  await page.getByRole("button", { name: en.register.register, exact: true }).click();
  await expect(page.getByText(en.register.confirmed, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.register.cancel }).click();
  await expect(page.getByRole("button", { name: en.register.register, exact: true })).toBeVisible();
});

test("full session waitlists the next member and promotes them when a seat frees", async (...) => {
  const s = await makeSession(users.host, { maxParticipants: 1, waitlistCapacity: 2 });
  // memberA registers -> Confirmed
  // memberB (second context) registers -> "Waitlist #1"
  // memberA cancels
  // memberB page: expect Confirmed within 15 s; if the public page has no realtime watcher, reload once first
});

test("signed-out visitor is offered login, not register", async ({ page, users, makeSession }) => {
  // goto /en/sessions/<id>; expect link/button en.register.loginToRegister; no Register button
});

test("closed registration shows the closed message", async (...) => {
  const s = await makeSession(users.host, { registrationState: "closed" });
  // memberA: expect text en.register.registrationClosed; no Register button
});
```

- [ ] **Step 2: Decide the promotion wait.** Check whether `SessionRealtimeWatcher` is mounted on the public session page. If it is, assert with `{ timeout: 15_000 }` and no reload. If not, `await page.reload()` before the assertion and leave a one-line comment stating that the public page does not subscribe.

- [ ] **Step 3: Verify against the database.** At the end of the promotion test, read `participants` for the session with the service-role client and assert `memberA.status === "cancelled"` and `memberB.status === "confirmed"`, so the test proves the trigger ran and not only that a badge changed.

- [ ] **Step 4: Run.** `npx playwright test registration` → 4 passed, three times in a row (`--repeat-each 3`).

- [ ] **Step 5: Commit.** `test(e2e): cover member registration, waitlist and promotion`

---

### Task 4: Host session creation and roster control

**Files:**
- Create: `tests/e2e/host-roster.spec.ts`
- Possibly modify: `components/sessions/add-participant-dialog.tsx` or the date-time picker, only to add a `data-testid`

**Interfaces:** consumes `users`, `asUser`, `makeSession`, `deleteSession`.

Manage page: `/sessions/<id>/manage`. Below `lg` the panels sit behind tabs (`Courts`, `Matches`, `Roster`, `Photos`); set the viewport to 1280×800 for this file so every panel is visible and no tab click is needed. Roster controls (`components/sessions/roster-table.tsx`): `Check in` / `Undo check-in`, `Confirm`, menu `More actions for <name>`, `Cancel player` with a confirm dialog titled `Cancel <name>?`. Add dialog (`components/sessions/add-participant-dialog.tsx`): title `Add a participant`, search placeholder `Search by name…`, a `Register as` select; read lines 88-160 for the trigger and submit labels.

- [ ] **Step 1: Create-session test.** Go to `/sessions/new` as `users.host`. Fill `Title` (`E2E <random>` so the sweep catches it), `Location`, `Starts`, `Ends`, `Capacity`, set `Registration` to `open` and `Status` to `scheduled`, click `Create session`. Expect URL `/sessions/<uuid>/manage` and the title visible. Capture the id from the URL and delete the session in `afterEach`. `Starts` / `Ends` are a custom `DateTimePicker`: read the component first and drive it the way a user would; if it exposes no accessible handle, add `data-testid` to its input.

```ts
test("member cannot open the create form", async ({ asUser, users }) => {
  const page = await asUser(users.memberA);
  await page.goto("/sessions/new");
  // assert what the app actually does for a non-host here (redirect or 404); record which in the test name
});
```

- [ ] **Step 2: Roster test.**

```ts
test("host adds a member, promotes from waitlist, checks in, and cancels a player", async (...) => {
  const s = await makeSession(users.host, { maxParticipants: 1, waitlistCapacity: 2 });
  const host = await asUser(users.host);
  await host.goto(`/sessions/${s.id}/manage`);
  // open the add dialog, search memberA.fullName, pick the result, Register as confirmed, submit
  // roster row for memberA shows "Confirmed" and "Awaiting their confirmation"
  // add memberB the same way as waiting list -> row shows "Waitlist"
  // on memberB's row click "Confirm" -> "Confirmed" (manual override past capacity)
  // on memberA's row click "Check in" -> button becomes "Undo check-in"
  // open "More actions for <memberB.fullName>", "Cancel player", confirm in the dialog -> row shows "Cancelled"
});
```

  Scope every row action with `page.getByRole("row", { name: new RegExp(user.fullName) })` (or the matching list item if the roster is not a table). Each state change waits with `{ timeout: 15_000 }`.

- [ ] **Step 3: Consent banner test.** After the host adds `memberA`, open `/dashboard` as `memberA` and confirm through `components/sessions/confirm-participation-banner.tsx` (read it for the button labels); the host's roster row then no longer shows `Awaiting their confirmation`.

- [ ] **Step 4: Verify against the database.** After the roster test, assert with the service-role client: `memberA` is `confirmed` with `checked_in_at` set, `memberB` is `cancelled`.

- [ ] **Step 5: Run.** `npx playwright test host-roster --repeat-each 2` → all pass.

- [ ] **Step 6: Commit.** `test(e2e): cover host session creation and roster overrides`

---

### Task 5: Auto-match, and close out the docs

**Files:**
- Create: `tests/e2e/auto-match.spec.ts`
- Modify: `tests/e2e/support/fixtures.ts` (four gendered players), `docs/superpowers/core-schema-follow-ups.md`

**Interfaces:** consumes `createUser({ gender })`, `addCheckedInParticipant`, `makeSession`, `asUser`.

Panel: `components/sessions/auto-match-panel.tsx`. Heading `Auto-match`, select labelled `Format` with `Men's double`, `Women's double`, `Mixed double` (default mixed), button `Generate` (then `Regenerate`), per-suggestion `Discard`, `Confirm all`. A format needs four checked-in players; shortfall copy comes from `lib/matcher/suggest.ts:67-79`. `Start session` is in `components/sessions/start-session-button.tsx`.

- [ ] **Step 1: Players.** In this spec's `beforeAll`, create four users with the `gender` enum's male value (read `Database["public"]["Enums"]["gender"]`), deleted in `afterAll`.

- [ ] **Step 2: Write the tests.**

```ts
test("host generates a men's double from four checked-in players and confirms it", async (...) => {
  const s = await makeSession(users.host, { courtCount: 1 });
  for (const p of players) await addCheckedInParticipant(s.id, p);
  const host = await asUser(users.host);
  await host.goto(`/sessions/${s.id}/manage`);
  await host.getByRole("button", { name: "Start session" }).click();
  await host.getByLabel("Format").selectOption({ label: "Men's double" });
  await host.getByRole("button", { name: "Generate" }).click();
  // one suggestion listing all four player names
  await host.getByRole("button", { name: "Confirm all" }).click();
  // Matches panel shows one match with the four names
});

test("too few players shows the shortfall instead of a suggestion", async (...) => {
  // two checked-in men, Men's double, Generate
  await expect(host.getByText("Need 2 more men for a men's double.")).toBeVisible();
});
```

  If `start_session` or the manage page behaves differently for a session that starts tomorrow, give `createSession` a `startsAt` option and start it a few minutes in the past; do not skip the start.

- [ ] **Step 3: Verify against the database.** After confirm: exactly one row in `matches` for the session and four in `match_players`.

- [ ] **Step 4: Run the whole suite.** `npm run test:e2e` → all pass; run it a second time straight after to prove the sweep leaves a clean slate. `npm run test:unit`, `npm run lint`, `npx tsc --noEmit` → green. Confirm with the service-role client that no `E2E %` session and no `delivered+e2e-%` user remains.

- [ ] **Step 5: Docs.** In `docs/superpowers/core-schema-follow-ups.md`: strike "No E2E coverage" and replace it with what is covered and what is not (Google OAuth, gallery, admin, reports, drilling, premium); correct the stale "Google OAuth ships disabled" line to say it is enabled and live in production per the owner (2026-11-17), still without automated coverage.

- [ ] **Step 6: Commit.** `test(e2e): cover auto-match and record e2e coverage`
