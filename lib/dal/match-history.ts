import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import { listMatches, type MatchEntry } from "@/lib/dal/matches";
import { completedInOrder } from "@/lib/stats";

export type MatchHistory = {
  sessionId: string;
  sessionTitle: string;
  matches: MatchEntry[];
};

// Null means "not yours to see": the session is invisible to the caller, or the
// caller is neither a host/admin nor a non-cancelled participant (including a
// guest they registered). RLS alone would let any signed-in member read the
// matches of a public session; the narrower rule is enforced here. Callers
// turn null into a 404 so a stranger learns nothing about the session.
export async function getMatchHistory(sessionId: string): Promise<MatchHistory | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, title")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session) return null;

  let allowed = user.role === "admin" || (await getHostSession(sessionId)) !== null;

  if (!allowed) {
    const { data: mine, error: mineError } = await supabase
      .from("participants")
      .select("id")
      .eq("session_id", sessionId)
      .neq("status", "cancelled")
      .or(`user_id.eq.${user.id},registered_by.eq.${user.id}`)
      .limit(1);
    if (mineError) throw mineError;
    allowed = (mine ?? []).length > 0;
  }
  if (!allowed) return null;

  return {
    sessionId: session.id,
    sessionTitle: session.title,
    matches: completedInOrder(await listMatches(sessionId)),
  };
}
