# WhatsApp Share + Operational Dashboard Menu — Design

Status: approved for planning
Date: 2026-09-17
Scope: Important (CLAUDE.md §6) — "Operational dashboard" and "WhatsApp sharing
(copy/share, not automation)"

## Problem

Hosts currently run session admin from two disconnected places: `/dashboard`
(`app/(app)/dashboard/page.tsx`) lists sessions a host owns but is read-only —
no edit, no cancel, no share — and `/sessions/[id]/manage` has full lifecycle
control but only for one session at a time, with no shortcut back to the
others. Recapping a session to the community still means a host manually
retyping roster + logistics into WhatsApp by hand, e.g.:

```
SABTU 19 SEPTEMBER
🕑 09:00 - 11:00
📍SBM Sport Club Citra
LAP. A , B , C
💰45.000

LIST NAMA
1. Selvia ✅
2. Yuda
...

OPEN WL:
1. Ichsan
...
```

This spec adds: a per-session actions menu (edit / cancel / copy WhatsApp
text) usable from both `/dashboard` and the manage page, the schema needed to
drive the WhatsApp text (price, paid status), and the formatter that builds
it.

## Non-goals

- WhatsApp Bot/API automation — sending is still manual copy/paste
  (CLAUDE.md §1, "WhatsApp is not being replaced, only offloaded").
- A payment gateway. `paid_at` is a manual host-toggled timestamp, not a
  transaction record.
- Resizing `courtCount` through the edit form. Courts are already reconciled
  through the manage page's court add/delete controls
  (`guard_court_delete` trigger, `lib/actions/courts.ts`); letting an edit
  silently insert/delete `courts` rows would fight that existing mechanism.
  A host who needs more/fewer courts uses the manage page as today.
- Any change to registration/waitlist capacity semantics. `maxParticipants`
  and `waitlistCapacity` become editable, but every RPC that reads them
  already reads the live `sessions` row at call time — no reconciliation
  needed.
- An admin-wide, cross-host metrics view. "Operational dashboard" here means
  the existing per-host `/dashboard`, extended — not a new platform-level
  admin page.

## Schema

### `sessions.price`

```sql
alter table public.sessions
  add column price integer check (price >= 0);
```

Nullable — a session with no price set omits the 💰 line from the generated
text entirely, rather than showing `💰0` or `💰null`. Integer because Rupiah
has no subunit in casual use (mirrors the `45.000` in the source example,
which is thousands-separated whole rupiah, not cents).

### `participants.paid_at`

```sql
alter table public.participants
  add column paid_at timestamptz;

grant update (paid_at) on public.participants to authenticated;
```

Exact mirror of the existing `checked_in_at` precedent
(`supabase/migrations/20260917000004_participants_update_column_grant.sql`):
a nullable timestamp, not a boolean or enum, toggled by a direct column-level
grant rather than a SECURITY DEFINER RPC. This is safe for the same reason
`checked_in_at` is — `participants_update_host` RLS already restricts the row
to hosts of that session, and marking someone paid isn't a
capacity-racing decision the way registration status is (CLAUDE.md §3.1
only requires the RPC/trigger treatment for registration and waitlist
promotion). No new RLS policy needed.

## Server Actions

### `lib/actions/sessions.ts`

`updateSession(id, input: SessionInput)` — direct `.update()` on `sessions`,
same shape as `createSession` but without the insert-courts step. Relies on
the existing `sessions_update_host` RLS policy (`using (is_session_host(id))
with check (is_session_host(id))`), which is already column-unrestricted, so
no new RLS or grant is needed here (unlike `participants`, which was locked
down in `20260917000004`). Revalidates `/dashboard` and
`/sessions/${id}/manage`.

`cancelSession(id)` — sets `status: 'cancelled'`. Deliberately its own
action, not a value in the edit form's status `<select>` (which only offers
`draft`/`scheduled`, unchanged) — a lifecycle-ending action stays a distinct,
confirmable menu item rather than a dropdown option a host could pick by
accident while editing the title. Revalidates the same two paths plus
`/sessions` (a cancelled session should disappear from the public list —
`sessions_select_public_or_host`'s `status in ('scheduled','live',
'completed')` already excludes `cancelled`, this just refreshes the cache).

### `lib/actions/participants.ts`

`setPaid(participantId, sessionId, paid: boolean)` — byte-for-byte mirrors
`setCheckedIn`: direct `.update({ paid_at: paid ? now() : null })` scoped by
`id` + `session_id`, same "not a capacity race" justification in a comment.
Revalidates `/sessions/${sessionId}/manage`.

### `lib/actions/sessions.ts` (new)

`getSessionShareText(sessionId): Promise<ActionResult<{ text: string }>>` —
fetches the session (via `getHostSession`, reusing its existing host-only
scoping) and its roster (via `listRoster`), then calls
`buildWhatsAppShareText`. Called on-demand by the menu's "Copy WhatsApp text"
item, not prefetched — the dashboard's session cards currently render from
`listMyHostedSessions()` alone (counts, no roster), and pulling every
session's full roster just to populate a dropdown that's usually never
opened would be wasted reads at scale.

## Validation

`sessionSchema` (`lib/validation/session.ts`) gains:

```ts
price: z.coerce.number().int().min(0, "Cannot be negative").max(10_000_000, "That can't be right").or(z.literal("")).or(z.null())
  .transform((value) => (value === "" || value === null ? null : value)),
```

placed alongside the other optional numeric-ish fields, following the same
`optionalText`/`optionalUrl` idempotent-on-null pattern already in the file.
`courtCount` stays in the schema as today (used by `createSession`) but the
edit form does not render a field for it — see Non-goals.

## WhatsApp text formatter

New pure module, `lib/format/whatsapp-share.ts`:

```ts
export function buildWhatsAppShareText(
  session: { title: string; startsAt: string; endsAt: string; location: string; courtCount: number; price: number | null },
  roster: { fullName: string; status: ParticipantStatus; paidAt: string | null }[],
): string
```

- **Date/time line**: `Intl.DateTimeFormat('id-ID', { weekday: 'long', day:
  'numeric', month: 'long' }).format(new Date(startsAt))`, uppercased, e.g.
  `SABTU 19 SEPTEMBER`. Time range from `startsAt`/`endsAt` formatted as
  `HH:mm - HH:mm` in the session's wall-clock rendering (same
  `toLocaleString`-adjacent approach the manage page already uses for
  display — no new timezone-conversion logic).
- **Location line**: `📍${location}`.
- **Courts line**: `LAP. ${letters.join(' , ')}` where `letters` is
  `A, B, C, …` generated from `courtCount` (`String.fromCharCode(65 + i)`),
  **not** a query against the `courts` table — the message communicates
  session capacity, not live court status, and this keeps the formatter
  independent of `lib/dal/courts.ts`.
- **Price line**: omitted entirely when `price` is `null`; otherwise
  `💰${new Intl.NumberFormat('id-ID').format(price)}`.
- **Roster**: `roster` filtered to `status === 'confirmed'` → numbered under
  `LIST NAMA`, each line suffixed ` ✅` when `paidAt` is non-null. Filtered
  to `status === 'waiting_list'` → numbered under `OPEN WL:`, no checkmark
  (payment tracking only makes sense once confirmed). Both lists preserve
  the order `listRoster` already returns them in (`registered_at` ascending),
  which is also waitlist order.
- Empty waitlist: `OPEN WL:` section is omitted entirely (not printed with
  zero entries) — matches how a host would actually paste this.

Pure function, no Supabase/Next imports — same isolation rationale as
`lib/realtime/debounce.ts` in the live-dashboard spec: it's the one piece of
this feature worth unit-testing directly.

## UI

### `components/sessions/session-actions-menu.tsx`

New client component, a shadcn `DropdownMenu` taking `session: HostedSession`.
Items:

- **Copy WhatsApp text** — calls `getSessionShareText(session.id)`,
  writes the returned string to the clipboard (`navigator.clipboard.writeText`),
  toasts success/failure. No dialog — copy is instant.
- **Edit** — opens `SessionForm` inside a `Dialog` (same composition pattern
  as `add-guest-dialog.tsx`/`add-participant-dialog.tsx`), pre-filled from
  the session, calling `updateSession` instead of `createSession`.
- **Cancel session** — opens an `AlertDialog` ("This cancels the session for
  everyone registered. This can't be undone.") before calling
  `cancelSession`.
- **Manage** — plain link to `/sessions/${session.id}/manage`. Only shown
  where the menu itself isn't already on the manage page (i.e. shown on
  `/dashboard`, omitted in the manage-page header instance).

### `SessionForm` (`components/sessions/session-form.tsx`)

Extended with optional props `sessionId?: string` and `initialValues?:
SessionInput` (price included, courtCount excluded from the rendered fields
in edit mode). When `sessionId` is present: default values come from
`initialValues` instead of the hardcoded creation defaults, submit calls
`updateSession(sessionId, values)` instead of `createSession(values)`, button
label "Save changes" instead of "Create session", and on success the dialog
closes (`router.refresh()`) instead of navigating to `/manage`.

### `roster-table.tsx`

Gains a paid-toggle control next to the existing checked-in toggle
(`entry.checkedInAt`/`setCheckedIn` pattern at `roster-table.tsx:65`), wired
to the new `setPaid` action. Same visual treatment as the check-in toggle
(button that flips state, no confirmation — reversible, low-stakes, matches
CLAUDE.md §3.3's "hosts retain manual override" for anything this
low-consequence).

### Wiring

- `app/(app)/dashboard/page.tsx`: each "Sessions you host" `Card` gets a
  `<SessionActionsMenu session={session} />` in its header, next to the
  existing title link.
- `app/(app)/sessions/[id]/manage/page.tsx`: header gets the same menu
  (without the redundant "Manage" item), next to the title.

## Error handling

Every new Server Action follows the existing `ActionResult`/`fail`/`ok`
pattern (`lib/actions/result.ts`) already used throughout `sessions.ts` and
`participants.ts` — no new error-handling shape. `getSessionShareText`
returns `fail("not_authorized")` when `getHostSession` returns `null` (caller
isn't a host of that session), surfaced as a toast rather than a thrown
error, consistent with how the rest of the menu's actions report failure.

Clipboard write failure (`navigator.clipboard` unavailable/denied) is caught
and toasted — no fallback textarea-select-and-copy shim, since every browser
this app targets (per CLAUDE.md's Vercel/modern-browser assumption) supports
the Clipboard API over HTTPS.

## Testing

- Unit: `lib/format/whatsapp-share.ts` — date/weekday formatting in Indonesian,
  price formatting and omission when `null`, checkmark placement for paid
  vs. unpaid confirmed participants, waitlist section omission when empty,
  court-letter generation for 1/3/20 courts. Written test-first per
  `superpowers:test-driven-development`.
- No new SQL invariant tests needed — `price` and `paid_at` are plain
  nullable columns with no trigger logic, and the grant migration is the
  same shape as `20260917000004`, which already has coverage precedent in
  `supabase/tests/012_invariant_fixes.test.sql` for the column-restriction
  pattern.
- Manual verification in-browser (house rule for UI changes, no e2e harness
  exists yet — same gap already logged in
  `docs/superpowers/core-schema-follow-ups.md`): edit a session and confirm
  changes persist and courts are untouched; cancel a session and confirm it
  drops off `/sessions`; toggle paid on a participant and confirm the
  generated text reflects it; copy text for a session with an empty
  waitlist and confirm `OPEN WL:` is omitted.

## Files touched

- `supabase/migrations/20260917000005_session_price.sql` — new
- `supabase/migrations/20260917000006_participant_paid_at.sql` — new
- `types/supabase.ts` — regenerate after both migrations
- `lib/validation/session.ts` — add `price` field
- `lib/actions/sessions.ts` — add `updateSession`, `cancelSession`,
  `getSessionShareText`
- `lib/actions/participants.ts` — add `setPaid`
- `lib/format/whatsapp-share.ts` — new, `buildWhatsAppShareText`
- `tests/unit/whatsapp-share.test.ts` — new
- `components/sessions/session-actions-menu.tsx` — new
- `components/sessions/session-form.tsx` — extend for edit mode
- `components/sessions/roster-table.tsx` — add paid toggle
- `app/(app)/dashboard/page.tsx` — wire menu into hosted-session cards
- `app/(app)/sessions/[id]/manage/page.tsx` — wire menu into header

## Future cost callouts (🟢 Future territory)

- `paid_at` is deliberately a manual timestamp, not a payment record. If a
  payment gateway integration ever lands (🟢 Future, explicitly out of MVP
  per CLAUDE.md §6), it supersedes or derives this field from real
  transactions — it does not extend `paid_at`'s meaning.
- Court letters in the share text are generated from `courtCount`, not the
  `courts` table. If a future feature lets courts have real names/labels
  (not just sequential numbers), the formatter's letter-generation would
  need to switch to reading `courts` instead — flagged here so it isn't a
  surprise later, but not built now since no such feature exists in any
  tier of CLAUDE.md §6 today.
