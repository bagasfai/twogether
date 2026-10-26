# Drilling Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `drilling` session kind with coach-based capacity that can change while live, a no-refund cancel rule, seat replacement, and bump/pricing changes for premium members.

**Architecture:** All state changes that touch registration or the waitlist are Postgres functions and triggers under the existing per-session advisory lock (`public.session_lock_key`), exactly like `register_for_session`. Two new RPCs (`transfer_participation`, `adjust_session_capacity`) carry the new behavior. Existing registration, refund, and promotion functions get minimal redefinitions. The app layer adds a pure amount-owed helper, validation, DAL fields, two Server Actions, and three small UI pieces.

**Tech Stack:** Supabase Postgres (pgTAP), Next.js App Router Server Actions, zod, react-hook-form, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-drilling-sessions-design.md` (builds on `docs/superpowers/specs/2026-10-23-premium-membership-design.md`).

## Prerequisites (not tasks)

- The premium work lives on branch `feat/premium-membership` and is not merged into this branch. Drilling edits functions that premium redefines (`register_for_session`, `refund_usage_on_cancel`, `host_add_participant`, `host_set_participant_status`, `promote_from_waitlist`). Merge premium first, then branch `feat/drilling-sessions` off the result.
- The merge has two collisions to resolve before this plan starts. Premium uses `JB017` (membership or plan not found) and `JB018` (already cancelled or refunded), but auto-match already owns `JB017` (`player_busy`). Renumber premium's two codes to `JB018` and `JB019` in its migrations, `lib/errors/rpc.ts`, and its tests. Premium pgTAP files `036` and `037` also collide with `036_match_player_busy_guard.test.sql`; renumber them.
- This plan assumes the merged base uses `JB001`–`JB019` and test files through `039`. Drilling codes are `JB020`–`JB026` and drilling pgTAP files are `040`–`045`. If the merged base differs, shift both ranges and keep them consistent.
- Migration timestamps for this plan start at `20261028000001`, after the newest migration on `main` (`20261027000002`).

## Global Constraints

- Every new RPC is `security definer`, `set search_path = public, pg_temp`, takes `pg_advisory_xact_lock(public.session_lock_key(<session_id>))`, and begins with the `read committed` guard that raises `JB006` (copy the guard from `promote_from_waitlist`). Grants: `revoke execute ... from public, anon`, `grant execute ... to authenticated`.
- Trigger functions are never callable as RPCs: `revoke execute ... from public, anon, authenticated`.
- Refund behavior is derived from `sessions.kind`; there is no `quota_refundable` column.
- `max_participants = coach_count * seats_per_coach` and `court_count = coach_count` for drilling rows, enforced by a CHECK constraint.
- Drilling costs 1 quota unit; no `units` column, no `quota_cost` column.
- Amount owed: premium participant → `premium_surcharge_idr`; everyone else → `price`.
- Error codes `JB020`–`JB026`, all mapped to `"invalid_state"` in `lib/errors/rpc.ts` and listed in its header comment.
- After every migration: `npx supabase gen types typescript --local > types/supabase.ts`.
- Run commands: `npx supabase test db` (pgTAP), `npm run test:unit` (Vitest), `npm run lint`.
- pgTAP files follow `supabase/tests/NNN_<topic>.test.sql`, inline their fixtures (`begin; select plan(N);`, fixed UUIDs, `@test.local` emails), and sibling isolation files use the `NNNa_` suffix.
- Next.js in this repo has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing Server Action or page code.

## Review Focus

1. A member hands off a seat, later registers again on the same session. Their old row still has `replaced_by` set, so the promotion and refund triggers would skip it forever. Re-registration and host re-add must clear `replaced_by` and `paid_by_user_id`. Tested in Task 2.
2. The replacement already has a cancelled row on that session. `participants` is `UNIQUE (session_id, user_id)`, so a plain insert fails. The transfer must revive that row. Tested in Task 3.
3. The seat being handed over is checked in. The replacement has not arrived, so the new row must have `checked_in_at = null`. This deviates from spec section 6, which says to copy it; Task 3 amends the spec. Tested in Task 3.
4. A host-added guest is bumped. The guest has no account, so no `bump_notifications` row may be inserted and the registration must not fail. Tested in Task 2.
5. A coach is added while the waitlist holds both premium and non-premium people, and the raise exceeds the waitlist length. Order is premium first, then oldest, and the loop stops cleanly with seats left over. Tested in Task 4.

---

## File Structure

- `supabase/migrations/20261028000001_drilling_schema.sql`: enum, columns, checks, kind lock, grants.
- `supabase/migrations/20261028000002_drilling_registration_rules.sql`: bump target, guest notification skip, re-registration reset.
- `supabase/migrations/20261028000003_drilling_refund_and_promotion.sql`: refund and promotion skip rules.
- `supabase/migrations/20261028000004_transfer_participation.sql`
- `supabase/migrations/20261028000005_adjust_session_capacity.sql`
- `supabase/tests/040`–`045`: one file per migration plus isolation files where noted.
- `scripts/test-concurrent-drilling.sh`: race script.
- `lib/sessions/amount-owed.ts`: pure pricing helper.
- `lib/validation/session.ts`, `lib/validation/drilling.ts`: schemas.
- `lib/actions/session-payload.ts`, `lib/actions/sessions.ts`, `lib/actions/capacity.ts`, `lib/actions/transfers.ts`: actions.
- `lib/dal/sessions.ts`, `lib/dal/participants.ts`: new fields.
- `components/sessions/session-form.tsx`, `coach-count-control.tsx`, `replace-seat-dialog.tsx`, `roster-table.tsx`.

---

### Task 1: Schema, kind lock, and grants

**Files:**
- Create: `supabase/migrations/20261028000001_drilling_schema.sql`
- Test: `supabase/tests/040_drilling_schema.test.sql`
- Modify: `lib/errors/rpc.ts`, `tests/unit/rpc-errors.test.ts`, `types/supabase.ts` (regenerated)

**Interfaces:**
- Produces: enum `public.session_kind ('open_play','drilling')`; `sessions.kind`, `sessions.premium_surcharge_idr`, `sessions.coach_count`, `sessions.seats_per_coach`; `participants.replaced_by`, `participants.paid_by_user_id`; trigger function `public.guard_session_kind_change()`; error code `JB020` (`kind` change with existing participants).

- [ ] **Step 1: Write the failing tests** in `040_drilling_schema.test.sql`: `drilling_requires_coach_and_seats` (insert drilling with null `coach_count` fails with `23514`); `open_play_rejects_coach_columns`; `drilling_capacity_is_derived` (`coach_count=2, seats_per_coach=6` with `max_participants=11` or `court_count=1` fails; `12` and `2` succeed); `kind_change_blocked_with_participant_row` (a cancelled row also blocks; error `JB020`); `kind_change_allowed_on_empty_session`; `surcharge_not_negative`; `authenticated_cannot_update_replaced_by_or_paid_by_user_id` (`has_column_privilege('authenticated','public.participants','replaced_by','update')` is false, same for `paid_by_user_id`). In `tests/unit/rpc-errors.test.ts` assert `JB020` maps to `invalid_state`.
- [ ] **Step 2: Run** `npx supabase test db` and `npm run test:unit`. Expected: FAIL (missing enum, columns, code).
- [ ] **Step 3: Implement the migration.** CHECK constraint `sessions_drilling_shape` covers both the null/not-null rule and the derived capacity. `guard_session_kind_change()` is `before update of kind on public.sessions` and raises `JB020` when any `participants` row exists for the session. Follow `20260917000004_participants_update_column_grant.sql` for the column-grant mechanism; the new participant columns get no update grant. Add `JB020` to the header comment and `RPC_CODE_MAP` in `lib/errors/rpc.ts`.
- [ ] **Step 4: Regenerate types, run both suites.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261028000001_drilling_schema.sql supabase/tests/040_drilling_schema.test.sql lib/errors/rpc.ts tests/unit/rpc-errors.test.ts types/supabase.ts
git commit -m "feat: add drilling session kind schema"
```

---

### Task 2: Bump target, guest notification skip, re-registration reset

**Files:**
- Create: `supabase/migrations/20261028000002_drilling_registration_rules.sql`
- Test: `supabase/tests/041_drilling_registration_rules.test.sql`
- Modify: `types/supabase.ts` only if signatures change (they must not)

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: redefined `public.register_for_session(p_session_id uuid)`, `public.host_add_participant`, `public.host_set_participant_status`, with unchanged signatures.

- [ ] **Step 1: Write the failing tests** in `041`: `bump_target_includes_host_added_participant` (open play and drilling: with only a host-added non-premium confirmed row, a premium caller bumps it); `bump_target_includes_guest_row` (a guest row is bumped; `bump_notifications` count stays 0 and the call returns normally, Review Focus 4); `bump_still_skips_premium_and_checked_in`; `bump_picks_last_registered_when_guest_and_member_present`; `reregistration_clears_replaced_by_and_paid_by` (a cancelled row with both set, member registers again; both are null afterwards, Review Focus 1); `host_add_clears_replaced_by_and_paid_by`; `host_uncancel_clears_replaced_by_and_paid_by`.
- [ ] **Step 2: Run** `npx supabase test db`. Expected: FAIL (host-added and guest rows are skipped today).
- [ ] **Step 3: Implement** by `create or replace` copying the current bodies from the merged premium migrations (`20261023000004` and `20261023000007`). Changes only: drop `added_by is null` and the guest exclusion from the bump target select; insert a `bump_notifications` row only when the bumped row has a non-null `user_id`; reset `replaced_by` and `paid_by_user_id` in the same `on conflict do update` / un-cancel branches that already reset `is_premium`, `membership_id`, `bumped_at`. Keep every grant and the `JB006` guard.
- [ ] **Step 4: Run** `npx supabase test db`. Expected: PASS, including the existing premium registration tests (update premium test `033`'s `bump_skips_checked_in_host_added_guest_and_premium` to the new rule: host-added and guests are now bumpable).
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261028000002_drilling_registration_rules.sql supabase/tests
git commit -m "feat: let premium bump host-added guests and clear transfer links on re-registration"
```

---

### Task 3: Refund and promotion rules, `transfer_participation`

**Files:**
- Create: `supabase/migrations/20261028000003_drilling_refund_and_promotion.sql`, `supabase/migrations/20261028000004_transfer_participation.sql`
- Test: `supabase/tests/042_drilling_refunds.test.sql`, `supabase/tests/043_transfer_participation.test.sql`, `supabase/tests/043a_transfer_participation_isolation.test.sql`
- Modify: `lib/errors/rpc.ts`, `tests/unit/rpc-errors.test.ts`, `docs/superpowers/specs/2026-10-26-drilling-sessions-design.md` (section 6 step 1), `types/supabase.ts`

**Interfaces:**
- Consumes: Task 1 columns, Task 2 reset behavior.
- Produces: `public.transfer_participation(p_participant_id uuid, p_to_user_id uuid) returns public.participants` (the replacement row). Errors: `JB021` replacement already on the session; `JB022` seat not confirmed; `JB023` non-host transfer after `starts_at`. Authorization failures raise the existing `JB007`; anon raises `JB004`.

- [ ] **Step 1: Write the failing refund tests** in `042`: `drilling_member_cancel_from_confirmed_never_refunds`; `open_play_member_cancel_before_cutoff_still_refunds`; `drilling_waitlist_cancel_refunds`; `drilling_host_cancel_refunds`; `drilling_session_cancel_refunds`; `replaced_row_skips_refund_and_promotion` (cancel a confirmed premium row with `replaced_by` set: usage stays consumed, the first waitlister stays waitlisted).
- [ ] **Step 2: Write the failing transfer tests** in `043`: `member_transfers_own_seat` (new row `confirmed`, old row `cancelled` with `replaced_by` = new id, confirmed count unchanged, waitlister not promoted); `replacement_copies_premium_snapshot_and_paid_at` (`is_premium`, `membership_id`, `paid_at` equal the old row; no `membership_usages` row for the new row; old usage unchanged and unrefunded; `paid_by_user_id` is the original user); `replacement_checked_in_at_is_null` (original was checked in, Review Focus 3); `replacement_with_prior_cancelled_row_is_revived` (Review Focus 2: one row for that user afterwards, `confirmed`, `consented_at` null); `replacement_consent_is_null`; `host_can_transfer_any_seat_including_guest` (guest seat: `paid_by_user_id` null); `non_owner_non_host_gets_JB007`; `anon_gets_JB004`; `transfer_to_member_already_confirmed_or_waitlisted_gets_JB021`; `transfer_to_self_gets_JB021`; `transfer_waitlisted_or_cancelled_seat_gets_JB022`; `member_after_starts_at_gets_JB023_host_succeeds`; `premium_replacement_seat_is_not_bumped`; `replacement_cancel_later_does_not_refund_original`. `043a`: `transfer_participation` raises `JB006` under `repeatable read`.
- [ ] **Step 3: Run** `npx supabase test db`. Expected: FAIL.
- [ ] **Step 4: Implement the refund and promotion migration.** `create or replace` `refund_usage_on_cancel()` and `promote_from_waitlist()` (copy current bodies): both `return null` first when `new.replaced_by is not null`; `refund_usage_on_cancel` also returns null for the `member_cancel_before_cutoff` branch when the session `kind = 'drilling'`. Keep trigger definitions and revokes.
- [ ] **Step 5: Implement `transfer_participation`.** One transaction under the lock: load the participant row and session `for update`; authorize owner or `public.is_session_host`; validate status, target, and time rules above. No capacity trigger exists, so order is free: first insert or revive (`on conflict (session_id, user_id) do update`) the replacement as `confirmed` with `is_premium`, `membership_id`, `paid_at` copied, `checked_in_at = null`, `consented_at = null`, `added_by = null`, `bumped_at = null`, `replaced_by = null`, `paid_by_user_id = <old row's user_id>`; then update the old row to `cancelled` with `cancelled_at = now()` and `replaced_by = <new id>`. Return the new row. Add `JB021`–`JB023` to `lib/errors/rpc.ts` and its header comment. Amend spec section 6 step 1 to say `checked_in_at` is reset to null and `consented_at` is left null (the replacement confirms through the existing `member_confirm_participation` flow, as host-added rows do).
- [ ] **Step 6: Regenerate types, run** `npx supabase test db` and `npm run test:unit`. Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add supabase lib/errors tests/unit docs/superpowers/specs/2026-10-26-drilling-sessions-design.md types/supabase.ts
git commit -m "feat: no refund on drilling cancel and seat replacement rpc"
```

---

### Task 4: `adjust_session_capacity`

**Files:**
- Create: `supabase/migrations/20261028000005_adjust_session_capacity.sql`
- Test: `supabase/tests/044_adjust_session_capacity.test.sql`, `supabase/tests/044a_adjust_session_capacity_isolation.test.sql`
- Modify: `lib/errors/rpc.ts`, `tests/unit/rpc-errors.test.ts`, `docs/superpowers/specs/2026-10-26-drilling-sessions-design.md` (section 7 first bullet), `types/supabase.ts`

**Interfaces:**
- Consumes: Task 1 columns, `public.is_session_host(uuid)`, `courts` table.
- Produces: `public.adjust_session_capacity(p_session_id uuid, p_coach_count int) returns public.sessions`. Errors: `JB024` new capacity below confirmed count; `JB025` a court that would be removed is not `idle`; `JB026` session is not drilling or status is not draft/scheduled/live. Non-host raises `JB007`.

- [ ] **Step 1: Write the failing tests** in `044`: `raise_sets_max_participants_and_court_count_and_creates_courts`; `raise_promotes_premium_first_then_oldest` and `raise_beyond_waitlist_length_leaves_seats_open` (Review Focus 5: 6 seats full, 2 coaches to 12 seats, 3 waitlisted with one premium registered last; premium is promoted first, all 3 confirmed, 3 seats open, no error); `raise_never_bumps_anyone`; `raise_on_live_session_works`; `raise_on_draft_session_works`; `same_count_is_a_noop`; `lower_below_confirmed_gets_JB024`; `lower_removes_highest_numbered_idle_courts`; `lower_with_busy_removed_court_gets_JB025`; `open_play_session_gets_JB026`; `completed_or_cancelled_session_gets_JB026`; `non_host_gets_JB007`; `anon_gets_JB004`. `044a`: `JB006` under `repeatable read`.
- [ ] **Step 2: Run** `npx supabase test db`. Expected: FAIL.
- [ ] **Step 3: Implement.** Lock, load the session `for update`, authorize, validate kind and status. Raising: set the three derived columns, insert missing `courts` rows (next `court_number` values), then loop promoting waitlisters ordered `is_premium desc, registered_at, id` until `confirmed count = max_participants` or no waitlisters remain (reuse the ordering from the merged `promote_from_waitlist`). Lowering: raise `JB024` if `new_max < confirmed count`; delete the highest-numbered `courts` rows beyond the new count, raising `JB025` if any is not `idle` (the existing `guard_court_delete` still guards active matches). Add `JB024`–`JB026` to `lib/errors/rpc.ts`. Amend spec section 7 first bullet: draft, scheduled, and live are allowed.
- [ ] **Step 4: Regenerate types, run** `npx supabase test db` and `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase lib/errors tests/unit docs/superpowers/specs/2026-10-26-drilling-sessions-design.md types/supabase.ts
git commit -m "feat: adjust drilling capacity by coach count"
```

---

### Task 5: Grant surface and race script

**Files:**
- Create: `supabase/tests/045_drilling_grant_surface_negatives.test.sql`, `scripts/test-concurrent-drilling.sh`

**Interfaces:**
- Consumes: Tasks 1–4.

- [ ] **Step 1: Write `045`** following `022_grant_surface_negatives.test.sql`: `has_function_privilege` is false for `anon` and `public` on `transfer_participation` and `adjust_session_capacity`, and false for `anon`, `public`, and `authenticated` on `guard_session_kind_change`; `has_column_privilege` is false for `authenticated` update on `participants.replaced_by` and `participants.paid_by_user_id`; `authenticated` has no direct write path to `sessions.kind` once participants exist (covered by `JB020`).
- [ ] **Step 2: Write `scripts/test-concurrent-drilling.sh`** following the header and port-discovery conventions of `scripts/test-concurrent-create-match.sh`. Three scenarios, each repeated in a loop and asserting invariants after every round: two simultaneous transfers of the same seat to different members (exactly one succeeds, confirmed count unchanged); a transfer racing a registration for the last seat (no overbooking, no lost seat); a capacity raise racing a registration and a cancellation (confirmed count never exceeds `max_participants`, waitlist order intact).
- [ ] **Step 3: Run** `npx supabase test db`, then the script with the local stack up. Expected: PASS and the script exits 0.
- [ ] **Step 4: Commit**

```bash
git add supabase/tests/045_drilling_grant_surface_negatives.test.sql scripts/test-concurrent-drilling.sh
git commit -m "test: drilling grant surface and race script"
```

---

### Task 6: Pricing helper, validation, DAL, create and update payloads

**Files:**
- Create: `lib/sessions/amount-owed.ts`, `tests/unit/amount-owed.test.ts`, `lib/validation/drilling.ts`, `tests/unit/drilling-validation.test.ts`
- Modify: `lib/validation/session.ts:35`, `lib/actions/session-payload.ts`, `tests/unit/session-payload.test.ts`, `lib/actions/sessions.ts` (create at ~`:54`, update at ~`:88`), `lib/dal/sessions.ts:25`, `lib/dal/participants.ts`

**Interfaces:**
- Produces:
  - `amountOwed(session: { price: number; premiumSurchargeIdr: number }, entry: { isPremium: boolean }): number`
  - `payerUserId(entry: { userId: string | null; paidByUserId: string | null }): string | null` (returns `paidByUserId ?? userId`), both in `lib/sessions/amount-owed.ts`
  - `adjustCapacitySchema` and `transferSeatSchema` in `lib/validation/drilling.ts`: `{ sessionId: uuid, coachCount: int >= 1 }` and `{ participantId: uuid, toUserId: uuid }`
  - `sessionSchema` gains `kind: 'open_play' | 'drilling'`, `premiumSurchargeIdr: int >= 0`, `coachCount: int | null`, `seatsPerCoach: int | null`; `.superRefine` requires both coach fields positive when `kind = 'drilling'`, and for drilling derives nothing (the form fills `maxParticipants` and `courtCount`; the refine rejects values that do not equal `coachCount * seatsPerCoach` and `coachCount`)
  - `sessionUpdatePayload(values: SessionInput, kind: SessionKind)`: never writes `kind`, `coach_count`, `seats_per_coach`, `court_count`; omits `max_participants` when `kind === 'drilling'`; always writes `premium_surcharge_idr`
  - DAL session row gains `kind`, `premiumSurchargeIdr`, `coachCount`, `seatsPerCoach`; `RosterEntry` gains `replacedBy: string | null`, `paidByUserId: string | null`

- [ ] **Step 1: Write the failing tests.** `amount-owed.test.ts`: premium entry on drilling owes the surcharge; non-premium owes `price`; premium on open play (surcharge 0) owes 0; `payerUserId` returns `paidByUserId` when set and `userId` otherwise. `drilling-validation.test.ts`: drilling without `coachCount` fails; drilling with `maxParticipants` not equal to `coachCount * seatsPerCoach` fails; open play with coach fields fails; `coachCount: 0` fails in `adjustCapacitySchema`. `session-payload.test.ts`: drilling payload has no `max_participants`, `court_count`, `kind`, `coach_count`; open play payload keeps `max_participants`; both include `premium_surcharge_idr`.
- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, schemas, payload change, DAL fields, and the `createSession` insert (writes `kind`, `coach_count`, `seats_per_coach`, `premium_surcharge_idr`, derived `max_participants` and `court_count`). `updateSession` passes `current.kind` to `sessionUpdatePayload`.
- [ ] **Step 4: Run** `npm run test:unit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib tests/unit
git commit -m "feat: drilling pricing helper, validation, and session payloads"
```

---

### Task 7: Server Actions for capacity and transfer

**Files:**
- Create: `lib/actions/capacity.ts`, `lib/actions/transfers.ts`
- Test: `tests/unit/rpc-errors.test.ts` (extend for `JB020`–`JB026` messages)

**Interfaces:**
- Consumes: Task 6 schemas, Tasks 3–4 RPCs.
- Produces:
  - `adjustCoachCount(sessionId: string, coachCount: number): Promise<ActionResult<null>>` in `lib/actions/capacity.ts`
  - `transferSeat(participantId: string, toUserId: string): Promise<ActionResult<null>>` in `lib/actions/transfers.ts`

- [ ] **Step 1: Extend the failing unit test** in `rpc-errors.test.ts`: every code `JB020`–`JB026` maps to `invalid_state` and `messageForCode` returns a non-empty string for each.
- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL until the `MESSAGES` entries exist.
- [ ] **Step 3: Implement** both actions following `lib/actions/registration.ts`: `"use server"`, zod parse, `getCurrentUser`, `supabase.rpc(...)`, `failFromRpc` on error, `revalidatePath` for `/sessions/${id}/manage` and `/dashboard`. `transferSeat` needs the session id for revalidation: read it from the participant row before the RPC call.
- [ ] **Step 4: Run** `npm run test:unit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/actions tests/unit
git commit -m "feat: server actions for coach count and seat transfer"
```

---

### Task 8: UI

**Files:**
- Create: `components/sessions/coach-count-control.tsx`, `components/sessions/replace-seat-dialog.tsx`
- Modify: `components/sessions/session-form.tsx:22`, `components/sessions/roster-table.tsx:58`, `app/(app)/sessions/[id]/manage/page.tsx`, and the member-side component that renders the cancel button (find it with `grep -rn "cancelRegistration" components app`)

**Interfaces:**
- Consumes: Task 6 helpers and DAL fields, Task 7 actions, `searchMembers` in `lib/actions/participants.ts:197` for the member picker.
- Produces: `CoachCountControl({ sessionId, coachCount, seatsPerCoach, confirmedCount, waitlistCount })` and `ReplaceSeatDialog({ participantId, sessionKind })`.

- [ ] **Step 1: Session form.** Add a kind selector (disabled when editing a session that already has participants; read from the DAL row), and for drilling show coach count, seats per coach (default 6 in the form), and surcharge. `maxParticipants` and `courtCount` show as read-only derived values and are set from the other fields before submit. Strings stay hardcoded, as in the existing form.
- [ ] **Step 2: `CoachCountControl`** is a stepper that calls `adjustCoachCount` through a confirm dialog naming the new capacity and how many waitlisters will be promoted (`min(waitlistCount, newCapacity - confirmedCount)`); decrementing below `confirmedCount` is disabled with an explanation. Render it on the manage page for drilling sessions in any status except completed or cancelled.
- [ ] **Step 3: `ReplaceSeatDialog`** reuses the member picker pattern from `add-participant-dialog.tsx` and calls `transferSeat`. Member side shows "Replace me" on a confirmed seat; for drilling it warns that quota is not refunded if they cancel. The roster shows the same action for hosts on every confirmed seat.
- [ ] **Step 4: Roster.** Add a "paid by X" line on rows with `paidByUserId`, and an amount-owed cell using `amountOwed` and `payerUserId`. Extend the roster query in `lib/dal/participants.ts` to resolve the payer name.
- [ ] **Step 5: Verify in the browser.** Run `npm run dev` with the local stack and walk through: create a drilling session with 1 coach, register 7 members (6 confirmed, 1 waitlisted), raise to 2 coaches on a live session and see the waitlister promoted and court 2 appear, replace a seat and see "paid by" on the new row. Run `npm run lint` and `npm run build`. Expected: all clean.
- [ ] **Step 6: Commit**

```bash
git add components app lib
git commit -m "feat: drilling session form, coach control, and seat replacement ui"
```

---

### Task 9: Docs and follow-ups

**Files:**
- Modify: `docs/superpowers/core-schema-follow-ups.md`, `docs/superpowers/specs/2026-10-26-drilling-sessions-design.md` (status line, resolved open items)

- [ ] **Step 1:** Mark spec status "implemented", and move the three open items in section 13 to resolved: replacement consent is left null and confirmed through `member_confirm_participation`; `guard_court_delete` is unaffected because lowering requires removed courts to be `idle`; guest replacements remain unsupported.
- [ ] **Step 2:** Add follow-ups: close and cancel RPCs that take the advisory lock first (premium Ruling 5, now also relevant to drilling session cancel); a transfer audit view if hosts ask who handed seats to whom.
- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: drilling sessions spec status and follow-ups"
```

---

## Self-review notes

- **Spec coverage:** sections 3 (Task 1), 4 (Task 6 helper, Task 8 roster), 5 (Tasks 2–3), 6 (Task 3), 7 (Task 4, Task 8 control), 8 (Tasks 1, 5), 9 (Tasks 1, 3, 4, 7), 10 (Task 8), 11 (Tasks 1–5), 13 (Tasks 3, 9). Section 12 (future cost) has no work.
- **Spec deviations, both amended in the spec by the owning task:** transfer resets `checked_in_at` (Task 3); capacity RPC also allows `draft` sessions (Task 4).
- **Type consistency:** `transfer_participation(p_participant_id, p_to_user_id)`, `adjust_session_capacity(p_session_id, p_coach_count)`, `transferSeat`, `adjustCoachCount`, `amountOwed`, `payerUserId`, `sessionUpdatePayload(values, kind)` are used with the same names in every task that references them.
