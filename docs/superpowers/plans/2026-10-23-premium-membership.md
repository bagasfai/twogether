# Premium Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-granted, quota-and-duration premium memberships whose holders get registration priority: on a full session they take a confirmed spot and the last-registered eligible non-premium participant is moved to the front of the waitlist and emailed.

**Architecture:** Everything that touches registration state lives in Postgres: new tables, a replaced `register_for_session` (bump and quota consume, under the existing per-session advisory lock plus a `for update` on the member's membership), refund triggers, and admin grant RPCs. Next.js adds Server Actions, a DAL, an admin page, a member card, and a best-effort Resend email sent from the registration Server Action after the RPC commits (outbox row written inside the RPC).

**Tech Stack:** Supabase Postgres (pgTAP via `npx supabase test db`), Next.js App Router Server Actions, zod, react-hook-form, shadcn/ui, Resend + React Email, vitest (`npm run test:unit`).

**Spec:** `docs/superpowers/specs/2026-10-23-premium-membership-design.md`

## Global Constraints

- AGENTS.md: this Next.js has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code.
- Registration, bump, quota, and refund decisions are Postgres functions/triggers, never check-then-write app logic. RLS is the real authorization; UI gating is convenience.
- New RPCs are `security definer`, `set search_path = public, pg_temp`, `revoke ... from public, anon`, granted to `authenticated` only where a client calls them. Internal helpers are revoked from everyone.
- Every function that re-reads participants under the session lock keeps the `read committed` guard raising `JB006`.
- Lock order is always: session advisory lock (`pg_advisory_xact_lock(public.session_lock_key(...))`), then membership row `for update`.
- Bump target: `status = 'confirmed' and not is_premium and checked_in_at is null and added_by is null and user_id is not null`, ordered `registered_at desc, id desc`, limit 1. Premium members never bump each other. Guests (`user_id is null`) are never bumped.
- Waitlist order everywhere: `is_premium desc, registered_at, id`. A bump ignores `sessions.waitlist_capacity`.
- A bumped participant gets `registered_at` = (earliest `registered_at` among waiting non-premium rows) minus 1 microsecond, or `clock_timestamp()` if none, plus `bumped_at = clock_timestamp()`.
- Default `refund_cutoff_hours` = 24. No-show never refunds.
- Migration filenames: `20261023000002` through `20261023000006`. pgTAP files: `supabase/tests/031` through `036`. Error codes continue from `JB017`.
- After the migrations, regenerate `types/supabase.ts` with `npx supabase gen types typescript --local > types/supabase.ts`.
- Out of scope: payment gateway, member self-purchase, WhatsApp automation, automatic match/rotation.

## Review Focus

1. A premium member registers on a full session where every confirmed participant is checked in, host-added, a guest, or premium: nobody is moved, the premium member joins the waitlist (or gets `JB002` if the waitlist is full). Tested in Task 3.
2. A member whose membership is expired, cancelled, or out of quota registers: they register as a normal member, no usage row, no error. Tested in Task 3.
3. A premium member cancels then re-registers (the `on conflict do update` path): `is_premium`, `membership_id`, `bumped_at` are reset and a fresh usage row is created; the old refunded row does not collide. Tested in Task 3.
4. Cancel exactly at `starts_at - refund_cutoff_hours` refunds; one second later does not; cancel after the session is live does not. Tested in Task 4.
5. One member with a single quota unit left registers for two sessions concurrently: exactly one gets premium, the other registers as a normal member, no overspend. Tested in Task 6.

---

### Task 1: Schema, RLS, and grants

**Files:**
- Create: `supabase/migrations/20261023000002_premium_membership_schema.sql`
- Test: `supabase/tests/031_premium_membership_schema.test.sql`

**Interfaces:**
- Produces: tables `membership_plans`, `memberships`, `membership_usages`, `bump_notifications`; columns `participants.is_premium boolean not null default false`, `participants.membership_id uuid references memberships(id)`, `participants.bumped_at timestamptz`.
- Column shapes are exactly those in spec section 3. Add a partial unique index `membership_usages (participant_id) where refunded_at is null` (one live usage per participant; refunded rows may repeat on re-registration). `memberships.quota_total > 0`, `price_idr >= 0`, `duration_days > 0`, `refund_cutoff_hours >= 0` checks. `memberships.user_id` references `profiles(id) on delete cascade`.

- [ ] **Step 1: Write the failing test** `031_premium_membership_schema.test.sql` (style of `021_no_show_tracking.test.sql`): `has_table` for all four tables; `has_column` for the three participants columns; as `authenticated` member, `throws_ok` (sqlstate `42501`) on direct `insert`/`update`/`delete` against `memberships`, `membership_usages`, `bump_notifications`; member can `select` own membership but not another member's; a member `select` on `bump_notifications` returns zero rows; non-admin `insert` into `membership_plans` throws `42501` or RLS violation (`throws_ok`); admin can insert and update a plan; authenticated member sees only `is_active` plans, admin sees all; anon sees none of the four tables.
- [ ] **Step 2: Run** `npx supabase test db` — expect FAIL (tables missing).
- [ ] **Step 3: Implement the migration.** Enable RLS on all four tables. Policies: `membership_plans` select active for authenticated + select all for admin (`public.is_admin()`) + admin insert/update/delete; `memberships` and `membership_usages` select where `user_id = auth.uid()` (usages via join to memberships) or `public.is_admin()`; no client policies for writes; `bump_notifications` has RLS enabled and no policies. Do not grant insert/update/delete on the three RPC-only tables to `authenticated`; grant `select` only where a select policy exists. Follow `20260911000007_rls_helpers.sql` for the helper names.
- [ ] **Step 4: Run** `npx supabase test db` — expect `031` PASS and all existing files still PASS.
- [ ] **Step 5: Commit** `feat: add premium membership schema and rls`.

---

### Task 2: Quota helper, current-membership lock, waitlist ordering

**Files:**
- Create: `supabase/migrations/20261023000003_premium_membership_helpers.sql`
- Test: `supabase/tests/032_premium_waitlist_order.test.sql`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces:
  - `public.membership_quota_left(p_membership_id uuid) returns int` = `quota_total` minus count of usages with `refunded_at is null`. `stable`, revoked from all.
  - `public.lock_current_membership(p_user_id uuid) returns public.memberships`. Selects the earliest-created membership for the user with `cancelled_at is null`, quota left > 0, and (`started_at is null` or `expires_at > now()`), `for update`. If its `started_at` is null, sets `started_at = now()` and `expires_at = now() + duration_days * interval '1 day'` and returns the updated row. Returns a row with null `id` when none. Revoked from all (internal; called by definer RPCs).
  - `waitlist_position_of(uuid, timestamptz, uuid)` keeps its signature and revoke; ordering becomes `is_premium desc, registered_at, id` (look up the target row's `is_premium` by `p_id`).
  - `promote_from_waitlist()` picks `order by is_premium desc, registered_at, id`.

- [ ] **Step 1: Write the failing tests** in `032_premium_waitlist_order.test.sql`: `promotes_premium_waiter_before_older_non_premium` (cancel a confirmed row; the premium waiter is promoted although registered later); `bumped_style_row_promotes_before_other_non_premium` (a waiter with earlier `registered_at` than the rest promotes first among non-premium); `waitlist_position_of_counts_premium_ahead` (a non-premium waiter behind one premium waiter gets position 2); `lock_current_membership_skips_exhausted_and_expired` (expired, cancelled, and full-quota memberships are skipped; the next queued one is returned); `lock_current_membership_starts_queued_membership_lazily` (null `started_at` becomes `now()`, `expires_at` = start + duration); `lock_current_membership_returns_null_row_when_none`.
- [ ] **Step 2: Run** `npx supabase test db` — expect `032` FAIL.
- [ ] **Step 3: Implement** the four functions as `create or replace`, copying existing bodies of `waitlist_position_of` and `promote_from_waitlist` from `20260911000010_registration.sql` and changing only the ordering. Keep the `JB006` guard and grants.
- [ ] **Step 4: Run** `npx supabase test db` — `032` PASS; `010`, `018`, `019` still PASS.
- [ ] **Step 5: Commit** `feat: premium-aware waitlist order and membership lock helper`.

---

### Task 3: Replace `register_for_session` with bump and quota consume

**Files:**
- Create: `supabase/migrations/20261023000004_register_for_session_premium.sql`
- Test: `supabase/tests/033_premium_registration.test.sql`

**Interfaces:**
- Consumes: `lock_current_membership`, `membership_quota_left`, new tables/columns.
- Produces: `register_for_session(p_session_id uuid) returns public.registration_result` (same signature and result type). Base it on the version in `20260914000001_participant_consent.sql` and keep `consented_at`, the isolation guard, and error codes. Add, after the lock/open checks:
  1. `v_membership := public.lock_current_membership(v_user)`; premium only if `v_membership.id is not null`.
  2. Not full: insert as confirmed.
  3. Full and premium: pick the bump target per Global Constraints. If found, set it to `waiting_list` with the stamp rules, insert a `bump_notifications` row for it, confirm the caller. If not found, apply the existing waitlist-capacity rule (`JB002` when full).
  4. Non-premium callers keep the exact old behavior (full means waitlist or `JB002`).
  5. The participant upsert sets `is_premium`, `membership_id`, and on conflict resets `is_premium`, `membership_id`, `bumped_at = null` to the new values. When premium, insert a `membership_usages` row (`membership_id`, `participant_id`, `consumed_at = now()`) after the upsert.

- [ ] **Step 1: Write the failing tests** in `033_premium_registration.test.sql`, one `select` assertion group each: `premium_takes_free_seat_and_consumes_quota`; `premium_on_full_session_bumps_last_registered_non_premium` (bumped row is `waiting_list`, `bumped_at` set, one `bump_notifications` row, and it is first in line ahead of an older non-premium waiter); `bump_skips_checked_in_host_added_guest_and_premium` (Review Focus 1: with only those candidates the premium caller is waitlisted and nobody changes; with a full waitlist the call raises `JB002`); `premium_does_not_bump_premium`; `no_membership_registers_as_before` and `expired_cancelled_or_exhausted_membership_registers_as_normal` (Review Focus 2: `is_premium = false`, zero usage rows, no error); `premium_waitlisted_still_consumes_quota`; `reregistration_resets_premium_flags_and_creates_new_usage` (Review Focus 3); `registration_closed_and_already_registered_errors_unchanged` (`JB001`, `JB003`).
- [ ] **Step 2: Run** `npx supabase test db` — expect `033` FAIL.
- [ ] **Step 3: Implement** the migration; the bump is one `update ... where id = (select ... limit 1) returning` under the session lock. Do not call `register_for_session` internals from guests' RPC; leave `register_guest_for_session` unchanged.
- [ ] **Step 4: Run** `npx supabase test db` — `033` PASS; `010`, `010a`, `017`, `019` still PASS.
- [ ] **Step 5: Commit** `feat: premium priority registration with bump and quota consume`.

---

### Task 4: Refund triggers

**Files:**
- Create: `supabase/migrations/20261023000005_premium_refunds.sql`
- Test: `supabase/tests/034_premium_refunds.test.sql`

**Interfaces:**
- Consumes: usages ledger, `is_session_host`.
- Produces: `public.refund_usage_on_cancel()` trigger function, `after update` on `participants` `when (old.status in ('confirmed','waiting_list') and new.status = 'cancelled')`; `public.refund_usages_on_session_change()` trigger function, `after update` on `sessions` `when (old.status is distinct from new.status and new.status in ('live','cancelled'))`. Both `security definer`, internal, set `refunded_at = now()` and a `refund_reason` text on the participant's open usage row.
  - Participant cancel: from `waiting_list` always refunds (`'waitlist_cancel'`); the actor is a session host and not the participant (`public.is_session_host(new.session_id) and auth.uid() is distinct from new.user_id`) refunds (`'host_cancel'`); otherwise from `confirmed` refunds only if `now() <= sessions.starts_at - refund_cutoff_hours * interval '1 hour'` using the membership's snapshot cutoff (`'member_cancel_before_cutoff'`).
  - Session `cancelled`: refund every open usage of that session's participants (`'session_cancelled'`). Session `live`: refund open usages of participants still `waiting_list` (`'waitlist_at_start'`).

- [ ] **Step 1: Write the failing tests** in `034_premium_refunds.test.sql`: `member_cancel_before_cutoff_refunds`; `member_cancel_exactly_at_cutoff_refunds` and `member_cancel_one_second_after_cutoff_does_not_refund` (Review Focus 4, use `starts_at` fixtures relative to `now()` so the boundary is deterministic); `member_cancel_after_session_live_does_not_refund`; `waitlist_cancel_always_refunds`; `host_cancel_always_refunds` (via `host_set_participant_status`); `session_cancelled_refunds_all_open_usages`; `session_start_refunds_waitlisted_premium_only`; `no_show_keeps_usage_consumed`; `non_premium_cancel_is_a_noop`; `refund_restores_quota_left`.
- [ ] **Step 2: Run** `npx supabase test db` — expect `034` FAIL.
- [ ] **Step 3: Implement** the migration. The cutoff comparison uses `now()` inside the trigger.
- [ ] **Step 4: Run** `npx supabase test db` — `034` PASS; `010`, `024` still PASS.
- [ ] **Step 5: Commit** `feat: refund premium quota on cancel, session start, and session cancel`.

---

### Task 5: Admin grant and cancel RPCs, error codes

**Files:**
- Create: `supabase/migrations/20261023000006_admin_membership_rpcs.sql`
- Test: `supabase/tests/035_admin_membership_rpcs.test.sql`, `supabase/tests/036_premium_grant_surface_negatives.test.sql`
- Modify: `lib/errors/rpc.ts`, `tests/unit/rpc-errors.test.ts`

**Interfaces:**
- Produces:
  - `admin_grant_membership(p_user_id uuid, p_plan_id uuid, p_payment_received_at timestamptz, p_price_idr int default null, p_quota int default null, p_duration_days int default null) returns public.memberships`. Checks `public.is_admin()` (`JB007` otherwise), plan exists and `is_active` and user exists (`JB017` otherwise). Copies plan values (overrides win) including `refund_cutoff_hours`, sets `activated_by = auth.uid()`. If the user has no live membership (`lock_current_membership` returns a null row), sets `started_at = now()` and `expires_at` immediately; otherwise leaves `started_at` and `expires_at` null (queued). Grants to `authenticated`, revoked from `public, anon`.
  - `admin_cancel_membership(p_membership_id uuid) returns public.memberships`: admin only; `JB017` if not found; `JB018` if already cancelled; sets `cancelled_at`; existing usages stay.
- Error codes: `JB017` "membership or plan not found or inactive" maps to `"not_found"`; `JB018` "membership already cancelled" maps to `"invalid_state"`. Add both to the header comment and `RPC_CODE_MAP`.

- [ ] **Step 1: Write the failing tests.** `035`: `admin_grant_copies_plan_values`; `admin_grant_overrides_win`; `grant_starts_immediately_when_no_live_membership`; `grant_queues_when_live_membership_exists` (null `started_at`, `expires_at`); `non_admin_and_host_get_JB007`; `inactive_plan_or_missing_user_get_JB017`; `editing_plan_after_grant_does_not_change_membership`; `cancel_sets_cancelled_at_keeps_usages`; `cancel_twice_gets_JB018`; `anon_gets_JB004`. `036` follows `022_grant_surface_negatives.test.sql`: `has_function_privilege` negatives for anon/public on both RPCs and on `lock_current_membership`, `membership_quota_left`, both refund trigger functions; `has_table_privilege` negatives for `insert/update/delete` on the three RPC-only tables. In `tests/unit/rpc-errors.test.ts` add assertions that `JB017` maps to `not_found` and `JB018` to `invalid_state`.
- [ ] **Step 2: Run** `npx supabase test db` and `npm run test:unit` — expect FAIL.
- [ ] **Step 3: Implement** the migration and the two `RPC_CODE_MAP` entries plus header comment lines.
- [ ] **Step 4: Run** `npx supabase test db` and `npm run test:unit` — expect all PASS.
- [ ] **Step 5: Regenerate types** with the command in Global Constraints and confirm `git diff types/supabase.ts` shows the new tables, columns, and RPCs.
- [ ] **Step 6: Commit** `feat: admin grant and cancel membership rpcs`.

---

### Task 6: Extend the concurrency race script

**Files:**
- Modify: `scripts/test-concurrent-registration.sh`

**Interfaces:**
- Consumes: the replaced `register_for_session`.

- [ ] **Step 1: Read the whole script** and follow its structure (barrier release, cleanup, `ARRIVAL_SPREAD_THRESHOLD_MS` assertion). Add two scenarios after the existing one, each seeded and cleaned up with the script's own helpers.
  - *Scenario B:* a one-seat session; N concurrent non-premium callers plus one premium caller. Assert exactly one confirmed, the confirmed row is the premium member, no oversubscription, and exactly one `bump_notifications` row exists if a non-premium caller had won the seat first (assert the invariant, not the interleaving: confirmed count = 1, premium member confirmed or waitlisted behind nobody non-premium).
  - *Scenario C (Review Focus 5):* one member with `quota_total = 1`, two one-seat sessions, two concurrent `register_for_session` calls as that member. Assert exactly one `membership_usages` row with `refunded_at is null` and `quota_left = 0`, and both registrations succeeded (one `is_premium`, one not).
- [ ] **Step 2: Run** `scripts/test-concurrent-registration.sh` against the local stack — expect PASS for all scenarios, and the barrier-spread assertion still holds.
- [ ] **Step 3: Commit** `test: race scenarios for premium bump and shared quota`.

---

### Task 7: Validation, DAL, and Server Actions

**Files:**
- Create: `lib/validation/memberships.ts`, `lib/dal/memberships.ts`, `lib/actions/memberships.ts`
- Test: `tests/unit/membership-validation.test.ts`

**Interfaces:**
- Consumes: regenerated `types/supabase.ts`, `RPC_CODE_MAP`.
- Produces:
  - `lib/validation/memberships.ts`: `planSchema` (`name` non-empty trimmed, `priceIdr` int >= 0, `quota` int >= 1, `durationDays` int >= 1, `refundCutoffHours` int >= 0 default 24, `isActive` boolean), `grantMembershipSchema` (`userId` uuid, `planId` uuid, `paymentReceivedAt` ISO datetime string, optional `priceIdr`, `quota`, `durationDays` with the same bounds). Export inferred types `PlanInput`, `GrantMembershipInput`.
  - `lib/dal/memberships.ts` (`import "server-only"`, each function checks `getCurrentUser()` like `lib/dal/admin.ts`): `listPlans(): Promise<PlanRow[]>` (admin: all; others: active), `listMembershipsForAdmin(): Promise<AdminMembershipRow[]>` (member name, plan name, `quotaTotal`, `quotaUsed`, `startedAt`, `expiresAt`, `cancelledAt`, `status: "queued" | "active" | "exhausted" | "expired" | "cancelled"`), `getMyMemberships(): Promise<MyMembershipRow[]>` (same status field and `quotaLeft`). Derive `status` in one exported pure function `deriveMembershipStatus(row, now)` so it is unit-testable.
  - `lib/actions/memberships.ts` (`"use server"`): `savePlan(id: string | null, input: PlanInput): Promise<ActionResult<null>>` (admin check, plain insert/update under RLS), `grantMembership(input: GrantMembershipInput): Promise<ActionResult<null>>` (calls `admin_grant_membership`, `failFromRpc` on error), `cancelMembership(membershipId: string): Promise<ActionResult<null>>`. All `revalidatePath("/admin")`; `grantMembership` also `revalidatePath("/dashboard")`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/membership-validation.test.ts`: `planSchema rejects quota 0, negative price, blank name`; `planSchema defaults refundCutoffHours to 24`; `grantMembershipSchema accepts overrides and rejects non-uuid ids`; `deriveMembershipStatus` covers queued (null `startedAt`), active, exhausted (`quotaUsed >= quotaTotal`), expired (`expiresAt <= now`), cancelled (wins over all).
- [ ] **Step 2: Run** `npm run test:unit -- membership-validation` — expect FAIL.
- [ ] **Step 3: Implement** the three files per the interfaces. Follow the shape of `lib/actions/admin.ts` and `lib/validation/admin.ts`.
- [ ] **Step 4: Run** `npm run test:unit` and `npx tsc --noEmit` — expect PASS.
- [ ] **Step 5: Commit** `feat: membership validation, dal, and server actions`.

---

### Task 8: Bump email

**Files:**
- Modify: `package.json` (add `resend`, `@react-email/components`, `@react-email/render`), `.env.example` (add `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`), `lib/actions/registration.ts`
- Create: `lib/supabase/service.ts`, `lib/email/bump-email.tsx`, `lib/email/send-bump-notifications.ts`
- Test: `tests/unit/send-bump-notifications.test.ts`

**Interfaces:**
- Consumes: `bump_notifications` rows.
- Produces:
  - `lib/supabase/service.ts`: `createServiceClient(): SupabaseClient<Database>` with `import "server-only"`, reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, no session persistence.
  - `lib/email/bump-email.tsx`: `BumpEmail({ name, sessionTitle, startsAt, sessionUrl }): JSX.Element`. Copy: states they were moved to the waitlist because a premium member joined, that they stay first in line among regular members, and links to the session. Sender format matches the auth hook: `Jakbar Twogether <no-reply@${RESEND_EMAIL_DOMAIN}>`.
  - `lib/email/send-bump-notifications.ts`: `sendPendingBumpNotifications(deps?: { resend?: Pick<Resend, "emails">; supabase?: SupabaseClient<Database> }): Promise<{ sent: number; failed: number }>`. Algorithm: claim unsent rows with `update ... set sent_at = now() where sent_at is null returning ...` (so two concurrent callers never double-send), resolve each bumped member's email via `supabase.auth.admin.getUserById`, send, and on a send or lookup failure set `sent_at` back to null for that row. Never throws.
  - `registerForSession` calls `sendPendingBumpNotifications()` after a successful RPC inside `try/catch`; a failure is logged and never changes the returned `ActionResult`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/send-bump-notifications.test.ts` with injected fakes: `sends one email per claimed row and reports sent count`; `resets sent_at when the email send fails and does not throw`; `resets sent_at when the user lookup fails`; `claims only rows with null sent_at` (a row already sent is skipped); `returns zero counts when nothing is pending`.
- [ ] **Step 2: Run** `npm run test:unit -- send-bump-notifications` — expect FAIL.
- [ ] **Step 3: Install deps** (`npm install resend @react-email/components @react-email/render`), then implement the files per the interfaces and wire the call in `registerForSession`.
- [ ] **Step 4: Run** `npm run test:unit`, `npx tsc --noEmit`, `npm run lint` — expect PASS.
- [ ] **Step 5: Confirm with the user** that `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `RESEND_EMAIL_DOMAIN` are set in the Vercel project environment (the spec's open item). Do not proceed to deploy without that.
- [ ] **Step 6: Commit** `feat: email members moved to the waitlist by a premium bump`.

---

### Task 9: Admin UI

**Files:**
- Create: `components/admin/membership-plans-panel.tsx`, `components/admin/grant-membership-dialog.tsx`, `components/admin/memberships-table.tsx`
- Modify: `app/(app)/admin/page.tsx`

**Interfaces:**
- Consumes: `listPlans`, `listMembershipsForAdmin`, `listAllMembers`, `savePlan`, `grantMembership`, `cancelMembership`, `planSchema`, `grantMembershipSchema`.
- Produces: a "Memberships" section on `/admin` (same section pattern as Members/About/FAQ): plan list with create/edit dialog; a grant dialog with a member `Select` populated from `listAllMembers()` (the existing session picker `add-participant-dialog.tsx` is scoped to a session, so it is not reused), a plan `Select`, payment date input, and optional price/quota/duration override fields pre-filled from the chosen plan; a memberships table showing member, plan, `quotaUsed / quotaTotal`, expiry, status badge, and a cancel button using `hold-to-confirm-button.tsx`. Forms use react-hook-form with the shared zod schemas; follow `faq-item-dialog.tsx` and `member-role-table.tsx`. Render money as `Rp` with `Intl.NumberFormat("id-ID")`.

- [ ] **Step 1: Read** `node_modules/next/dist/docs/` guidance on Server Actions and client components, then `components/admin/faq-item-dialog.tsx` and `components/admin/member-role-table.tsx` for patterns.
- [ ] **Step 2: Implement** the three components and add the section to `app/(app)/admin/page.tsx`, fetching its data in the existing `Promise.all`.
- [ ] **Step 3: Verify** with `npm run lint` and `npx tsc --noEmit`, then run the app (`run` skill) as an admin: create a plan (Rp270.000, quota 7, 30 days), grant it to a member, grant a second to the same member and confirm it shows as queued, cancel one. Report what you saw; if the browser check is not possible, say so.
- [ ] **Step 4: Commit** `feat: admin memberships page`.

---

### Task 10: Member card and host roster badge

**Files:**
- Create: `components/sessions/membership-card.tsx`
- Modify: `app/(app)/dashboard/page.tsx`, `lib/dal/participants.ts` (`RosterEntry` gains `isPremium: boolean`, `bumpedAt: string | null`, selected in the roster query), `components/sessions/roster-table.tsx`

**Interfaces:**
- Consumes: `getMyMemberships`, extended `RosterEntry`.
- Produces: `MembershipCard({ memberships }: { memberships: MyMembershipRow[] }): JSX.Element` showing the active membership's quota left, expiry, and any queued memberships; renders nothing when the member has none. The roster shows a "Premium" `Badge` for `isPremium` and a "Bumped" `Badge` for `bumpedAt` non-null. Hosts' manual status controls are unchanged.

- [ ] **Step 1: Read** `components/sessions/roster-table.tsx` and the roster select in `lib/dal/participants.ts`; add the two columns to the select and map them.
- [ ] **Step 2: Implement** the card, wire it into the dashboard, and add the badges.
- [ ] **Step 3: Verify** with `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`; then in the running app confirm the card on a member dashboard, and the badges on a host roster after a premium member bumps another. Report what you saw; say so if not checked in a browser.
- [ ] **Step 4: Commit** `feat: member membership card and roster premium badges`.

---

## Self-review notes

- **Spec coverage:** decisions 1-7 map to Tasks 3, 4, 5, 7, 9; data model to Task 1; clock rule to Tasks 2 and 5; waitlist order to Task 2; refunds incl. session start to Task 4; RLS/grants to Tasks 1 and 5; email to Task 8; UI to Tasks 9-10; error codes to Task 5; tests to each task and Task 6.
- **Deviations from the spec to confirm on review:** (1) the grant form picks the member from a `Select` of all members instead of reusing the session-scoped member picker; (2) `membership_usages` has a partial unique index on open usages so re-registration after a refund does not collide; (3) guests (`user_id is null`) are excluded from bumping because they have no email; (4) refunds on session start/cancel are a trigger on `sessions` rather than an edit to `start_session`.
