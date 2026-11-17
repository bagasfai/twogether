# End-to-end tests with Playwright — design

Approved by the owner on 2026-11-17.

## Intent

Signup, login, registration, host override and the auto-match panel are verified by hand only
(`docs/superpowers/core-schema-follow-ups.md`, "No E2E coverage"). This adds a Playwright suite
that drives the real app against the local Supabase stack, so those flows are checked by a
command instead of by a person.

## Goals

- One command, `npm run test:e2e`, runs the suite against the local stack and `next dev`.
- Tests go through the real UI, Server Actions, RLS and RPCs. Nothing in Supabase is mocked.
- A run leaves no users or sessions behind and does not depend on `supabase/seed.sql`.

## Non-goals

- Google OAuth (cannot be automated against real Google).
- Running against the hosted project or production.
- A CI workflow. None exists in the repo yet; this suite is written so one can call it later.
- Gallery, admin, reports, announcements, marketing pages.
- Proving race-safety. `scripts/test-concurrent-*.sh` remain the proof of that.

## Anti-goals

- Tests that pass because of seed data, a particular locale's copy, or leftover rows from an
  earlier run.
- Mail from a run reaching a real inbox or bouncing. Signup and the reset request still call
  the `send-email` hook, and the app drains `email_outbox`, so every test user's address is a
  Resend sink address (`delivered+<label>@resend.dev`), and the dev server Playwright starts
  runs with `RESEND_API_KEY` empty so the outbox drain is a no-op.

## Constraints

- Local signup confirmation and recovery mail goes through the `send-email` hook to Resend, not
  to the local mail UI, so a test cannot read an inbox.
- Seed users have non-RFC UUIDs; `z.uuid()` actions (for example `transferSeat`) reject them.
- The app is localized with `next-intl`; selectors must not depend on one language's copy.
- Local stack ports are non-default: API `54331`, DB `54332`.
- This Next.js version differs from older ones; follow
  `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`.

## Approaches

1. **Real stack, users created per run through the service-role admin API (chosen).** Real
   UUIDs, unique emails, roles set directly, users deleted afterwards. Exercises RLS and the
   RPCs, which is the part worth testing. Costs a service-role key in the test process and a
   running local stack.
2. **Log in as the seed users.** No fixture code, but the non-RFC UUIDs break `z.uuid()`
   actions, and tests would share and mutate state across runs.
3. **Mock Supabase at the network layer.** Fast and stack-free, but skips RLS, triggers and
   RPCs, so it would not catch the failures this app is most exposed to.

## Design

- **Tooling.** `@playwright/test` as a dev dependency. `playwright.config.ts` at the repo root:
  `testDir: tests/e2e`, Chromium only, `webServer` runs `next dev` on port 3000 and reuses an
  already-running server. Script `test:e2e` in `package.json`. Vitest must keep ignoring
  `tests/e2e`.
- **Users.** A fixture creates fresh users with the service-role admin API (confirmed email,
  unique address per run), sets `profiles.role` for host and admin, and deletes them in
  teardown. Deleting the user must also remove the sessions and participant rows the run made.
- **Login.** Each role logs in once through the real login form; the storage state is saved and
  reused by the specs for that role.
- **Email links.** Signup fills the real form, then the test asks the admin API
  (`generateLink`) for the confirmation link and visits it. This covers the form and
  `/auth/confirm` and skips mail delivery. Password reset does the same with a recovery link.
- **Selectors.** Roles, labels resolved from the message catalog, or `data-testid` where a
  control has no stable accessible name. Adding a `data-testid` to a component is allowed.
- **Specs.**
  1. Auth: signup and confirm, login, logout, redirect from a protected route when signed out.
  2. Member registration: register, cancel, land on the waitlist when the session is full, get
     promoted when a seat frees.
  3. Host: create a session, add a participant manually, override a status, remove, check in.
  4. Auto-match: generate suggestions on a session with checked-in players and confirm them.
  5. Password reset: request, follow the recovery link, set a new password, log in with it.

## Left to the builder

- File and fixture layout under `tests/e2e/`.
- How the service-role key and URLs reach the test process (read from `.env.local`).
- How session fixtures are built for specs 2 and 4: through the UI, or inserted with the
  service-role client where the UI path is already covered by spec 3.
- Where `data-testid` attributes are needed.
