"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getMatcherInput } from "@/lib/dal/matcher";
import { busyPlayerMessage, displayName } from "@/lib/matcher/pool";
import { suggestMatches } from "@/lib/matcher/suggest";
import type { PoolPlayer, SuggestedMatch } from "@/lib/matcher/types";
import { SKILL_LEVELS, type SkillLevel } from "@/lib/players/levels";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import {
  confirmSuggestionsSchema,
  generateSuggestionsSchema,
  type ConfirmSuggestionsInput,
  type GenerateSuggestionsInput,
} from "@/lib/validation/matcher";

// What the host UI needs to render and edit a suggestion. `weight` and
// `gamesPlayed` stay on the server; `level` is the weight shown as a label.
export type SuggestionPlayer = Pick<PoolPlayer, "participantId" | "name" | "gender" | "unrated"> & { level: SkillLevel | null };

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
    players: matcherInput.pool.map(({ participantId, name, gender, unrated, weight }) => ({
      participantId,
      name,
      gender,
      unrated,
      level: unrated ? null : SKILL_LEVELS[weight - 1] ?? null,
    })),
    unused: result.unused,
    reason,
  });
}

// One create_match RPC per suggested match so a stale one (court taken, player
// now busy) is rejected on its own and the rest still go through. The RPC is
// the only gate: it checks the host first (JB007), locks the players in id
// order, and guard_match_player raises JB017 for a busy one. The lookup below
// runs only after JB017, purely to name the player in the message.
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

    const { data, error } = await supabase.rpc("create_match", {
      p_session_id: sessionId,
      p_court_id: match.courtId,
      p_team1: match.team1,
      p_team2: match.team2,
    });

    if (!error) {
      results.push({ courtId: match.courtId, ok: true, matchId: data.id });
      continue;
    }

    const failure = failFromRpc(error);
    let message = failure.message;
    if (failure.code === "player_busy") {
      message = busyPlayerMessage(await findBusyPlayerName(supabase, ids), message);
    }
    results.push({ courtId: match.courtId, ok: false, message });
  }

  revalidatePath(`/sessions/${sessionId}/manage`);
  return ok({ results });
}

async function findBusyPlayerName(supabase: Awaited<ReturnType<typeof createClient>>, participantIds: string[]): Promise<string | null> {
  const { data } = await supabase
    .from("match_players")
    .select("matches!inner(status), participants!inner(guest_name, profiles!participants_user_id_fkey(full_name))")
    .in("participant_id", participantIds)
    .in("matches.status", ["scheduled", "in_progress"])
    .limit(1);
  const row = data?.[0];
  return row ? displayName(row.participants.profiles?.full_name, row.participants.guest_name) : null;
}
