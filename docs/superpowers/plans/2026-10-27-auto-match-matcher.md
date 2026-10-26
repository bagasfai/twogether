# Auto-Match Matcher Implementation Plan (Skill Levels Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host picks a format, taps "generate", gets one skill-balanced, gender-valid suggested match per free court, edits it, and confirms it into real `scheduled` matches.

**Architecture:** `suggestMatches` is a pure function (no DB, no `server-only`) fed by a host-only DAL that assembles pool, games-played, levels, genders, free courts and completed-match history. Two server actions (`generateSuggestions`, `confirmSuggestions`) wrap it; confirm calls the existing `create_match` RPC once per suggested match. A new DB guard makes "player already in an active match" an atomic, trigger-level rule, because `guard_match_player` does not check it today.

**Tech Stack:** Next.js App Router server actions, Supabase RPC + pgTAP, zod, vitest (`tests/unit/**`), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-26-skill-levels-and-auto-match-design.md` (Phase 3)

## Global Constraints

- Suggestions never commit anything; only confirm writes (CLAUDE.md rule 3, spec "Scope and tier note").
- The matcher operates on the checked-in pool, not the registration list (rule 4). Pool = `status = 'confirmed'`, `checked_in_at` not null, not in a `scheduled`/`in_progress` match.
- Level weights: `levelWeight()` in `lib/players/levels.ts`; unrated = `UNRATED_WEIGHT` (3).
- Level and gender never leave host-only code paths: no member-facing query, view, realtime payload, leaderboard. Generate/confirm are host-gated.
- Men's double = four `male`; women's double = four `female`; mixed = two men + two women, one of each per team. Missing gender is excluded from every format.
- Each player used at most once per generation. Fewer matches than free courts is a valid result, not an error.
- Cost weights live in one constants object (`MATCH_WEIGHTS`) so they can be tuned without structural change.
- Out of scope: scores/winners, automatic rotation, any registration/waitlist change.
- Spec drift to respect: guest gender/level live in table `guest_attributes` (not columns on `participants`); `lib/dal/player-attributes.ts#getRosterAttributes` already resolves both for hosts.
- After Task 1, run `supabase db reset` locally; no table changes, so `types/supabase.ts` does not need regeneration.

## Review Focus

- Pool of 5-7 players with 2 free courts: one match, leftovers listed, no crash.
- Mixed format with 3 men and 1 woman (or a one-gender pool): zero matches plus a message saying which gender is short.
- All players unrated: still produces valid matches (weight 3 each).
- Two hosts confirm overlapping suggestions concurrently: exactly one wins, the loser gets a named-player error, no player ends up in two active matches.
- Suggestion is stale at confirm (court taken, player started another match, player un-checked-in): that match is rejected with a reason, the others still go through.
- Host edits a suggestion into a rule-breaking lineup (e.g. two women in a men's double): UI warns, confirm still allowed (rule 3).

---

## File Structure

- `supabase/migrations/20261027000001_match_player_busy_guard.sql` — extends `guard_match_player`.
- `supabase/tests/036_match_player_busy_guard.test.sql` — pgTAP.
- `lib/errors/rpc.ts` — add `JB017` / `player_busy`.
- `lib/matcher/types.ts` — shared types.
- `lib/matcher/suggest.ts` — `suggestMatches` + `MATCH_WEIGHTS`.
- `lib/matcher/lineup.ts` — `swapPlayers`, `lineupWarnings` (pure, used by UI).
- `lib/validation/matcher.ts` — zod schemas for both actions.
- `lib/dal/matcher.ts` — `getMatcherInput` (host-only).
- `lib/actions/matcher.ts` — `generateSuggestions`, `confirmSuggestions`.
- `components/sessions/auto-match-panel.tsx` — client UI.
- `app/(app)/sessions/[id]/manage/page.tsx` — render panel in the matches tab.
- Tests: `tests/unit/suggest-matches.test.ts`, `tests/unit/lineup.test.ts`, `tests/unit/matcher-validation.test.ts`, `tests/unit/rpc-errors.test.ts` (extend).

---

### Task 1: DB guard against double-booking a player

**Files:**
- Create: `supabase/migrations/20261027000001_match_player_busy_guard.sql`
- Create: `supabase/tests/036_match_player_busy_guard.test.sql`
- Modify: `lib/errors/rpc.ts`
- Test: `tests/unit/rpc-errors.test.ts`

**Interfaces:**
- Produces: error code `JB017` mapped to `AppErrorCode` `"player_busy"`, message `"A player in this match is already in another active match."`. Any insert/update into `match_players` raises `JB017` if the participant is in another match with status `scheduled` or `in_progress`.

- [ ] **Step 1: Write the failing pgTAP test** modelled on `supabase/tests/016_match_scheduling.test.sql` setup (session, host, 5 checked-in participants, 2 courts). Assertions: (a) `create_match` for A,B vs C,D succeeds; (b) `create_match` on court 2 including A throws `JB017`; (c) after A's match is `cancelled`, the same call succeeds; (d) after it is `completed`, a player can be placed again; (e) updating a `match_players` row without changing `participant_id`/`match_id` does not raise.
- [ ] **Step 2: Run** `supabase test db` — expect new file FAIL (b).
- [ ] **Step 3: Write the migration:** `create or replace function public.guard_match_player()` keeping the existing session/check-in checks verbatim and appending: `perform 1 from public.participants where id = new.participant_id for update;` (serialises concurrent creates for the same player), then raise `JB017` if `exists` a `match_players mp join matches m` with `mp.participant_id = new.participant_id`, `mp.match_id <> new.match_id`, `m.status in ('scheduled','in_progress')`. Add a comment explaining the row lock is the race guard (same reasoning as `matches_reserved_court_idx`).
- [ ] **Step 4: Add to `lib/errors/rpc.ts`:** header comment line, `JB017: "player_busy"` in `RPC_CODE_MAP`, message in `MESSAGES`. Extend `tests/unit/rpc-errors.test.ts` with a `JB017` case.
- [ ] **Step 5: Run** `supabase db reset && supabase test db` and `npm run test:unit -- rpc-errors` — expect PASS. Also run `supabase test db` for 005/016 to confirm manual match creation still passes.
- [ ] **Step 6: Commit** `feat: block a player from two active matches at the database`

---

### Task 2: `suggestMatches` pure matcher

**Files:**
- Create: `lib/matcher/types.ts`, `lib/matcher/suggest.ts`
- Test: `tests/unit/suggest-matches.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type MatchFormat = "mens" | "womens" | "mixed"`
  - `type PoolPlayer = { participantId: string; name: string; gender: Gender | null; weight: number; unrated: boolean; gamesPlayed: number }`
  - `type PastMatch = { team1: string[]; team2: string[] }` (participant ids, completed matches only)
  - `type SuggestedMatch = { team1: [string, string]; team2: [string, string] }`
  - `type SuggestResult = { matches: SuggestedMatch[]; unused: string[]; reason: string | null }` — `reason` is a host-facing sentence when `matches.length < courtCount` (e.g. `"Need 2 more women for a mixed double."`), else `null`.
- Produces (`suggest.ts`): `export const MATCH_WEIGHTS = { skillGap: 3, gamesPlayed: 1, repeatPartner: 2, repeatOpponent: 1, jitter: 0.5 }` and `export function suggestMatches(input: { pool: PoolPlayer[]; format: MatchFormat; courtCount: number; history: PastMatch[]; rng?: () => number }): SuggestResult`.
- Consumes: `Gender` from `lib/players/levels.ts`.

- [ ] **Step 1: Write failing tests** (`suggest-matches.test.ts`, helper `p(id, gender, weight, gamesPlayed = 0)`):
  - `"mens: only male players, 2 per team"`, `"womens: only female players"`.
  - `"mixed: each team has one man and one woman"`.
  - `"excludes players with null gender from every format"` (pool of 4 males + 4 null → exactly the males are used).
  - `"never uses a player twice across courts"` (8 males, 2 courts → 8 distinct ids).
  - `"returns fewer matches than courts when pool is short, with reason"` (5 males, 2 courts → 1 match, `unused` has 1 id, `reason` contains `"more"`).
  - `"mixed with 3 men and 1 woman returns no matches and names the short gender"`.
  - `"0 courts returns empty result, reason null"`.
  - `"balances skill: weights 5,1,3,3 pair 5+1 vs 3+3"` (level sums 6 vs 6).
  - `"prefers players with fewer games played"` (6 males, two with 4 games → they are unused).
  - `"avoids repeating a partner pair seen in history"` (4 equal-weight males, history has A+B as partners → A and B are on opposite teams).
  - `"all unrated players still produce a valid match"`.
  - `"is deterministic for a fixed rng and varies with different rng"` (two seeded rngs yield at least one differing lineup on a pool of 8 equal-weight players; fixed rng twice gives equal output).
  - `"does not mutate its inputs"`.
- [ ] **Step 2: Run** `npm run test:unit -- suggest-matches` — expect FAIL (module missing).
- [ ] **Step 3: Implement.** Algorithm: for each court in turn, from the players still unused and eligible for the format, enumerate every valid 4-player group and every valid team split (mens/womens: 3 splits; mixed: choose 2 men and 2 women, 2 splits), score with `cost = skillGap·|sum(team1.weight) − sum(team2.weight)| + gamesPlayed·sum(gamesPlayed of the four) + repeatPartner·(times each team pair partnered in history) + repeatOpponent·(times each cross pair opposed in history) + jitter·rng()`, keep the lowest, remove those four from the pool, continue. `rng` defaults to `Math.random`. Eligible pool is capped at 40 players by sorting on `gamesPlayed` ascending and truncating, to bound enumeration (C(40,4)≈91k per court). Compute `reason` by comparing eligible counts to what the format needs for the unfilled courts.
- [ ] **Step 4: Run** `npm run test:unit -- suggest-matches` — expect PASS.
- [ ] **Step 5: Commit** `feat: add skill-balanced match suggestion function`

---

### Task 3: Lineup editing helpers

**Files:**
- Create: `lib/matcher/lineup.ts`
- Test: `tests/unit/lineup.test.ts`

**Interfaces:**
- Consumes: `SuggestedMatch`, `MatchFormat`, `PoolPlayer` from Task 2.
- Produces:
  - `export type Slot = { matchIndex: number; team: 1 | 2; position: 0 | 1 }`
  - `export function swapPlayers(matches: SuggestedMatch[], unused: string[], a: Slot, b: Slot | "unused", unusedId?: string): { matches: SuggestedMatch[]; unused: string[] }` — swaps two slots, or swaps a slot with an unused player id; returns new objects.
  - `export function lineupWarnings(match: SuggestedMatch, format: MatchFormat, byId: Map<string, PoolPlayer>): string[]` — empty when the lineup satisfies the format's gender rules; otherwise sentences like `"Mixed double needs one man and one woman on each team."`.

- [ ] **Step 1: Write failing tests:** swap within a match; swap across matches; swap with an unused player puts the displaced player into `unused`; inputs not mutated; `lineupWarnings` empty for valid mens/womens/mixed; warns for two women in a men's double; warns for same-gender teammates in mixed; warns for null gender.
- [ ] **Step 2: Run** `npm run test:unit -- lineup` — expect FAIL.
- [ ] **Step 3: Implement** both functions in `lib/matcher/lineup.ts`.
- [ ] **Step 4: Run** `npm run test:unit -- lineup` — expect PASS.
- [ ] **Step 5: Commit** `feat: add suggestion swap and lineup warning helpers`

---

### Task 4: Matcher input DAL and validation schemas

**Files:**
- Create: `lib/dal/matcher.ts`, `lib/validation/matcher.ts`
- Test: `tests/unit/matcher-validation.test.ts`

**Interfaces:**
- Produces (`validation/matcher.ts`):
  - `generateSuggestionsSchema = z.object({ sessionId: z.uuid(), format: z.enum(["mens","womens","mixed"]) })`
  - `confirmSuggestionsSchema = z.object({ sessionId: z.uuid(), matches: z.array(z.object({ courtId: z.uuid(), team1: z.array(z.uuid()).length(2), team2: z.array(z.uuid()).length(2) })).min(1).max(20) })` with a refine that no participant id repeats across the whole payload and no `courtId` repeats.
  - types `GenerateSuggestionsInput`, `ConfirmSuggestionsInput`.
- Produces (`dal/matcher.ts`, `server-only`): `export type MatcherInput = { pool: PoolPlayer[]; freeCourts: { id: string; courtNumber: number }[]; history: PastMatch[] }` and `export async function getMatcherInput(sessionId: string): Promise<MatcherInput | null>`; `null` when the caller is not a host of the session (`getHostSession` returns null).
- Consumes: `getHostSession`, `getRosterAttributes` (weight/gender/unrated), `listCourts`, `listMatches`, view `session_games_played`.

- [ ] **Step 1: Write failing validation tests:** valid payload parses; `format: "singles"` rejected; team of 1 rejected; duplicate participant across teams rejected; duplicate court rejected; 21 matches rejected.
- [ ] **Step 2: Run** `npm run test:unit -- matcher-validation` — expect FAIL.
- [ ] **Step 3: Implement the schemas** in `lib/validation/matcher.ts`.
- [ ] **Step 4: Implement `getMatcherInput`.** Pool: participants of the session with `status = 'confirmed'` and `checked_in_at` not null, minus any id in a `scheduled`/`in_progress` match (reuse the same two-query shape as `lib/dal/rotation.ts`; do not call `getRotationQueue`, it drops attributes). `name` = profile `full_name` ?? `guest_name` ?? `"Unnamed player"`. `gamesPlayed` from `session_games_played` (missing row = 0). `freeCourts`: courts with `status = 'idle'` and no `scheduled`/`in_progress` match, sorted by `courtNumber`. `history`: completed matches from `listMatches`.
- [ ] **Step 5: Run** `npm run test:unit -- matcher-validation` and `npx tsc --noEmit` — expect PASS / no type errors.
- [ ] **Step 6: Commit** `feat: add matcher input DAL and action schemas`

---

### Task 5: Generate and confirm server actions

**Files:**
- Create: `lib/actions/matcher.ts`

**Interfaces:**
- Consumes: Task 2 `suggestMatches`/types, Task 4 schemas and `getMatcherInput`, existing `create_match` RPC, `failFromRpc`, `failFromZod`, `ok`, `fail`.
- Produces:
  - `generateSuggestions(input: GenerateSuggestionsInput): Promise<ActionResult<{ suggestions: (SuggestedMatch & { courtId: string; courtNumber: number })[]; players: PoolPlayer[]; unused: string[]; reason: string | null }>>` — returns `fail("not_authorized")` when `getMatcherInput` is null. Pairs suggestions to `freeCourts` in court-number order. `players` is the whole pool so the client can render names and swap.
  - `confirmSuggestions(input: ConfirmSuggestionsInput): Promise<ActionResult<{ results: ({ courtId: string; ok: true; matchId: string } | { courtId: string; ok: false; message: string })[] }>>` — validates, then for each match in order calls `supabase.rpc("create_match", …)` sequentially. Before the RPC, query active matches for that match's four participants; if any is busy, skip the RPC and return `message: "<Name> is already in another match."`. On RPC error return `failFromRpc(error).message` for that match (the JB017 guard and the court-reservation index are the atomic backstops; the pre-check only exists to name the player). Always `revalidatePath(`/sessions/${sessionId}/manage`)` once at the end.
- No unit test: logic is orchestration over tested pieces; covered by Step 2 below.

- [ ] **Step 1: Implement both actions** in `lib/actions/matcher.ts` following the structure of `lib/actions/matches.ts` (`"use server"`, `getCurrentUser` guard, zod first).
- [ ] **Step 2: Verify against local Supabase** with a throwaway script or the UI from Task 6: with 2 checked-in players already in a `scheduled` match, confirm a suggestion containing one of them and check that match reports the player's name while the others in the batch still succeed.
- [ ] **Step 3: Run** `npx tsc --noEmit && npm run lint` — expect clean.
- [ ] **Step 4: Commit** `feat: add generate and confirm actions for suggested matches`

---

### Task 6: Auto-match panel UI

**Files:**
- Create: `components/sessions/auto-match-panel.tsx`
- Modify: `app/(app)/sessions/[id]/manage/page.tsx` (render above `<MatchPanel …/>` inside the `matches` tab wrapper)

**Interfaces:**
- Consumes: Task 3 helpers, Task 5 actions, `courtLabel` from `lib/court-label.ts`, shadcn `Button`, `Select`, `Badge`.
- Produces: `export function AutoMatchPanel({ sessionId }: { sessionId: string })` (client component; no server props needed because generate fetches fresh pool).

Behaviour (each item is a thing the implementer must see working):
- Format `Select` (Men's double / Women's double / Mixed double) + "Generate" button.
- Result list: one card per suggestion headed by `courtLabel(courtNumber)`, four player buttons (team 1 vs team 2). Unrated players show a `?` badge. No level or gender text is rendered.
- Swap: tap one player (highlighted), tap another player or an entry in an "Unused players" list; use `swapPlayers`. Selection clears after the swap.
- Per-card "Discard" removes the card (court becomes unassigned, its four players go to unused). `lineupWarnings` shown as amber text on a card; does not block confirm.
- "Regenerate" re-calls `generateSuggestions` (fresh `rng` jitter) and replaces the list; "Confirm all" calls `confirmSuggestions` with the current cards.
- After confirm: success toast per created match, error toast with the returned message per rejected match; rejected cards stay in the list, created ones are removed. `reason` from the result is shown as muted text when fewer matches than courts.
- Touch targets `h-11` and stacked on mobile, matching `match-panel.tsx`.

- [ ] **Step 1: Implement the component and wire it into the manage page.**
- [ ] **Step 2: Run** `npx tsc --noEmit && npm run lint` — expect clean.
- [ ] **Step 3: Verify in the browser** (`run` skill) with a session of 8+ checked-in players, 2 idle courts: generate each format; swap two players across cards; discard one card; confirm and see the matches appear in the `MatchPanel` list as `Scheduled`; generate again and confirm those players are no longer in the pool; open a second tab, create a manual match with one suggested player, confirm in the first tab and see that match rejected with the player's name. Check the page at phone width.
- [ ] **Step 4: Verify privacy:** in devtools Network, inspect the `generateSuggestions` response; it must contain `weight`/`unrated` only as the matcher needs, and the member session (non-host account) must get `not_authorized`. If the response must not carry `weight`, strip it in the action before returning and say so in the commit.
- [ ] **Step 5: Run the full suite** `npm run test:unit && supabase test db` — expect all PASS.
- [ ] **Step 6: Commit** `feat: add host auto-match panel`

---

## Self-Review

- **Spec coverage:** flow (T5, T6); pool incl. busy exclusion (T4); `suggestMatches` hard rules and soft costs (T2); fewer-matches-than-courts messaging (T2, T6); confirm busy re-check with named player (T1 atomic backstop, T5 naming); host swap/discard/regenerate (T3, T6); level never member-visible (Global Constraints, T6 Step 4); weights in one place (T2 `MATCH_WEIGHTS`). Spec test list: unit tests T2, pool in T4 (verified in browser, T6), confirm rejection T1/T5/T6; RLS tests were Phase 1.
- **Decision beyond the spec:** busy rule is enforced in `guard_match_player` (T1), not only in the action. This also tightens manual `create_match`, which the rotation queue already assumes. Spec's "Open items": initial weights chosen in T2; candidates searched = exhaustive per court, capped at 40 players.
- **Types:** `SuggestedMatch`, `PoolPlayer`, `PastMatch`, `MatchFormat` defined in T2 and used unchanged in T3-T5.
- **Future-tier impact:** `suggestMatches` stays reusable for automatic rotation (🟢); confirm remains a separate step, so rule 3 holds.
