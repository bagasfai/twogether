# Core schema — known follow-ups

Carried out of the implementation of `2026-09-11-core-schema-rls`. Every item below was
found by review, triaged, and deliberately left. Verdicts are from the final whole-branch review.

## Must decide (product call)

- **`profiles.phone` is readable by every signed-up account.** `profiles_select_authenticated`
  is `using (true)` and the participant policy exposes full rosters, so any member can walk
  roster → profile and harvest phone numbers for the whole community. Both clauses are
  spec-faithful; the composition is the problem. Recommended fix: move `phone` to a 1:1
  `profiles_private` table with its own policy (self, admin, and hosts of a session the person
  is registered for). ~1-2 hours now, dramatically cheaper than after any UI exists. Cheap
  stopgap: `revoke select (phone) on public.profiles from authenticated`.

## Should fix soon

- `sessions.created_by` is `ON DELETE RESTRICT`, so `profiles_delete_admin` hits a bare FK
  error for anyone who ever created a session. Decide: `on delete set null`, or block in UI.
- Deleting a court under an `in_progress` match nulls `court_id` and leaves the match live.
- `participants_update_host` is column-unrestricted: a host can rewrite `registered_at`
  (waitlist order) or `added_by` (the over-capacity audit trail).
- Grant-surface test pins cover the positive half only; a regression re-granting EXECUTE to
  PUBLIC would slip past. (The final review found exactly this class of bug in `is_admin`.)
- `ARRIVAL_SPREAD_THRESHOLD_MS=50` in the race script is tuned to one machine. Make it an env
  override BEFORE wiring the script into CI, or it will flake and get disabled.
- A demoted participant keeps their original `registered_at`, so they rejoin the queue ahead
  of people who have waited longer. Queue-fairness question, not a correctness one.

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

## Process note

The "delete the code, the suite still passes" gap was found **five** separate times across this
work (Tasks 7, 8, 9, 10, and the final review). That is systematic, not coincidence. Before
trusting 158/158 as a regression net, consider a mutation-style pass: delete each policy,
guard, and trigger in turn and confirm something actually goes red.

**The pgTAP suite does not prove race-safety.** Every file runs single-connection in one
transaction, so the advisory lock is never contended — the suite cannot distinguish the shipped
code from the same code with every lock line deleted. `scripts/test-concurrent-registration.sh`
is the only artefact proving the property this entire schema exists to guarantee. Keep it alive.
