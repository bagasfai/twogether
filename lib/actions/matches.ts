"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { createMatchSchema, matchIdSchema } from "@/lib/validation/matches";

export async function createMatch(input: {
  sessionId: string;
  courtId: string;
  team1: string[];
  team2: string[];
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createMatchSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // create_match is the only write path that inserts a match together with
  // its match_players in one transaction -- it also owns the court-reservation
  // race guard (matches_reserved_court_idx) and the checked-in/same-session
  // check (guard_match_player fires on the match_players inserts).
  const { data, error } = await supabase.rpc("create_match", {
    p_session_id: parsed.data.sessionId,
    p_court_id: parsed.data.courtId,
    p_team1: parsed.data.team1,
    p_team2: parsed.data.team2,
  });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok({ id: data.id });
}

export async function startMatch(input: { matchId: string; sessionId: string }): Promise<ActionResult<null>> {
  const parsed = matchIdSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // start_match keeps the match's scheduled->in_progress flip and the
  // court's idle->in_use flip in one transaction. Never split this into two
  // client-side updates -- that reopens the window this RPC exists to close.
  const { error } = await supabase.rpc("start_match", { p_match_id: parsed.data.matchId });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}

export async function completeMatch(input: { matchId: string; sessionId: string }): Promise<ActionResult<null>> {
  const parsed = matchIdSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { error } = await supabase.rpc("complete_match", { p_match_id: parsed.data.matchId });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}

// Not an RPC: cancelling a still-scheduled match is a single-table status
// flip (match_status already has 'cancelled'). It never held the court --
// under the reserve-at-creation model the court's own status only changes at
// start/complete -- so there is nothing else to keep in sync.
export async function cancelMatch(input: { matchId: string; sessionId: string }): Promise<ActionResult<null>> {
  const parsed = matchIdSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("matches")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.matchId)
    .eq("session_id", parsed.data.sessionId)
    .eq("status", "scheduled");

  if (error) return fail("unknown", "Could not cancel the match.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}
