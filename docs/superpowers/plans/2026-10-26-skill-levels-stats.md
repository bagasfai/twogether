# Match Stats Implementation Plan (Skill Levels Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a games-played count, a per-session host leaderboard, an all-time member leaderboard, and a completed-match history view, none of which expose level or gender.

**Architecture:** One migration adds a `security_invoker` view (`session_games_played`) and a `security definer` RPC (`all_time_leaderboard`) that returns only display name and count. Two new DALs (`lib/dal/stats.ts`, `lib/dal/match-history.ts`) read them; a pure `assignRanks` helper handles tie ranking. UI: leaderboard under the host match panel, a `/leaderboard` member page, and a `/sessions/[id]/matches` history page.

**Tech Stack:** Next.js App Router server components, Supabase (Postgres views/RPC, RLS, pgTAP), vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-skill-levels-and-auto-match-design.md` (Phase 2)

Work on a new branch `feat/skill-levels-stats` cut from `dev`.

## Global Constraints

- A game counts only when `matches.status = 'completed'`. `scheduled`, `in_progress`, `cancelled` never count.
- Neither leaderboard, the view, the RPC, nor match history may return or join `member_levels`, `guest_attributes`, `profiles_private.gender`, or any level/gender column.
- Per-session board: hosts only (the view filters with `is_session_host`; also rendered on the `requireHost` manage route), ordered by games played, includes guests by `guest_name`.
- All-time board: registered members only (`participants.user_id is not null`), aggregated by `user_id`, readable by any `authenticated` user, exposes display name and games played only. `anon` has no access.
- Match history: completed matches in order, court, completed time, team 1 vs team 2 names. No scores.
- Match history access: hosts of the session, and users with a non-cancelled participant row in it. Everyone else gets 404.
- Migration name: `supabase/migrations/20261026000004_match_stats.sql`. Regenerate types with `npx supabase gen types typescript --local > types/supabase.ts`.
- pgTAP file: `supabase/tests/035_match_stats.test.sql` (header `begin; select plan(N);`, style of `016_match_scheduling.test.sql`). Vitest: `tests/unit/*.test.ts`.

## Resolved open items from the spec

- `matches_select` / `match_players_select` (`20260911000009_rls_operations.sql:38,48`) already allow any authenticated user to read matches of a *public* session, and `participants_select_self_host_or_public` exposes non-cancelled names the same way. No new RLS policy is needed for history. The spec's narrower "participants only" rule is enforced in the DAL (Task 3), not RLS. This is deliberately not tightened: the existing policy is older than this work and other screens depend on it.
- Guest level/gender live in `guest_attributes` (host-only), not on `participants`; stats never touch it.

## Review Focus

- A `cancelled` or still `in_progress` match must not raise `games_played` (pgTAP, Task 1).
- A cancelled participant with 0 games must not appear on the per-session board; one with completed games still does (pgTAP, Task 1).
- Two guests with the same `guest_name` stay separate rows (pgTAP, Task 1).
- A member with a null `full_name` shows as "Member", not blank or "null" (vitest, Task 2).
- Tied players share a rank and the next rank skips (1,2,2,4) (vitest, Task 2).
- A non-participant non-host requesting `/sessions/[id]/matches` gets 404, not an empty page (Task 3 DAL returns `null`).
- A session with zero completed matches renders an empty state, not an error (Tasks 4–5).

---

### Task 1: Stats schema (view + RPC) with pgTAP

**Files:**
- Create: `supabase/migrations/20261026000004_match_stats.sql`
- Create: `supabase/tests/035_match_stats.test.sql`
- Modify: `types/supabase.ts` (regenerate)

**Interfaces:**
- Produces: view `public.session_games_played(participant_id uuid, session_id uuid, games_played bigint)` with `security_invoker = true`; function `public.all_time_leaderboard(p_limit int default 50) returns table (full_name text, games_played bigint, is_me boolean)`.

- [ ] **Step 1: Write the failing pgTAP test** in `035_match_stats.test.sql`. Seed: host, members m1–m4, one public session, one completed match (m1,m2 vs m3,guest "Budi"), one more completed match (m1,m3 vs m2,guest "Budi"), one `cancelled` match with m4 (checked in), one `in_progress` match with m4, a second guest also named "Budi" with 0 games, a cancelled participant with 0 games, a cancelled participant with 1 completed game. Assertions (as `authenticated` host unless stated):
  - `columns_are('public','session_games_played', array['participant_id','session_id','games_played'])`
  - m1 `games_played` = 2; m4 = 0 (cancelled + in_progress ignored); the two "Budi" guests are two separate rows (`count(*)` = 2).
  - Cancelled zero-game participant has no row; cancelled participant with 1 completed game has a row with 1.
  - `all_time_leaderboard()` as m2: columns are exactly `full_name, games_played, is_me`; m1 row has `games_played` 2; guests absent; `is_me` true only on m2's row; m4 absent (0 completed games).
  - `all_time_leaderboard()` as `anon`: `throws_ok(..., '42501')`.
  - A member with null `full_name` returns `full_name = 'Member'`.
  - Member (non-host) selecting from `session_games_played` for a *private/draft* session returns 0 rows (view honours RLS).

- [ ] **Step 2: Run** `npx supabase test db` and confirm `035_match_stats` fails (relation does not exist).

- [ ] **Step 3: Implement the migration.** View: `participants` left join `match_players` join `matches` on `status = 'completed'`, grouped by `participants.id`, filtered `participants.status <> 'cancelled' or count > 0` (use `having`), created `with (security_invoker = true)`. RPC: `language sql stable security definer set search_path = ''`, aggregates completed `match_players` of participants with `user_id is not null` by `user_id`, joins `public.profiles` for `coalesce(full_name, 'Member')`, `is_me = (user_id = auth.uid())`, orders `games_played desc, full_name`, `limit p_limit`. Follow the grant pattern of `20261023000001_public_community_stats.sql` but `revoke execute ... from public, anon` and `grant execute ... to authenticated`. Comment why security definer (profiles/participants cross-session reads) and that it returns no identifier.

- [ ] **Step 4: Run** `npx supabase db reset && npx supabase test db`. Expected: all suites pass including 035. Regenerate types.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261026000004_match_stats.sql supabase/tests/035_match_stats.test.sql types/supabase.ts
git commit -m "feat: games-played view and all-time leaderboard rpc"
```

---

### Task 2: Ranking helper and leaderboard DAL

**Files:**
- Create: `lib/stats.ts`
- Create: `lib/dal/stats.ts`
- Test: `tests/unit/assign-ranks.test.ts`

**Interfaces:**
- Consumes: Task 1 view and RPC.
- Produces:
  - `lib/stats.ts`: `assignRanks<T extends { gamesPlayed: number }>(rows: T[]): (T & { rank: number })[]` (input pre-sorted desc; competition ranking), `displayName(name: string | null): string` (returns `"Member"` for null/blank).
  - `lib/dal/stats.ts`: `type SessionLeaderboardRow = { participantId: string; name: string; isGuest: boolean; gamesPlayed: number; rank: number }`, `getSessionLeaderboard(sessionId: string): Promise<SessionLeaderboardRow[]>`, `type AllTimeLeaderboardRow = { name: string; gamesPlayed: number; isMe: boolean; rank: number }`, `getAllTimeLeaderboard(limit?: number): Promise<AllTimeLeaderboardRow[]>`.

- [ ] **Step 1: Write failing tests** in `assign-ranks.test.ts`: `assignRanks([{gamesPlayed:5},{gamesPlayed:3},{gamesPlayed:3},{gamesPlayed:1}])` ranks `[1,2,2,4]`; empty array returns `[]`; all-equal returns all rank 1; `displayName(null)`, `displayName("  ")` → `"Member"`, `displayName("Ani")` → `"Ani"`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/assign-ranks.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/stats.ts`** (pure, no imports from server code).

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Implement `lib/dal/stats.ts`** following `lib/dal/matches.ts` (`import "server-only"`, `createClient` from `@/lib/supabase/server`, `getCurrentUser` guard returning `[]`, `throw error` on query error). Session board: select from `session_games_played` for `sessionId`, joined to `participants(guest_name, user_id, profiles!participants_user_id_fkey(full_name))` via a second query keyed on participant ids if PostgREST cannot embed the view; sort `gamesPlayed desc` then name; apply `assignRanks`. All-time: `supabase.rpc("all_time_leaderboard", { p_limit: limit })`, map snake to camel, apply `assignRanks`.

- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run`. Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/stats.ts lib/dal/stats.ts tests/unit/assign-ranks.test.ts
git commit -m "feat: leaderboard dal and rank helper"
```

---

### Task 3: Match history DAL

**Files:**
- Create: `lib/dal/match-history.ts`

**Interfaces:**
- Consumes: `MatchEntry`, `MatchPlayer` shapes from `lib/dal/matches.ts`.
- Produces: `type MatchHistory = { sessionId: string; sessionTitle: string; matches: MatchEntry[] }`; `getMatchHistory(sessionId: string): Promise<MatchHistory | null>` — returns `null` when the caller is neither a host of the session nor a non-cancelled participant in it (or the session is not visible), and `matches` holds only `status = 'completed'` ordered `completed_at asc`.

- [ ] **Step 1: Implement.** Reuse `listMatches(sessionId)` and filter to `completed` plus sort by `completedAt`, rather than duplicating the nested select. Access check: `getCurrentUser()`; query `sessions` (title) and, in parallel, `session_hosts` membership or `sessions.created_by`, and `participants` where `user_id = user.id and status <> 'cancelled'`. Reuse the existing host-check helper if `lib/dal/sessions.ts` has one (`getHostSession` does, on `manage/page.tsx`); admin counts as host. Guest brought by the caller (`registered_by = user.id`) counts as participation.

- [ ] **Step 2: Verify manually against local DB** with the seed from Task 1: host and a participant get matches; an unrelated member gets `null`. Record the three results in the commit body.

- [ ] **Step 3: Run** `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/dal/match-history.ts
git commit -m "feat: match history dal with participant access check"
```

---

### Task 4: Host per-session leaderboard in the manage page

**Files:**
- Create: `components/sessions/session-leaderboard.tsx`
- Modify: `app/(app)/sessions/[id]/manage/page.tsx` (fetch at ~line 40 beside `getRotationQueue`; render inside the `matches` slot at ~line 108)

**Interfaces:**
- Consumes: `getSessionLeaderboard`, `SessionLeaderboardRow` (Task 2).
- Produces: `SessionLeaderboard({ rows }: { rows: SessionLeaderboardRow[] })` server-safe component (no hooks); empty state "No completed games yet."

- [ ] **Step 1: Implement the component** with shadcn `Card` and a plain table: rank, name (guest rows get a "Guest" `Badge`), games played. No level or gender anywhere.

- [ ] **Step 2: Wire into the page.** Add `getSessionLeaderboard(id)` to the existing fetches and render `<SessionLeaderboard>` below `<MatchPanel>` in the `matches` prop (wrap both in a fragment/flex column).

- [ ] **Step 3: Verify in the browser** (`run` skill): complete a match on the manage page, confirm the four players show 1 game after refresh and a cancelled match changes nothing. Check `SessionRealtimeWatcher` refreshes the board when a match completes; if it does not, state that in the commit and leave refresh-on-navigation as the behaviour (no new realtime channel in this phase).

- [ ] **Step 4: Run** `npx tsc --noEmit && npm run lint`. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/sessions/session-leaderboard.tsx "app/(app)/sessions/[id]/manage/page.tsx"
git commit -m "feat: per-session leaderboard on host manage page"
```

---

### Task 5: Member leaderboard page and match history page

**Files:**
- Create: `app/(app)/leaderboard/page.tsx`
- Create: `app/(app)/sessions/[id]/matches/page.tsx`
- Create: `components/sessions/match-history-list.tsx`
- Modify: `app/(app)/layout.tsx:44-57` (add "Leaderboard" nav link beside History)
- Modify: `app/(app)/history/page.tsx` (link each past session to `/sessions/${id}/matches`)

**Interfaces:**
- Consumes: `getAllTimeLeaderboard` (Task 2), `getMatchHistory` (Task 3).
- Produces: `MatchHistoryList({ matches }: { matches: MatchEntry[] })`; routes `/leaderboard` and `/sessions/[id]/matches`.

- [ ] **Step 1: Implement `/leaderboard`.** `await requireUser("/leaderboard")`, render rank/name/games from `getAllTimeLeaderboard()`, highlight the row where `isMe`. Empty state "No completed games yet." Layout class pattern from `app/(app)/history/page.tsx` (`mx-auto flex max-w-3xl flex-col gap-10`).

- [ ] **Step 2: Implement `MatchHistoryList`.** Numbered list; each item shows court ("Court N" or "—"), completed time, and "Team 1: A & B vs Team 2: C & D" using `fullName ?? "Player"`. No scores.

- [ ] **Step 3: Implement `/sessions/[id]/matches`.** `requireUser`, `getMatchHistory(id)`, `notFound()` on `null`, title heading, `MatchHistoryList`, empty state "No completed matches in this session."

- [ ] **Step 4: Add nav link and history-page links.** Both are `Link` additions in existing markup; match existing class names.

- [ ] **Step 5: Verify in the browser** as three users from the Task 1 seed shape: participant sees history and leaderboard with only name and games; non-participant gets 404 on the history URL; neither page's HTML contains a level label or "male"/"female".

- [ ] **Step 6: Run** `npx tsc --noEmit && npm run lint && npx vitest run && npx supabase test db`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/leaderboard" "app/(app)/sessions/[id]/matches" components/sessions/match-history-list.tsx "app/(app)/layout.tsx" "app/(app)/history/page.tsx"
git commit -m "feat: member leaderboard and session match history"
```

---

## Self-review

- **Spec coverage:** games-played view → T1; per-session board (hosts, guests by name) → T2/T4; all-time board (members only, name + count, any member) → T1/T2/T5; no level/gender exposure → T1 column assertions + T5 check; match history (hosts/participants, guests by name, no scores) → T3/T5; open items on RLS → "Resolved open items".
- **Deviation from spec:** the "members only see sessions they participated in" rule is enforced in the DAL, not RLS, because the existing RLS is broader (any authenticated user, public sessions). Direct table reads by other members of public sessions remain possible, as they were before this work.
- **Type consistency:** `SessionLeaderboardRow`, `AllTimeLeaderboardRow`, `assignRanks`, `displayName`, `MatchHistory`, `getMatchHistory` are defined once and used with the same names in later tasks.
