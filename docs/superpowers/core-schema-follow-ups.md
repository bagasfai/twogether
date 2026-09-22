# Core schema — known follow-ups

Carried out of the implementation of `2026-09-11-core-schema-rls`. Every item below was
found by review, triaged, and deliberately left. Verdicts are from the final whole-branch review.

## Must decide (product call)

- **`profiles.phone` is readable by every signed-up account.** ~~`profiles_select_authenticated`
  is `using (true)` and the participant policy exposes full rosters, so any member can walk
  roster → profile and harvest phone numbers for the whole community.~~ **Resolved** by the
  `profiles_private` table (migration `20260912000014_profiles_private.sql`): phone moved off
  `profiles` into its own table with its own policy (self, admin, hosts of a session the person
  is a non-cancelled participant in).

- **`host_add_participant` composed with the `profiles_private` phone policy is broader than
  advertised.** ~~`host_add_participant` lets a host insert an arbitrary `p_user_id` into a
  session they host — a `draft` session works, so no other participant needs to see it — with
  no consent check from the member being added. Once that participant row exists,
  `profiles_private_select_self_admin_or_host` (status <> 'cancelled') grants that host the
  member's phone.~~ **Resolved** by migration `20260914000001_participant_consent.sql`: a new
  `participants.consented_at` column distinguishes "a row exists" from "the member knows about
  it". `register_for_session` stamps it immediately (self-registration is consent by
  construction); `host_add_participant` leaves it null. `profiles_private_select_self_admin_or_host`
  now additionally requires `consented_at is not null` for the host branch. The member sees a
  "confirm your spot" / "decline" prompt on their dashboard
  (`components/sessions/confirm-participation-banner.tsx`, wired to the new
  `member_confirm_participation` RPC and the existing `cancel_registration` RPC) until they act.
  The member picker shipped alongside this fix, not before it —
  `components/sessions/add-participant-dialog.tsx`, wired to `lib/actions/participants.ts`'s
  `hostAddParticipant` and `searchMembers`.

## Should fix soon

- `sessions.created_by` is `ON DELETE RESTRICT`, so `profiles_delete_admin` hits a bare FK
  error for anyone who ever created a session. Decide: `on delete set null`, or block in UI.
- ~~Deleting a court under an `in_progress` match nulls `court_id` and leaves the match
  live.~~ **Already resolved** (this doc was stale) by `guard_court_delete`
  (`20260913000001_match_scheduling.sql`): a `before delete` trigger raises `JB010` if the
  court has a `scheduled`/`in_progress` match, mapped through `lib/errors/rpc.ts` and
  `lib/actions/courts.ts`.
- ~~`participants_update_host` is column-unrestricted: a host can rewrite `registered_at`
  (waitlist order) or `added_by` (the over-capacity audit trail).~~ **Resolved** by migration
  `20260917000004_participants_update_column_grant.sql`: `authenticated` now only holds
  `GRANT UPDATE (checked_in_at)` on `participants` (table-level UPDATE revoked). All status
  transitions already ran through SECURITY DEFINER RPCs (`host_set_participant_status`,
  `host_add_participant`, `register_for_session`, `add_guest_participant`,
  `cancel_registration`, `member_confirm_participation`), which are unaffected since they run
  with the function owner's privileges — a plain client UPDATE can now only ever touch
  `checked_in_at`. `supabase/tests/012_invariant_fixes.test.sql`'s F1a was updated to assert
  the block (`throws_ok` on a direct status UPDATE, sqlstate `42501`) and to re-run its
  trigger-defense-in-depth scenario as `postgres` instead of `authenticated`, since that
  vector is now closed for the host role specifically; two other test fixtures
  (`010_registration.test.sql`, `010a_registration_isolation.test.sql`) that used a direct
  status-changing UPDATE purely to exercise trigger behavior were switched to run under
  `postgres` for the same reason.
- Grant-surface test pins cover the positive half only; a regression re-granting EXECUTE to
  PUBLIC would slip past. (The final review found exactly this class of bug in `is_admin`.)
- `ARRIVAL_SPREAD_THRESHOLD_MS=50` in the race script is tuned to one machine. Make it an env
  override BEFORE wiring the script into CI, or it will flake and get disabled.
- ~~A demoted participant keeps their original `registered_at`, so they rejoin the queue ahead
  of people who have waited longer.~~ **Resolved** by migration
  `20260917000003_demotion_queue_fairness.sql`: `host_set_participant_status` now re-stamps
  `registered_at` to `now()` whenever the transition lands on `waiting_list` from any other
  status, so a demoted participant re-enters at the back of the real waitlist instead of
  keeping their original registration time. Covered by
  `supabase/tests/018_demotion_queue_fairness.test.sql`, which proves both the stamp itself
  and that it actually changes promotion order (a participant who was waiting before the
  demotion gets promoted first on the next freed seat).

## Fine to leave

- `JB003` is overloaded (already-registered / nothing-to-cancel / not-found) and `JB004`
  conflates 401 with 403. Split them when the first Server Actions map errors to form messages.
- `guard_match_player`'s message says "not checked in" when the real cause is a hidden row.
- Galleries and photos are anon-readable via `using (true)`, matching the public-gallery intent.
- `JB006` also rejects SERIALIZABLE, which would in fact be safe. Fails closed; nothing takes it.
- Migration 0011 has no `create publication` fallback, so it would fail on a non-Supabase
  Postgres. Unreachable on every path this project uses, and it fails loudly rather than silently.
- `waitlist_position_of` and `session_lock_key` appear in generated types as callable RPCs
  despite being revoked from both roles — calling one returns 42501.
- `010:518` ("cancel_registration clears checked_in_at") now passes even if the RPC's manual
  clearing were deleted, because the 0012 trigger does it. Invariant still proven by 012 F1a.

## From Task 10 (host session creation and roster management)

- Resend and React Email are unconfigured, so email confirmation works locally through
  Inbucket but not in any deployed environment. Must be wired before the first real user.
- Google OAuth ships disabled and has never been exercised end to end.
- No password reset flow exists.
- ~~No admin UI: roles are changed by seed or by a service-role script.~~ **Resolved**:
  `/admin` (`app/(app)/admin/page.tsx`, gated by the new `requireAdmin`) lists every member
  and lets an admin change roles via `lib/actions/admin.ts`'s `setUserRole`, enforced by the
  existing `profiles_update_self_or_admin` policy and `guard_profile_role_change` trigger — no
  schema change needed. An admin cannot change their own role (avoids a self-lockout with no
  UI path back); there is still no protection against demoting the *last* admin via someone
  else's account, which was judged out of scope for a first pass.
- ~~`host_add_participant` has no UI; it needs a member picker.~~ **Resolved** together with
  the consent fix above — see that entry.
- No E2E coverage — signup, login, registration and override flows are verified by hand only.

## Process note

The "delete the code, the suite still passes" gap was found **five** separate times across this
work (Tasks 7, 8, 9, 10, and the final review). That is systematic, not coincidence. Before
trusting 158/158 as a regression net, consider a mutation-style pass: delete each policy,
guard, and trigger in turn and confirm something actually goes red.

**The pgTAP suite does not prove race-safety.** Every file runs single-connection in one
transaction, so the advisory lock is never contended — the suite cannot distinguish the shipped
code from the same code with every lock line deleted. `scripts/test-concurrent-registration.sh`
is the only artefact proving the property this entire schema exists to guarantee. Keep it alive.

## Deploy checklist

- `supabase/migrations/20260910050037_initial_schema.sql` was removed on this branch, and its
  timestamp precedes every surviving migration. Harmless for a fresh local reset. But if any
  remote/hosted Supabase project ever recorded that migration as applied, `supabase db push`
  will report a missing local migration (the remote's migration history table references a
  filename that no longer exists locally) — reconcile with `supabase migration repair` (or
  equivalent) before pushing to any such project, rather than assuming a clean push.
