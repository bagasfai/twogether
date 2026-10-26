# Drilling sessions — design

Date: 2026-10-26
Status: design approved in brainstorming, spec awaiting review

## 1. Goal

Add a second kind of session, **drilling**, next to the existing open play. A coach runs a drilling session for a small group. Differences from open play:

- Capacity comes from coaches: one coach per 6 members. A host adds a coach, and a court, when more than 6 people want in.
- A premium member can pay for a drilling seat with membership quota (1 unit, same as open play) but still owes an extra fee, because drilling costs more.
- A member who cancels a confirmed drilling seat does not get the quota back. They can hand the seat to another person instead.
- Capacity can be raised while the session is live.

Core problems it traces to: manual, race-prone registration and waitlist handling (capacity changes and seat transfers must be atomic and trigger-consistent), and manual court/session tracking during live sessions.

This spec builds on `2026-10-23-premium-membership-design.md`. That spec keeps the membership, quota ledger, and bump rules. This spec changes the pieces below, and the premium spec points here for them.

## 2. Decisions (from brainstorming)

| # | Decision |
|---|---|
| 1 | `sessions.kind` is `open_play` or `drilling`, default `open_play`. Kind cannot change once any participant row exists for the session. |
| 2 | Drilling costs 1 quota unit, the same as open play. No per-session quota cost, no `units` column on `membership_usages`. |
| 3 | A premium member on a drilling session owes `premium_surcharge_idr` on top of the quota. Open play has no surcharge. Non-premium members and guests owe `price`. Payment stays manual. |
| 4 | Quota is not refunded when a member cancels a confirmed drilling seat. The cutoff rule from the premium spec applies to open play only. |
| 5 | Refunds that stay for drilling: cancel from `waiting_list`, host cancel, session cancelled, premium member still waitlisted when the session starts. |
| 6 | A member can replace themself by assigning another member to their seat. A host can do the same for any seat. No approval from the replacement. |
| 7 | The original member keeps the payment. The replacement owes nothing and spends no quota. |
| 8 | Premium bumping can target any confirmed non-premium participant who is not checked in, including host-added guests. This applies to both open play and drilling, so it also changes the premium spec. |
| 9 | Drilling capacity is `coach_count * seats_per_coach`. Hosts change it through an RPC that also works on a live session, and it promotes waitlisters when capacity rises. |

## 3. Data model

New enum `session_kind`: `open_play`, `drilling`.

New columns on `sessions`:

- `kind session_kind not null default 'open_play'`
- `premium_surcharge_idr int not null default 0 check (premium_surcharge_idr >= 0)`
- `coach_count int` and `seats_per_coach int`, both nullable. A check requires both set and positive when `kind = 'drilling'`, and both null when `kind = 'open_play'`. `seats_per_coach` defaults to 6 in the form, not in the column.

For a drilling session, `max_participants` and `court_count` are derived: `max_participants = coach_count * seats_per_coach` and `court_count = coach_count`. A check constraint enforces both for drilling rows, so the columns stay the single source the registration RPCs already read. `register_for_session` and `promote_from_waitlist` do not change to learn about coaches.

Refund behavior is derived from `kind`, not stored. There is no `quota_refundable` column. If a future session kind needs a different rule, add the column then.

New columns on `participants`:

- `replaced_by uuid references participants (id)`, set on the old row when the seat was handed over.
- `paid_by_user_id uuid references profiles (id)`, set on the replacement row to the original member. Null when the original was a guest.

A trigger blocks changing `sessions.kind` when any participant row exists. Without that, a session registered as open play could switch to drilling after members were promised a refund.

## 4. Pricing and the roster

- Amount owed per participant: premium and confirmed with a usage row → `premium_surcharge_idr`; everyone else → `price`.
- On a replacement row, the amount belongs to the original member. The host roster shows "paid by X" on the replacement and keeps `paid_at` copied from the original row.
- `participants.paid_at` stays the only payment marker. No payment status table is added.

## 5. Registration, bumping, and refunds

### Bump target

This supersedes decision 2 of the premium spec and the host-added exception in its section 5. In both kinds, the bump target is the confirmed participant who is non-premium, not checked in, and registered last. Host-added guests are included. Premium members never bump each other.

A host who adds a guest to a full session can now lose that guest to a premium sign-up. The host can still move anyone between confirmed and waitlist by hand, so manual override stays.

A bumped guest has no account, so no `bump_notifications` row is inserted for them. The host roster shows the bump through the existing waitlist status and the "bumped" marker. A bumped member still gets the in-app status change and the email.

### Refund trigger

The cancel-to-`cancelled` trigger from the premium spec decides refunds like this:

| Cancel case | Open play | Drilling |
|---|---|---|
| Member cancels from `confirmed` | Refund if at or before `starts_at - refund_cutoff_hours` | Never |
| Cancel from `waiting_list` | Refund | Refund |
| Host cancel or session cancelled | Refund | Refund |
| Premium member waitlisted when session starts | Refund | Refund |
| No-show | No refund | No refund |

A row with `replaced_by` set skips the refund and the waitlist promotion entirely (section 6).

## 6. Seat replacement

RPC `transfer_participation(participant_id, to_user_id)`, `security definer`.

Who can call it: the member who owns the seat, or a host of the session. Guests cannot call it because they have no account. A host can transfer a guest's seat.

Rules:

- The session must be `scheduled` or `live` and `now() < starts_at`. Hosts may transfer after the start (manual override).
- The seat must be `confirmed`. A waitlisted participant just cancels.
- The replacement must be a registered member with no row on this session in `confirmed` or `waiting_list`.

Steps, in one transaction, under the same per-session advisory lock and `read committed` guard as `register_for_session`:

1. Insert the replacement as `confirmed`. Copy `is_premium`, `membership_id`, and `paid_at` from the old row, and set `paid_by_user_id` to the old row's user. `checked_in_at` is reset to null, because the replacement has not arrived. `consented_at` is left null; the replacement confirms through the existing `member_confirm_participation` flow, as host-added rows do. If the replacement already has a cancelled row on the session, that row is revived and every per-row field is reset. The seat keeps its bump protection because the original member paid for it. The replacement gets no `membership_usages` row.
2. Update the old row to `status = 'cancelled'` with `replaced_by` set to the new row, in the same statement. Check how `participants` invariants and capacity are enforced (`20260911000012_invariant_fixes.sql`); if a capacity check fires on the insert, cancel first and insert second.
3. The promotion trigger and the refund trigger both return early when `new.replaced_by is not null`. Nobody on the waitlist takes the seat, and the original usage row stays consumed.

If the replacement later cancels their seat, the drilling rule applies: no refund, and there is no usage row on their row anyway.

## 7. Capacity and coaches

RPC `adjust_session_capacity(session_id, coach_count)`, `security definer`, host or admin only (checked against `session_hosts` and `is_admin()`).

- Takes the per-session advisory lock and the `read committed` guard.
- Valid for drilling sessions in `scheduled` or `live` status. Open play capacity is still edited through `updateSession`.
- Sets `coach_count`, `max_participants = coach_count * seats_per_coach`, and `court_count = coach_count` together.
- Raising: inserts the missing `courts` rows (next `court_number` values) so `court_count` and the courts table stay in step. Then promotes waitlisters oldest first, premium first, until the session is full or the waitlist is empty. It reuses the one-seat promotion step from `promote_from_waitlist` in a loop.
- Lowering: rejected if the new capacity is below the number of `confirmed` rows. The host removes people first. Rejected too if a court that would be removed is not `idle`. Nobody is dropped by automation.

`updateSession` is unchanged for drilling except it must not write `max_participants`, `court_count`, `coach_count`, or `kind`; it already refuses to write `court_count` (`lib/actions/session-payload.ts`). The edit form shows coach count as a separate control that calls the RPC, and that control stays enabled on a live session.

Raising capacity never bumps anyone.

## 8. Authorization

| Object | Read | Write |
|---|---|---|
| New `sessions` columns | Same as `sessions` today | Host or admin. `kind` locked once participants exist. Capacity fields only through `adjust_session_capacity`. |
| `participants.replaced_by`, `paid_by_user_id` | Same as `participants` | `transfer_participation` only. Revoke direct update on both columns, as `20260917000004_participants_update_column_grant.sql` does for other columns. |

Extend the grant-surface test (test `022` in the premium spec) to cover both columns and both new RPCs.

## 9. Errors

New `JB0xx` codes in `lib/errors/rpc.ts`:

- transfer target already on the session
- transfer on a non-confirmed seat
- transfer after start by a non-host
- capacity lowered below confirmed count
- capacity lowered with a non-idle court to remove
- `kind` change with existing participants
- wrong `kind` for `adjust_session_capacity`

## 10. UI

- Session form: a kind selector (locked once participants exist). For drilling it shows coach count, seats per coach, and the premium surcharge. `max_participants` and `court_count` show as derived values.
- Manage page: a coach count stepper that calls `adjust_session_capacity`, with a confirmation naming the new capacity and number of waitlisters who will be promoted.
- Member session view: a "Replace me" action on a confirmed seat that opens the member picker. On drilling it warns that quota is not refunded on cancel.
- Host roster: "paid by X" on replacement rows, the amount owed per row, and a premium badge. Hosts get the same "Replace" action on any seat.

## 11. Testing

pgTAP tests in `supabase/tests/`:

- Bump target includes host-added guests, in both kinds; skips premium and checked-in; premium never bumps premium.
- No `bump_notifications` row for a bumped guest.
- Refund table in section 5, including the open-play cutoff boundary and no refund on a drilling cancel.
- Transfer: replacement gets the seat; the waitlist does not promote; the old usage stays consumed; replacement row has `is_premium` and no usage row; transfer rejected for a participant already on the session; transfer rejected on a waitlisted seat.
- Capacity: raising promotes in premium-then-oldest order and creates courts; lowering below the confirmed count fails; lowering over a busy court fails; works on a `live` session.
- `kind` change blocked once a participant exists.
- Grant-surface negatives for the new columns and RPCs.

Race scripts in `scripts/`:

- Two simultaneous transfers of the same seat to different members; one wins.
- A transfer racing a registration for the last seat.
- A capacity raise racing a registration and a cancellation.

Regenerate `types/supabase.ts` after the migrations.

## 12. Future cost

- Automatic match generation and rotation (🟢): drilling sessions probably want their own flow (coach-led groups instead of rotating matches). `kind` gives those features a place to branch. No schema change needed now.
- Payment gateway (🟢): `paid_by_user_id` already separates who pays from who plays, so a payment record can attach to the payer.
- More session kinds: `session_kind` is an enum, so adding one is a migration. Refund behavior would move into a column at that point.

## 13. Open items

- Confirm whether the replacement must record consent (`consented_at`, from `20260914000001_participant_consent.sql`). They are assigned without approval, so decide whether to stamp consent on the transfer row or prompt them on first view.
- Check `guard_court_delete` against the court removal path in the lowering case.
- Decide whether a host can assign a guest as the replacement. This spec allows members only.

## 14. Out of scope

Payment gateway, per-coach pricing, coach accounts or a coach role, automatic coach assignment, and any automatic match or rotation logic.
