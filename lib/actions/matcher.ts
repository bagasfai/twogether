"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getMatcherInput } from "@/lib/dal/matcher";
import { suggestMatches } from "@/lib/matcher/suggest";
import type { PoolPlayer, SuggestedMatch } from "@/lib/matcher/types";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import {
  confirmSuggestionsSchema,
  generateSuggestionsSchema,
  type ConfirmSuggestionsInput,
  type GenerateSuggestionsInput,
} from "@/lib/validation/matcher";

// What the host UI needs to render and edit a suggestion. `weight` (a stand-in
// for skill level) and `gamesPlayed` stay on the server.
export type SuggestionPlayer = Pick<PoolPlayer, "participantId" | "name" | "gender" | "unrated">;

export type Suggestion = SuggestedMatch & { courtId: string; courtNumber: number };

export type GenerateResult = {
  suggestions: Suggestion[];
  players: SuggestionPlayer[];
  unused: string[];
  reason: string | null;
};

export type ConfirmOutcome =
  | { courtId: string; ok: true; matchId: string }
  | { courtId: string; ok: false; message: string };

// Read-only: nothing is written until the host confirms (rule 3).
export async function generateSuggestions(input: GenerateSuggestionsInput): Promise<ActionResult<GenerateResult>> {
  const parsed = generateSuggestionsSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const matcherInput = await getMatcherInput(parsed.data.sessionId);
  if (!matcherInput) return fail("not_authorized");

  const result = suggestMatches({
    pool: matcherInput.pool,
    format: parsed.data.format,
    courtCount: matcherInput.freeCourts.length,
    history: matcherInput.history,
  });

  const suggestions = result.matches.map((m, i) => ({
    ...m,
    courtId: matcherInput.freeCourts[i].id,
    courtNumber: matcherInput.freeCourts[i].courtNumber,
  }));

  const reason =
    matcherInput.freeCourts.length === 0 ? "There are no free courts." : result.reason;

  return ok({
    suggestions,
    players: matcherInput.pool.map(({ participantId, name, gender, unrated }) => ({ participantId, name, gender, unrated })),
    unused: result.unused,
    reason,
  });
}

// One create_match RPC per suggested match so a stale one (court taken, player
// now busy) is rejected on its own and the rest still go through. The busy
// pre-check below only exists to name the player; the JB017 guard in
// guard_match_player and matches_reserved_court_idx are the atomic backstops.
export async function confirmSuggestions(input: ConfirmSuggestionsInput): Promise<ActionResult<{ results: ConfirmOutcome[] }>> {
  const parsed = confirmSuggestionsSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { sessionId, matches } = parsed.data;
  const results: ConfirmOutcome[] = [];

  for (const match of matches) {
    const ids = [...match.team1, ...match.team2];

    const { data: busyRows, error: busyError } = await supabase
      .from("match_players")
      .select("participant_id, matches!inner(status), participants!inner(guest_name, profiles!participants_user_id_fkey(full_name))")
      .in("participant_id", ids)
      .in("matches.status", ["scheduled", "in_progress"]);

    if (busyError) {
      results.push({ courtId: match.courtId, ok: false, message: "Could not check the players. Try again." });
      continue;
    }

    const busy = busyRows?.[0];
    if (busy) {
      const name = busy.participants.profiles?.full_name ?? busy.participants.guest_name ?? "A player";
      results.push({ courtId: match.courtId, ok: false, message: `${name} is already in another match.` });
      continue;
    }

    const { data, error } = await supabase.rpc("create_match", {
      p_session_id: sessionId,
      p_court_id: match.courtId,
      p_team1: match.team1,
      p_team2: match.team2,
    });

    if (error) {
      results.push({ courtId: match.courtId, ok: false, message: failFromRpc(error).message });
    } else {
      results.push({ courtId: match.courtId, ok: true, matchId: data.id });
    }
  }

  revalidatePath(`/sessions/${sessionId}/manage`);
  return ok({ results });
}
