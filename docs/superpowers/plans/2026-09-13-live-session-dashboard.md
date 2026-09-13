# Live Session Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the host manage page (`app/(app)/sessions/[id]/manage/page.tsx`) reflect check-ins, court status, match state, and rotation order live across multiple hosts/devices, without a manual reload.

**Architecture:** A new invisible client component subscribes to Postgres Realtime changes (already published in `supabase/migrations/20260911000011_realtime.sql`) for the current session's `sessions`/`participants`/`courts`/`matches` rows, and calls a debounced `router.refresh()` on any change. That re-runs the existing server-component data fetch (`listRoster`, `listCourts`, `listMatches`, `getRotationQueue`) unchanged, so derived state (rotation queue, waitlist counts) stays correct by construction. No mutation path changes.

**Tech Stack:** Next.js App Router, `@supabase/ssr` browser client, Supabase Realtime (`postgres_changes`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-live-session-dashboard-design.md`

## Global Constraints

- Mutations stay Server Actions — do not convert `setCheckedIn`/`createMatch`/`setCourtStatus`/etc. to client-side writes.
- Host-facing manage page only. No changes to member-facing registration/waitlist pages.
- No visible connection/reconnection UI for this pass — silent best-effort sync.
- `match_players` table is not subscribed directly (no `session_id` column, filter can't join). Rely on the fact that every current mutation touching `match_players` (`createMatch`) also inserts a `matches` row in the same action.
- Debounce window: 300ms, trailing-edge.
- Channel name: `session:${sessionId}:dashboard`.

---

### Task 1: Debounce utility

**Files:**
- Create: `lib/realtime/debounce.ts`
- Test: `tests/unit/debounce.test.ts`

**Interfaces:**
- Consumes: nothing (pure utility, no project dependencies)
- Produces: `debounce<Args extends unknown[]>(fn: (...args: Args) => void, delayMs: number): (...args: Args) => void` — later tasks (Task 2) import this exact signature from `@/lib/realtime/debounce`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/debounce.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "@/lib/realtime/debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid calls into a single trailing invocation", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits the full delay from the last call, not the first", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(200);
    debounced(); // resets the timer
    vi.advanceTimersByTime(200);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes through the arguments of the last call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced("first");
    debounced("second");

    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledWith("second");
  });

  it("fires again independently after a prior debounced call already resolved", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/debounce.test.ts`
Expected: FAIL — `Cannot find module '@/lib/realtime/debounce'` (or similar resolution error)

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/realtime/debounce.ts

// Trailing-edge debounce: coalesces a burst of calls into one invocation of
// `fn`, run `delayMs` after the last call in the burst. Used to collapse
// multi-row realtime events (e.g. a waitlist promotion cascading several
// participant updates) into a single dashboard refresh.
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn(...args);
    }, delayMs);
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/debounce.test.ts`
Expected: PASS, all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add lib/realtime/debounce.ts tests/unit/debounce.test.ts
git commit -m "feat(realtime): add trailing-edge debounce utility"
```

---

### Task 2: Session realtime watcher component

**Files:**
- Create: `components/sessions/session-realtime-watcher.tsx`

**Interfaces:**
- Consumes: `debounce` from `@/lib/realtime/debounce` (Task 1, exact signature above); `createClient` from `@/lib/supabase/client` (existing, returns `SupabaseClient<Database>` from `createBrowserClient<Database>(...)`); `useRouter` from `next/navigation`
- Produces: `SessionRealtimeWatcher` — a client component accepting `{ sessionId: string }`, renders `null`. Later task (Task 3) imports it as `import { SessionRealtimeWatcher } from "@/components/sessions/session-realtime-watcher"` and renders `<SessionRealtimeWatcher sessionId={session.id} />`.

No automated test for this task — it's effect wiring around two already-tested/trusted dependencies (Supabase Realtime client, Next.js router), covered by the manual two-tab verification in Task 3. Note: `channel.on("postgres_changes", ...)` calls aren't type-checked against literal event names by the installed `@supabase/supabase-js` types in a way that would catch a typo'd table name, so double-check table names character-for-character against the migration in Step 1 below.

- [ ] **Step 1: Write the component**

```tsx
// components/sessions/session-realtime-watcher.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { debounce } from "@/lib/realtime/debounce";

const DEBOUNCE_MS = 300;

// Invisible. Subscribes to Postgres changes for this session's dashboard
// tables and debounce-refreshes the server component on any change, so the
// host manage page stays live across multiple hosts/devices without a
// manual reload. See docs/superpowers/specs/2026-09-13-live-session-dashboard-design.md
// for why this refetches instead of patching client state, and why
// match_players isn't subscribed directly.
export function SessionRealtimeWatcher({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = debounce(() => router.refresh(), DEBOUNCE_MS);

    const channel = supabase
      .channel(`session:${sessionId}:dashboard`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `session_id=eq.${sessionId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courts", filter: `session_id=eq.${sessionId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `session_id=eq.${sessionId}` },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, router]);

  return null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (pre-existing unrelated errors, if any, are out of scope — confirm by checking the error list doesn't mention `session-realtime-watcher.tsx`)

- [ ] **Step 3: Commit**

```bash
git add components/sessions/session-realtime-watcher.tsx
git commit -m "feat(realtime): add session dashboard realtime watcher"
```

---

### Task 3: Wire watcher into the manage page

**Files:**
- Modify: `app/(app)/sessions/[id]/manage/page.tsx`

**Interfaces:**
- Consumes: `SessionRealtimeWatcher` from `@/components/sessions/session-realtime-watcher` (Task 2)
- Produces: nothing new for later tasks — this is the integration point, end of the plan

- [ ] **Step 1: Add the import and render the watcher**

In `app/(app)/sessions/[id]/manage/page.tsx`, add the import alongside the existing component imports:

```tsx
import { SessionRealtimeWatcher } from "@/components/sessions/session-realtime-watcher";
```

Then render it as the first child inside the returned `<div className="mx-auto flex max-w-3xl flex-col gap-6">`, before `<header>`:

```tsx
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <SessionRealtimeWatcher sessionId={session.id} />

      <header className="flex flex-col gap-1">
```

(Leave everything else in the file — `<CourtPanel>`, `<MatchPanel>`, `<RosterTable>`, the header counts — unchanged.)

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: PASS, no new errors

Run: `rtk proxy npx eslint .` (use `rtk proxy` because plain `npx eslint .` JSON-parse-fails in this environment per CLAUDE.md tooling notes)
Expected: PASS, no new errors on the modified/created files

- [ ] **Step 3: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS, including the new `debounce.test.ts` from Task 1

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/sessions/[id]/manage/page.tsx"
git commit -m "feat(host): wire realtime watcher into session manage page"
```

- [ ] **Step 6: Manual verification (two live tabs)**

1. Confirm local Supabase is running: `npx supabase status`
2. Confirm dev server is running at `localhost:3000` (start with `npm run dev` if not)
3. Look up the seeded session id (id changes on every `supabase db reset`):
   ```sql
   select id from public.sessions where title = 'Friday Night Badminton';
   ```
4. If the session has no checked-in participants yet, seed a couple via psql against the local dev DB (same approach used for match-scheduling/rotation verification — direct `update public.participants set checked_in_at = now() where id = '<id>'` or equivalent insert, not `seed.sql`).
5. Log in as `host@jakbar.local` / `password123`, navigate to `/sessions/<id>/manage`.
6. Open a second browser context on the same URL (e.g. `mcp__chrome-devtools__new_page` with `isolatedContext: true`, or a second real tab/profile).
7. In tab A, toggle a check-in (or change a court status, or start/complete a match).
8. Watch tab B: confirm the roster/court/match panel and header counts update within ~1 second, with no manual reload.
9. Repeat once for a court status change and once for a match action, to touch all three subscribed tables (`participants`, `courts`, `matches`) plus confirm the rotation queue (derived from both `participants` and `matches`) updates in tab B's match panel.

If any of these don't propagate, stop and debug before considering the task done (`superpowers:systematic-debugging` if the cause isn't immediately obvious) — do not report success without having watched tab B update live.

---

## Definition of Done

- [ ] All 3 tasks' steps checked off
- [ ] `npx tsc --noEmit`, `rtk proxy npx eslint .`, `npm run test:unit`, `npm run build` all pass
- [ ] Two-tab manual verification performed and confirmed live-updating for check-in, court status, and match state
