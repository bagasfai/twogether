# Premium membership — design

Date: 2026-10-23
Status: design approved, spec awaiting review

Drilling sessions extend this spec: see `2026-10-26-drilling-sessions-design.md`. It supersedes the bump-target rule (decision 2) and the host-added exception (section 5), and it adds a drilling refund rule to section 4.

## 1. Goal

Let an admin sell a paid membership (for example Rp270.000 for 7 open plays within 1 month). A member with an active membership gets registration priority: when a session is full, they take a confirmed spot and the last-registered eligible non-premium participant moves to the waitlist. Price, quota, and duration are adjustable. Payment is manual; the admin records it and activates the membership.

This replaces no existing flow. It extends `register_for_session`, the waitlist ordering, and adds admin and member screens.

Core problem it traces to: manual, race-prone registration and waitlist handling. The bump must be atomic with registration.

## 2. Decisions (from brainstorming)

| # | Decision |
|---|---|
| 1 | Quota is consumed at registration. It is refunded on cancel only if the cancel is at least `refund_cutoff_hours` before `sessions.starts_at`. No-show keeps the quota consumed. |
| 2 | Bump target is the confirmed participant who is non-premium, not checked in, and registered last. Host-added guests can be bumped (changed by the drilling spec). If none exists, the premium member joins the waitlist normally. Premium members never bump each other. |
| 3 | The membership only needs to be active at the moment of registration. Premium status is snapshotted on the participant row, so a later expiry does not change an existing registration. |
| 4 | Memberships stack. Only one is "current" at a time. Quota is spent from the earliest eligible membership. |
| 5 | A plan catalog exists. Each membership copies the plan's values at activation, and the admin may override price, quota, and duration for that one membership. Editing a plan later does not change existing memberships. |
| 6 | Admin grants memberships. Members do not request or buy in the app. Hosts cannot grant. |
| 7 | A bumped member is notified in-app (existing waitlist status) and by email through Resend. |

Defaults accepted: a host cancel or a cancelled session refunds the quota. The host roster shows a premium badge.

## 3. Data model

New tables:

- `membership_plans`: `id`, `name`, `price_idr`, `quota`, `duration_days`, `refund_cutoff_hours` (default 24), `is_active`, timestamps.
- `memberships`: one row per purchase. `id`, `user_id`, `plan_id` (informational, nullable), `price_idr`, `quota_total`, `duration_days`, `refund_cutoff_hours` (all copied from the plan, possibly overridden), `payment_received_at`, `activated_by`, `started_at`, `expires_at`, `cancelled_at`, `created_at`.
- `membership_usages`: quota ledger. `id`, `membership_id`, `participant_id`, `consumed_at`, `refunded_at`, `refund_reason`. Quota used equals the count of rows with `refunded_at is null`. A refund updates the row, so history stays auditable.
- `bump_notifications`: email outbox. `id`, `participant_id`, `created_at`, `sent_at`.

New columns on `participants`: `is_premium boolean not null default false`, `membership_id uuid` (nullable), `bumped_at timestamptz`.

### Current membership and the duration clock

The current membership for a user is the earliest non-cancelled membership that has quota left and is not expired.

- If a member has no live membership when the admin activates one, `started_at = now()` and `expires_at = started_at + duration_days` are set immediately.
- If a live membership exists, the new one is queued with `started_at` null. It starts when it first becomes current, which is the member's next registration after the earlier one is exhausted or expired. A queued membership never loses days while waiting.

## 4. Registration flow

`register_for_session` is replaced by a new version based on the latest definition in `supabase/migrations/` (it was last redefined by `20260914000001_participant_consent.sql`, which also stamps `consented_at`; keep that behavior). It keeps the existing per-session advisory lock and the `read committed` isolation guard. It also takes `select ... for update` on the member's current membership row, so one member registering for two sessions concurrently cannot overspend quota.

1. Find the current membership. If none, run the existing path unchanged.
2. If the session is not full, confirm the member with `is_premium = true` and `membership_id` set, and insert a `membership_usages` row.
3. If the session is full, find the bump target as defined in decision 2.
   - Target found: set the target to `waiting_list` with `bumped_at = clock_timestamp()` and a `registered_at` earlier than every row currently waiting. Insert a `bump_notifications` row in the same transaction. Confirm the premium member and insert the usage row.
   - No target: the premium member joins the waitlist under the normal capacity check, with `is_premium = true` and a usage row.
4. A bump ignores `sessions.waitlist_capacity`. Nobody is dropped because of a bump, so the waitlist may temporarily exceed its cap.

### Waitlist ordering

`promote_from_waitlist` and `waitlist_position_of` order by `is_premium desc, registered_at, id`. The bumped person leads the non-premium queue. A premium member waiting still comes ahead of them.

### Refunds

The rules below are for open play. Drilling sessions never refund a member cancel from `confirmed`; see the drilling spec.

A trigger on the participants status change to `cancelled` refunds the usage row, so a member cancel and a host override behave the same:

- Cancel from `waiting_list`: always refund.
- Cancel from `confirmed`: refund if `now() <= starts_at - refund_cutoff_hours`.
- Cancel by a host (the caller passes `is_session_host`, and is not the participant) or a cancelled session: always refund.
- Premium member still on the waitlist when the session starts: refund. This hooks into the existing start-session path (see `20261021000001_start_session_auto_album.sql`).
- No-show: no refund.

## 5. Authorization

All writes to the new tables go through `security definer` RPCs. Clients get no direct write grants. The grant surface is pinned in tests.

| Table | Read | Write |
|---|---|---|
| `membership_plans` | Authenticated sees active plans. Admin sees all. | Admin only (RLS). |
| `memberships` | Owner and admin. | `admin_grant_membership`, `admin_cancel_membership` only. |
| `membership_usages` | Owner and admin. | Registration RPC and the cancel trigger only. |
| `bump_notifications` | None for clients. | Registration RPC only. |

`admin_grant_membership(user, plan, payment_received_at, optional price/quota/duration overrides)` checks `is_admin()`, copies the plan values onto a new row, and applies the clock rule from section 3.

Hosts keep manual override. `host_add_participant` is unchanged; its rows are non-premium, and they can be bumped like any other non-premium participant. Hosts can still move anyone between confirmed and waitlist by hand.

## 6. Email

After `register_for_session` returns, the Server Action reads pending `bump_notifications` rows and the bumped member's email, sends a React Email template through Resend, and sets `sent_at`. A failed send leaves the row pending for a later retry. Moving to a separate drainer (Edge Function or cron) later needs no schema change.

Reading another member's email requires a server-only Supabase client with the service-role key. `SUPABASE_SERVICE_ROLE_KEY` is already in `.env.local`. Open item: confirm it is also set in the Vercel project environment. If not, add it as the first step of the plan.

Current Resend use is limited to the auth hook in `supabase/functions/send-email`. The bump email is new plumbing in the app, not a reuse of that function.

## 7. UI

- Admin: `/admin/memberships` with plan CRUD, a grant form that reuses the existing member picker, and a membership list showing quota used and expiry.
- Member dashboard: a card showing quota left, expiry, and any queued memberships.
- Host roster: a premium badge and a "bumped" marker.
- Zod schemas for plans and grants are shared by the forms and the Server Actions.

## 8. Errors

New `JB0xx` codes, mapped in `lib/errors/rpc.ts`: grant to a missing user or inactive plan, cancel of an already-cancelled membership, and the isolation guard on the new RPC. A premium member with no quota left is not an error; they register as a normal member.

## 9. Testing

pgTAP tests in `supabase/tests/`:

- Bump target selection skips premium and checked-in participants, and includes host-added guests.
- Premium members never bump each other.
- Waitlist order: premium, then the bumped person, then the rest.
- Quota consume and refund, including the cutoff boundary, host cancel, cancelled session, and a session started while the member is waitlisted.
- Stacking and the lazy clock start.
- Grant-surface negatives, extending test `022`: no direct client writes to the new tables.

Race script `scripts/test-concurrent-registration.sh` is extended with: premium and non-premium callers racing for the last spot, and one member registering for two sessions at once with one quota unit left.

Regenerate `types/supabase.ts` after the migrations.

## 10. Future cost

- Payment gateway (🟢): `memberships` gains a payment status and reference and a pending state before activation. Additive.
- Member self-request (Question 6, option B): a new `membership_requests` table. No change to existing schema.
- Automatic rotation and skill balancing (🟢): unaffected, as they operate on the checked-in pool.

## 11. Out of scope

Payment gateway, member self-purchase, WhatsApp automation, and any automatic match or rotation logic.
