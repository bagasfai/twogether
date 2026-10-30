# Player Rotation — Design

Status: approved 2026-09-13. Follows match scheduling (20260913000001).

## Problem

Core-scope gap: when a court frees up, the host has no ordered view of
who's waited longest to decide who plays next. `matches.queue_position`
has sat unused through two prior tasks pending this decision.

## Scope boundary

Rotation here means **fair ordering of checked-in players**, not match
generation. The host still manually selects both teams for every match
via the existing `create_match` flow (CLAUDE.md §6: automatic match
generation and skill balancing are 🟢 Future). This feature only
changes what order players are *presented* in, and adds wait
information to help the host choose.

## `matches.queue_position`

Left untouched. Per `docs/superpowers/specs/2026-09-11-core-schema-rls-design.md:400`,
it was scaffolded for 🟢 Future automatic match generation, not for
this feature. Rotation ordering here is computed at read time from
participant check-in and match-completion timestamps; nothing is
persisted per-match, so the column has no role in this design. It
remains reserved for the Future-tier feature it was built for.

## Queue model

Session-wide, not per-court. One ordered waiting list; any court that
frees up draws from the same list. Per-court queues would fragment
fairness — a player on a busy court's queue would wait longer than one
on a quiet court for no reason connected to how long they've actually
waited.

## Ordering rule

For each checked-in, non-busy participant:

```
availableSince = lastPlayedAt ?? checkedInAt
```

Sort ascending by `availableSince`. A player who has never played is
ranked by when they checked in; a player who has played is ranked by
when their last match completed. One rule, no separate tiers — it
falls out naturally that players who've waited longest (whether
"never played, checked in early" or "played once, finished long ago")
surface first.

"Busy" = currently in a `scheduled` or `in_progress` match (same
definition `MatchPanel` already uses for `busyPlayerIds`) — excluded
from the queue entirely, not just ranked last.

"Last played" = `completed_at` of the participant's most recent
`completed`-status match (via `match_players`). Cancelled matches
don't count as having played.

## Data layer

No new tables, columns, migrations, RPCs, or RLS policies.

`lib/dal/rotation.ts`:

```ts
export type RotationEntry = {
  participantId: string;
  fullName: string | null;
  avatarUrl: string | null;
  checkedInAt: string;
  lastPlayedAt: string | null;
};

export async function getRotationQueue(sessionId: string): Promise<RotationEntry[]>
```

Implementation follows the existing app-layer-join pattern already
used by `listRoster`'s `waitlistPosition` helper (no RPC needed — this
is a read/display concern, not a concurrency-sensitive write per
CLAUDE.md §3 rule 1, which only applies to registration/waitlist
*decisions*):

1. Query checked-in, `confirmed` participants for the session (same
   shape as `listRoster`, filtered).
2. Query `match_players` joined to `matches!inner(status, completed_at,
   session_id)` for `status = 'completed'` in this session; reduce in
   TS to max `completed_at` per `participant_id`.
3. Query `match_players` joined to `matches!inner(status, session_id)`
   for `status in ('scheduled','in_progress')`; collect busy
   `participant_id`s.
4. Filter step 1 by step 3 (exclude busy), attach step 2's
   `lastPlayedAt`, sort via the pure function below.

Existing RLS (`matches_select`, `match_players_select`,
`participants` policies) already covers all three reads; the page is
already host-gated via `requireHost`.

## Pure ordering function

`lib/rotation/queue.ts`:

```ts
export type RotationCandidate = {
  participantId: string;
  checkedInAt: string;
  lastPlayedAt: string | null;
};

export function sortRotationQueue<T extends RotationCandidate>(candidates: T[]): T[]
```

Pure, no I/O — computes `availableSince` per candidate and sorts
ascending, tie-broken by `participantId` for determinism. Unit tested
in `tests/unit/sort-rotation-queue.test.ts` (flat dir, matches repo
convention — not colocated).

`getRotationQueue` calls this after assembling candidates.

## UI

`MatchPanel`:

- Replace the `roster: RosterPlayer[]` prop with `rotationQueue:
  RotationEntry[]` (already ordered, already excludes busy players —
  the panel drops its own `assignablePlayers`/`busyPlayerIds`
  derivation, which becomes redundant).
- Team-selection checkboxes iterate `rotationQueue` in order, each row
  showing rank and a wait label: "Never played" (no `lastPlayedAt`) or
  "Last played Xm ago", using `checkedInAt` for the never-played case
  ("Waiting Xm").
- Host still checks any player into either team, in any order — this
  free choice is the CLAUDE.md §3 rule 3 manual override. Nothing is
  auto-assigned, so no separate override RPC or UI control is needed.

`app/(app)/sessions/[id]/manage/page.tsx`:

- Add `const rotationQueue = await getRotationQueue(id)` alongside the
  existing `listRoster`/`listCourts`/`listMatches` calls.
- Pass `rotationQueue` to `MatchPanel` instead of `roster` (the page
  still passes `roster` to `RosterTable`, which needs it for other
  columns — unaffected by this change).

## Testing

- `tests/unit/sort-rotation-queue.test.ts` — pure function: never-played
  ordering by check-in time, played ordering by last-completed time,
  mixed ordering, tie-break determinism.
- Manual verification: seed checked-in participants, run a match to
  completion, confirm rotation order in the browser (per task
  instructions).
- `npx tsc --noEmit`, lint, `npm run test:unit`, `npm run build`.

## Out of scope (explicitly deferred)

- Auto-generating team splits from queue order (🟢 Future).
- A separate "sit out" / manual reorder control — the free-selection
  checkbox UI already satisfies the manual-override requirement;
  adding a distinct override mechanism would be scope creep for a
  suggestion that carries no enforced state.
- Realtime updates to the queue (page already isn't realtime-driven;
  follows existing `revalidatePath` pattern).
