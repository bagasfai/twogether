# Email Notifications — Design

Date: 2026-11-16
Status: approved in conversation, awaiting written-spec review

## Goal

Members learn about changes to their seat and their sessions by email, without a host
relaying it through WhatsApp. Four groups of email are in scope:

1. **Registration receipts** — confirmed, waitlisted, cancelled.
2. **Waitlist promotion** — moved from the waiting list to confirmed.
3. **Session cancelled or changed** — the host cancels a session, or changes its start
   time, end time, or venue.
4. **Session reminder** — one email the day before, at a fixed hour.

The existing premium bump email moves onto the same mechanism.

### What success looks like

- Every path that changes a participant's status queues the same email: self-service,
  host add, host override, seat transfer, and the automatic waitlist promotion trigger.
- A failed send is retried, and a retry never produces a duplicate email.
- Email never changes the result of the action that caused it, and never delays its
  response.

### Out of scope

- An in-app notification centre.
- Emails for announcements or gallery moderation (both specs deferred these).
- Per-type opt-out. Only reminders can be switched off.
- Batching several edits of one session into one email.
- WhatsApp automation (Future tier).
- Emails to guests. A guest participant row has no account and no address.

## Current state

- Auth emails (`signup`, `recovery`) are sent by the `supabase/functions/send-email`
  Auth hook. This design does not touch it.
- One application email exists: the bump email. `register_for_session` inserts a
  `bump_notifications` row; `lib/email/send-bump-notifications.ts` claims rows by
  setting `sent_at`, sends through Resend, and releases the claim on failure.
  `registerForSession` awaits that drain inline.
- `lib/email/send-partner-inquiry.ts` sends a best-effort email to the admin inbox.
  It stays as it is.
- There is no scheduler in the repo (no Vercel cron, no `pg_cron`, no `pg_net`) and no
  notification preference column.

## Approach

A single outbox table written by the database and drained by Next.js.

- Postgres triggers on `participants` and `sessions` insert rows into `email_outbox`.
  The row is written in the same transaction as the change it reports, so an email is
  queued if and only if the change committed.
- Server actions drain the outbox after each mutation, through `after()`.
- A daily Vercel cron route queues reminders and drains again, which is also the retry
  sweep.

Rejected alternatives:

- **Send directly from server actions.** The action cannot tell who the waitlist
  promotion trigger promoted, and there is no retry. It also puts waitlist-adjacent
  logic in the application layer, against architecture rule 1.
- **`pg_net` to an edge function, `pg_cron` for reminders.** Near-instant and
  independent of Vercel, but adds two extensions, duplicates the templates in Deno,
  and needs more hosted secrets and dashboard setup.

## Data model

One migration. `types/supabase.ts` is regenerated afterwards.

### `email_type` enum

`registration_confirmed`, `registration_waitlisted`, `registration_cancelled`,
`waitlist_promoted`, `bumped`, `session_cancelled`, `session_changed`,
`session_reminder`.

### `email_outbox` table

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | Also the Resend idempotency key. |
| `type` | `email_type` not null | |
| `user_id` | `uuid` not null → `profiles(id)` on delete cascade | Recipient. |
| `session_id` | `uuid` not null → `sessions(id)` on delete cascade | |
| `payload` | `jsonb` not null default `'{}'` | Snapshot taken at queue time (below). |
| `dedupe_key` | `text` unique, nullable | Used by reminders. |
| `created_at` | `timestamptz` not null default `now()` | |
| `claimed_at` | `timestamptz` | Set while a drain holds the row. |
| `sent_at` | `timestamptz` | Set when the row is closed (sent or deliberately skipped). |
| `attempts` | `int` not null default 0 | Incremented on each claim. |
| `last_error` | `text` | Last failure, or the skip reason. |

Partial index on `created_at` where `sent_at is null`.

RLS enabled, no policies, all privileges revoked from `anon` and `authenticated`.
Only the service role and `security definer` functions reach it — the same posture as
`bump_notifications` today.

The recipient's address is not stored. The drain reads it from `auth.users` at send
time, so an address change between queue and send is honoured.

Payload contents:

- `registration_waitlisted`: `{ "waitlist_position": n }`.
- `session_changed`: `{ "old_starts_at", "old_ends_at", "old_location" }`. New values
  are read from the session at send time.
- Other types: empty.

### `profiles.email_reminders`

`boolean not null default true`. Read only by the reminder query. Every other email
type always sends, because it reports a change to the member's own seat.

### `bump_notifications`

Dropped in the same migration. Unsent rows are copied into `email_outbox` as `bumped`
before the drop.

## What queues an email

### Trigger on `participants`

`queue_participant_email()`, `security definer`, fired after insert and after update of
`status`. It queues only when both hold:

- the row has a `user_id` (guest rows are skipped), and
- the session's `status` is `scheduled` or `live`.

| Transition | Email type |
|---|---|
| insert as `confirmed`; `cancelled` → `confirmed` | `registration_confirmed` |
| insert as `waiting_list`; `cancelled` → `waiting_list` | `registration_waitlisted` |
| `waiting_list` → `confirmed` | `waitlist_promoted` |
| `confirmed` → `waiting_list` where `bumped_at` changed | `bumped` |
| `confirmed` → `waiting_list` otherwise (host demotes) | `registration_waitlisted` |
| any → `cancelled` | `registration_cancelled` |

Consequences, all intended:

- The automatic promotion in `promote_from_waitlist` and a host's manual promotion both
  produce `waitlist_promoted`, because both are the same status update.
- A seat transfer sends a cancellation receipt to the member giving up the seat and a
  confirmation to the member receiving it.
- `register_for_session` no longer inserts into `bump_notifications`. The function is
  redefined without that statement; the trigger detects the bump from `bumped_at`.

The waitlist position in the payload is computed inside the trigger, under the session
advisory lock the registration RPCs already hold, using the existing waitlist ordering
(`is_premium desc, registered_at, id`).

### Trigger on `sessions`

`queue_session_email()`, `security definer`, fired after update.

- `status` becomes `cancelled` from `scheduled` or `live`: one `session_cancelled` row
  for each participant with a `user_id` whose status is `confirmed` or `waiting_list`.
- `starts_at`, `ends_at`, or `location` changes while `status` is `scheduled`: one
  `session_changed` row for each such participant, with the old values in the payload.
- Anything else, including every change to a draft session, queues nothing.

Two edits of one session queue two `session_changed` emails. This is accepted.

### Reminders

No trigger. `queue_session_reminders()` (service role only) inserts a
`session_reminder` row for every participant who:

- is `confirmed` and has a `user_id`,
- belongs to a `scheduled` session whose `starts_at` falls on tomorrow's date in
  `Asia/Jakarta`, and
- has `profiles.email_reminders = true`.

`dedupe_key` is `reminder:<session_id>:<user_id>` and the insert uses
`on conflict (dedupe_key) do nothing`, so running the job twice in a day cannot send
two reminders.

## Delivery

### Claiming

`claim_email_outbox(p_limit int)`, service role only. It selects pending rows
`for update skip locked`, sets `claimed_at = now()`, increments `attempts`, and returns
them. A row is pending when:

- `sent_at is null`, and
- `attempts < 3`, and
- `claimed_at is null` or `claimed_at` is more than 10 minutes old.

This differs from the bump implementation, which used `sent_at` as the claim. There, a
process that died between claiming and sending left the row looking sent. A separate
`claimed_at` lets a stale claim be picked up again.

### Drain — `lib/email/drain-outbox.ts`

Replaces `send-bump-notifications.ts`. Keeps its dependency-injection shape
(`{ resend?, supabase? }`) so unit tests inject fakes.

1. Claim a batch.
2. For each row, load the session, the profile's `full_name`, and the address
   (`auth.admin.getUserById`).
3. **Stale guard:** if the session's `ends_at` has passed, close the row
   (`sent_at = now()`, `last_error = 'stale'`) without sending.
4. Render the template for the row's `type`.
5. Send one Resend request per row, with the outbox row id as the idempotency key,
   paced to stay under Resend's request rate limit. The batch API is not used: its
   idempotency key covers a whole request, and a retried batch rarely has the same
   rows, so it cannot guarantee per-email deduplication.
6. On success set `sent_at`. On failure store `last_error` and clear `claimed_at` so
   the next drain retries it.

The drain never throws. It returns `{ sent, failed, skipped }`.

### Call sites

Every server action that can change a participant's status or a session calls the
drain through `after()` from `next/server`, so the action's response does not wait on
Resend:

- `lib/actions/registration.ts` — register, cancel, guest register, guest cancel,
  confirm participation
- `lib/actions/participants.ts` — `setParticipantStatus`, `hostAddParticipant`
- `lib/actions/sessions.ts` — `updateSession`, `cancelSession`
- `lib/actions/transfers.ts` — `transferSeat`
- `lib/actions/capacity.ts` — `adjustCoachCount`

`registerForSession` currently awaits the bump send inline; that moves to `after()`.

`after()` must be confirmed against `node_modules/next/dist/docs/` for the installed
Next.js version before the plan relies on it (see `AGENTS.md`).

### Cron — `app/api/cron/email/route.ts`

- Schedule `0 11 * * *` UTC, which is 18:00 WIB, declared in the Vercel cron config.
- Rejects any request whose `Authorization` header is not `Bearer $CRON_SECRET`.
- Calls `queue_session_reminders()`, then the drain.
- Excluded from the auth protection in `proxy.ts`.

This route is the only retry path when no member or host action happens. A failed send
therefore waits up to a day in the worst case.

## Templates — `lib/email/templates/`

- One React Email component per `email_type`, plus a shared layout (header, footer,
  session summary block). `bump-email.tsx` moves here.
- A registry maps each `email_type` to its subject line and component, so the drain
  has no per-type branching.
- Copy is in Indonesian, matching the existing bump email.
- Each email links to the session page. `session_changed` shows old and new time and
  venue side by side. `registration_waitlisted` shows the waitlist position.
- `session_reminder` carries a line pointing to the profile page to switch reminders
  off.

## Opt-out UI

One switch on the profile page, "Email pengingat sesi", bound to
`profiles.email_reminders`. It is saved through the existing profile server action and
its zod schema. RLS already limits a profile update to its owner.

## Roles and authorization

| Role | Touches |
|---|---|
| Member | Receives email. Toggles their own `email_reminders`. |
| Host / Admin | Causes email through existing actions. No new controls. |
| Service role | The only reader and writer of `email_outbox`. |

No member, host, or admin can read or write the outbox. Hosts keep manual override of
every status the emails report; the emails follow those overrides automatically.

## Failure handling

| Failure | Result |
|---|---|
| Resend rejects or times out | `last_error` stored, claim released, retried on the next drain, up to 3 attempts. |
| Process dies mid-drain | Claim goes stale after 10 minutes and the row is retried. |
| Same row sent twice | Resend idempotency key (outbox id) suppresses the duplicate. |
| Recipient has no address or the account is gone | Counts as a failed attempt; the row stops at 3 attempts. Deleting the profile cascades the row away. |
| Session already ended | Row closed as `stale`, nothing sent. |
| Daily quota exhausted | Sends fail and retry on later drains, up to 3 attempts. |

Email failure never changes an action's result.

## Testing

**pgTAP (`supabase/tests`)**

- Each row of the participants transition table queues exactly one row of the expected
  type.
- Guest rows queue nothing. Draft sessions queue nothing.
- Automatic promotion after a cancellation queues `waitlist_promoted` for the promoted
  member and `registration_cancelled` for the member who left.
- A premium bump queues `bumped`, not `registration_waitlisted`.
- Session cancel and session change queue one row per confirmed or waitlisted member,
  with the old values in the payload for a change.
- `queue_session_reminders()` selects only tomorrow's sessions in `Asia/Jakarta`,
  respects `email_reminders = false`, and is idempotent.
- `email_outbox` is unreachable for `anon` and `authenticated`.
- `claim_email_outbox` skips sent rows, rows at 3 attempts, and freshly claimed rows,
  and reclaims a claim older than 10 minutes.

**Vitest (`tests/unit`)**

- Drain: success closes the row; failure stores the error and releases the claim; the
  stale guard closes without sending; the drain does not throw when Resend or Supabase
  fails.
- Cron route: wrong or missing secret is rejected; a valid call queues then drains.
- Every template in the registry renders with representative props.
- `proxy.ts` leaves the cron route unprotected.

The existing bump notification tests are rewritten against the new drain.

## Operations

- New Vercel environment variable: `CRON_SECRET`.
- The hosted Supabase project needs the new migration. It is already behind on earlier
  migrations; see `docs/superpowers/core-schema-follow-ups.md`.
- Resend's free tier allows 100 emails a day. A cancelled 40-person session on the same
  day as a registration rush can reach it. Overflow is retried, but rows that fail on
  three separate drains are abandoned. Revisit when the community's volume is known.
- Vercel's daily cron on the Hobby plan can fire at any point in the scheduled hour, so
  the reminder arrives between 18:00 and 19:00 WIB.

## Cost for Future-tier features

- **WhatsApp automation** could reuse `email_outbox` if it gains a `channel` column;
  the triggers would not change.
- **Hours-before reminders** need a job more frequent than daily, which means a paid
  Vercel plan or `pg_cron`. The `dedupe_key` scheme already allows a second reminder
  kind.
- **Per-type opt-out** would replace `profiles.email_reminders` with a preferences
  table and add a check to the two queueing triggers.
