# Skill Levels, Match Stats, and Auto-Match Suggestions — Design

Date: 2026-10-26
Status: Draft for review

## Purpose

Hosts currently pair players by hand during live sessions. This feature lets a host tap "generate" and receive a skill-balanced, gender-valid set of suggested matches for the free courts, which the host can edit and confirm. Supporting it requires a member skill level, gender data, a per-player games-played count, and match history.

Success: a host can produce a valid lineup for all free courts in one action, adjust it, and confirm it, without any player appearing in two matches or being paired in a way that breaks the gender rules of the chosen format.

## Scope and tier note

`CLAUDE.md` §6 lists automatic match generation and skill balancing under 🟢 Future. This work was explicitly requested by the product owner on 2026-10-26, so it is in scope. Two constraints keep it consistent with the architecture rules:

- Suggestions never commit anything. The host confirms, so hosts retain manual override (rule 3).
- The matcher operates on the checked-in pool, not the registration list (rule 4).

The leaderboard and match history are not in the §6 tiers. They sit closest to session history (🟠) and community stats (🔵) and are treated as small add-ons that share the games-played count the matcher needs.

Out of scope: recording scores or winners, automatic rotation, tournaments, and any change to registration or waitlist logic. Scores and winners would be 🟢 Future and would need a schema change to `matches`.

## Delivery phases

One spec, three phases, each with its own implementation plan:

1. Foundations: gender, levels, guest attributes, host editing UI.
2. Stats: games-played count, per-session and all-time leaderboards, match history.
3. Matcher: suggestion function and the host generate-and-confirm flow.

Each phase depends only on the ones before it.

## Phase 1 — Foundations

### Data model

- `profiles_private.gender`: new enum `gender` (`male`, `female`), nullable. The member sets their own value through the existing self-update policy. Hosts of a session the member is registered in can already read `profiles_private`, so no new read policy is needed.
- `member_levels(user_id uuid primary key references profiles, level skill_level not null, set_by uuid references profiles, updated_at timestamptz)`.
- New enum `skill_level`: `newbie`, `beginner`, `novice`, `intermediate`, `advanced`. The matcher maps these to ascending integers 1–5.
- `participants.guest_gender` (`gender`, nullable) and `participants.guest_level` (`skill_level`, nullable). These are only meaningful when `guest_name` is set.

### Authorization

- `member_levels`: RLS enabled, all privileges revoked from `anon` and `authenticated`, then select/insert/update granted to `authenticated` with policies that allow only `is_admin()` or a user who hosts at least one session. Members have no read path, including to their own row. `profiles` is not modified, because `profiles_select_authenticated` is `using (true)` and would expose the level to everyone.
- `participants.guest_gender` and `guest_level` follow the existing `participants` policies. Confirm during planning that members cannot read other participants' guest columns; if the current select policy allows it, expose them through a host-only view instead of the base table.
- Level must not appear in any member-facing query, view, realtime payload, or leaderboard.

### Resolution rules

- Registered member: gender from `profiles_private.gender`, level from `member_levels`.
- Guest: gender and level from `participants.guest_gender` and `participants.guest_level`.
- Missing level: the player is "unrated". The UI shows a "?" badge and the matcher uses a provisional mid weight (3).
- Missing gender: the player is excluded from gendered formats until set. The UI says why.

### Host UI

- Gender and level are editable inline on the participant row, at check-in and at any time during the session.
- A level change for a registered member writes to `member_levels` and is permanent. A change for a guest writes to `participants` and applies to that session only.
- Gender is required when checking in a guest. Level is optional.

### Types

Regenerate `types/supabase.ts` after the migration.

## Phase 2 — Stats

### Games played

A SQL view counts completed `match_players` per participant, joined to `matches` where `status = 'completed'`. It returns `participant_id`, `session_id`, `games_played`. The existing rotation DAL only derives `lastPlayedAt`; this view adds the count.

### Leaderboards

- Per-session (hosts): shown in the live session panel, ordered by games played. Includes guests by `guest_name`.
- All-time (members): registered members only, aggregated by `user_id` across sessions. Readable by any logged-in member. Exposes display name and games played only. Guests are excluded because they have no profile.
- Neither board exposes level or gender.

### Match history

- A session view lists completed matches in order with court, completed time, and the names on team 1 versus team 2. No scores.
- Hosts see the history of sessions they host. Members see the history of sessions in which they were a non-cancelled participant. Guests appear by `guest_name`.
- RLS on `matches` and `match_players` already controls reads; the planning step must verify the member-facing access and add policies only if needed.

## Phase 3 — Matcher

### Flow

1. The host chooses a format: men's double, women's double, or mixed double.
2. The host taps "generate". A server action loads the pool and calls the matcher.
3. The UI shows one suggested match per free court. The host can swap players, discard a suggestion, or regenerate.
4. On confirm, the server action creates the matches through the existing match-creation path.

### Pool

Checked-in participants (`checked_in_at` not null) who are not in any match with status `scheduled` or `in_progress`. This reuses the busy-set logic in `lib/dal/rotation.ts`. Within a single generation, each player is used at most once, so no player is suggested for two courts.

### `suggestMatches`

A pure TypeScript function with no database access: `suggestMatches(pool, format, courtCount, history)` returns an array of matches, each with two teams of two players.

Hard rules:

- Men's double: four male players. Women's double: four female players.
- Mixed double: two men and two women, with one man and one woman on each team. Two players of the same gender never share a team.
- Players with missing gender are excluded from every format.

Soft cost, minimised by searching many candidate lineups and keeping the best:

- Skill gap between the two teams' level sums.
- Games-played imbalance: players with fewer games played are preferred.
- Repeated partners or opponents, taken from completed-match history in the session.

The weights are constants in one place so they can be tuned without changing the structure. If the pool cannot fill every court for the chosen format, the function returns fewer matches and the UI says so.

### Confirm

Confirm re-checks that no suggested player has become busy since the suggestion was made. This check is needed because the existing `guard_match_player` trigger verifies only check-in and session membership, not whether the player is already in another active match. If any player is now busy, the confirm is rejected for that match and the host is told which player.

### Fairness limits

Fairness across skill, play time, and variety trades off against itself. The matcher is a heuristic. It is not guaranteed optimal, and the host is expected to review every suggestion.

## Testing

- Unit tests for `suggestMatches`: each format's gender rules, mixed pairing, unrated players, fewer players than courts, no player used twice, preference for fewer games played, avoidance of repeat partners.
- Pool test: players in `scheduled` or `in_progress` matches are never suggested.
- RLS tests: a member cannot read `member_levels`, including their own row; a host and an admin can; level does not appear in leaderboard or history queries.
- Confirm test: a player who became busy after generation causes a rejection.

## Future-tier impact

- Recording scores or winners (🟢) would add columns to `matches` and enable win/loss stats. Nothing here blocks it.
- Fully automatic rotation (🟢) could reuse `suggestMatches`, but would need to drop the host-confirm step, which conflicts with rule 3 unless a manual override stays available.

## Open items for planning

- Confirm whether the current `participants` select policy exposes `guest_gender` and `guest_level` to members.
- Confirm member read access to `matches` and `match_players` for the history view.
- Choose initial cost weights and the number of candidate lineups searched.
