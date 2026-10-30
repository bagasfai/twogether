# Live Session Dashboard — Design

Status: approved for planning
Date: 2026-09-13
Scope: Core (CLAUDE.md §6) — "live session dashboard, realtime updates," host-facing manage page only

## Problem

`app/(app)/sessions/[id]/manage/page.tsx` fetches the roster, courts, matches,
and rotation queue once per request. Every mutation (check-in, court status,
match lifecycle, rotation-affecting actions) already goes through a Server
Action + `revalidatePath`, which updates the acting host's own browser but
nobody else's. Multiple hosts/devices watching the same session during a live
event see stale state until they manually reload.

The DB side is already wired for this: `supabase/migrations/20260911000011_realtime.sql`
sets `replica identity full` and adds `sessions`, `participants`, `courts`,
`matches`, `match_players` to the `supabase_realtime` publication. Nothing
reads from it yet.

## Non-goals

- Member-facing live views (e.g. live waitlist position on the registration
  status page). CLAUDE.md §6 lists "live session dashboard" under host-facing
  Core scope; member-facing realtime is a separate future item, not bundled
  here.
- Any visible connection/reconnection indicator. Silent best-effort sync for
  this pass — Supabase's realtime client reconnects the underlying socket and
  channel on its own; no custom retry/backoff code.
- Any change to the mutation path. `setCheckedIn`, `createMatch`,
  `setCourtStatus`, etc. stay Server Actions. This spec adds a subscription +
  refresh path on top of the existing read/write flow, not a new one.

## Architecture

One new client component, `components/sessions/session-realtime-watcher.tsx`,
mounted inside `ManageSessionPage` alongside the existing panels. It renders
`null` — it has no UI, it exists to hold a `useEffect` subscription.

```
ManageSessionPage (server component)
  fetches: listRoster, listCourts, listMatches, getRotationQueue (unchanged)
  renders:
    <SessionRealtimeWatcher sessionId={session.id} />   <- new, invisible
    <CourtPanel .../>
    <MatchPanel .../>
    <RosterTable .../>
```

### Subscription shape

On mount, `SessionRealtimeWatcher` opens one Supabase Realtime channel scoped
to the session:

```
supabase.channel(`session:${sessionId}:dashboard`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions',     filter: `id=eq.${sessionId}` }, onChange)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` }, onChange)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'courts',       filter: `session_id=eq.${sessionId}` }, onChange)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'matches',      filter: `session_id=eq.${sessionId}` }, onChange)
  .subscribe();
```

`event: '*'` (not just `UPDATE`) because `deleteCourt` performs a real
`DELETE`, and match/participant rows can in principle be deleted too.

**`match_players` is deliberately not subscribed.** It has no `session_id`
column (its only foreign keys are `match_id`/`participant_id`), so it can't be
filtered by session directly, and Realtime's `postgres_changes` filter doesn't
support joins. Reading `lib/actions/matches.ts` shows every mutation that
touches `match_players` (`createMatch`) inserts a `matches` row in the same
action — the `matches` filter above already catches it. If a future action
ever mutates `match_players` independently of `matches` (e.g. a "swap player"
action that only touches the join table), this assumption breaks and that
action would need to also touch/`update`-stamp its `matches` row, or this
spec's approach needs revisiting.

### One channel, page-level, not per-panel

A single subscription drives a single debounced `router.refresh()`. This was
evaluated against per-panel channels (RosterTable/CourtPanel/MatchPanel each
owning a subscription) and rejected: the rotation queue and match panel
already depend on participants *and* matches together, and the page header's
confirmed/waiting/checked-in counts depend on the roster regardless of which
table fired. Per-panel channels would still need to know about each other's
tables to stay correct, duplicating filter logic for no isolation benefit.

### Refetch, not patch

An incoming change triggers a debounced `router.refresh()`, which re-runs
`ManageSessionPage` server-side and re-executes the existing DAL calls
unchanged. This was chosen over patching the changed row into client state
because rotation queue and waitlist position are *derived* — `getRotationQueue`
joins `participants` against `match_players`/`matches` to compute fairness
order, and `waitlistPosition` (in `lib/dal/participants.ts`) counts
rows-ahead-of-me. Neither can be correctly reconstructed from a single changed
row without duplicating that logic client-side. Given session sizes (dozens of
players, not thousands), the extra round trip per debounced batch is cheap.

### Debounce

Multiple realtime events can fire in a tight burst (e.g. the waitlist
promotion trigger cascading several participant updates from one
cancellation). A trailing-edge debounce coalesces bursts into one refresh.

Extracted as a pure function in `lib/realtime/debounce.ts`:

```ts
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void
```

No React, no Supabase — takes a callback and a delay, returns a debounced
wrapper. This is the one piece of logic in this feature worth unit testing in
isolation (fake timers); everything else is either existing DAL code or thin
effect wiring.

`SessionRealtimeWatcher` wraps `router.refresh` with a 300ms debounce and
passes that as the `onChange` handler for all four subscriptions above.

### Cleanup

The effect's cleanup calls `channel.unsubscribe()` (via the client returned
by `createClient()` from `lib/supabase/client.ts`) on unmount, so navigating
away from the manage page or `sessionId` changing doesn't leak a channel.

## Error handling

None beyond what the library already does. `supabase-js`'s realtime client
reconnects its websocket and re-subscribes channels automatically; per the
brainstorming decision, this pass has no visible connection indicator and no
custom retry/backoff. If a host's dashboard is silently stale because of a
dropped connection, a manual browser refresh is the fallback — consistent
with hosts always retaining a manual path (CLAUDE.md §3.3), applied loosely
here since there's no dedicated "refresh" UI action, just the browser's own.

## Testing

- Unit: `lib/realtime/debounce.ts` — coalesces rapid calls into one trailing
  invocation, respects the delay, independent calls after the delay each fire
  (vitest, fake timers). Written test-first per
  `superpowers:test-driven-development`.
- No automated integration/e2e test for the realtime wiring itself — this
  repo has no websocket-capable test harness. Verified manually: two browser
  contexts on the same seeded session (`Friday Night Badminton`), confirming
  a check-in / court status / match action in one tab appears in the other
  without a manual reload.

## Files touched

- `lib/realtime/debounce.ts` — new, pure debounce utility
- `tests/unit/debounce.test.ts` — new
- `components/sessions/session-realtime-watcher.tsx` — new, client component
- `app/(app)/sessions/[id]/manage/page.tsx` — add `<SessionRealtimeWatcher>` 

No DAL, Server Action, migration, or existing panel component changes.

## Implementation notes (post-design)

Two real bugs surfaced during manual verification, both fixed and re-verified
live across two browser tabs. The actual component
(`components/sessions/session-realtime-watcher.tsx`) is the source of truth;
this section exists so a reader of this spec isn't misled by the snippets
above, which still show the originally-designed (and since-superseded) shape.

**Four channels, not one.** The single-channel design above (one channel,
four `.on()` registrations) triggers a real Supabase Realtime server error —
`invalid column for filter session_id` — specifically when the `matches`
table's filter is combined with the other three on the same channel, even
though `matches.session_id` is a real, granted, published column. A
standalone single-table channel for `matches` subscribes cleanly. The fix
splits into four single-table channels
(`session:${sessionId}:dashboard:sessions|participants|courts|matches`),
each independently `.subscribe()`d, all sharing the same debounced `refresh`
callback and all torn down together in cleanup. This preserves the section
above's actual intent (page-level, shared debounce, not per-panel) — only the
channel *count* changed, not the architecture.

**Realtime must authenticate before subscribing.** Supabase's realtime socket
starts as the `anon` role and only upgrades to the signed-in user's JWT
asynchronously, in reaction to an auth-state event — which has not fired by
the time a subscribe call issued synchronously on mount would run. Since
`anon` has no SELECT grant on `participants`/`courts`/`matches` (correct, by
this app's RLS design), every subscribe on those three tables was silently
rejected; only `sessions` (anon-readable, for the public marketing site)
appeared to work, which is precisely the wrong table to have looked healthy —
none of this dashboard's UI even surfaces a `sessions`-level change. The fix:
await `supabase.auth.getSession()` and call
`supabase.realtime.setAuth(session.access_token)` before the first
`.subscribe()` call, guarded by a `cancelled` flag against the component
unmounting while that lookup is still in flight. Confirmed this does not
widen access — `postgres_changes` still evaluates every change against the
same RLS policies as a normal query, scoped to whichever user's JWT was set;
a member with no access to a session's data still receives nothing.

**Cleanup section above is stale.** Cleanup now unsubscribes all four
channels (`supabase.removeChannel()` per channel) and cancels the pending
debounced call (`refresh.cancel()`, added after a later review found the
original debounce had no way to stop a call already in flight when the
component unmounts) — not the single `channel.unsubscribe()` the section
above describes.

## Future cost callouts (🟢 Future territory)

None of this locks in anything that would need to change for a 🟢 Future
feature (automatic match generation, skill balancing, etc.) — those are
mutation-side concerns; this spec is purely an additive read-refresh path on
top of the existing mutation/RLS model.
