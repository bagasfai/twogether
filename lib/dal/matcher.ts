import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import { getRosterAttributes } from "@/lib/dal/player-attributes";
import { listCourts } from "@/lib/dal/courts";
import { listMatches } from "@/lib/dal/matches";
import { levelWeight } from "@/lib/players/levels";
import { buildPool } from "@/lib/matcher/pool";
import type { PastMatch, PoolPlayer } from "@/lib/matcher/types";

export type MatcherInput = {
  pool: PoolPlayer[];
  freeCourts: { id: string; courtNumber: number }[];
  history: PastMatch[];
};

// Host/admin only: it reads level and gender. Null means the caller does not
// host the session (or is signed out) -- callers turn that into not_authorized.
//
// The pool is the checked-in, confirmed participants who are not already in a
// scheduled or in_progress match (rule 4: the checked-in pool, not the
// registration list). Same busy-set shape as lib/dal/rotation.ts.
export async function getMatcherInput(sessionId: string): Promise<MatcherInput | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await getHostSession(sessionId))) return null;

  const supabase = await createClient();

  const [roster, busy, games, attributes, courts, matches] = await Promise.all([
    supabase
      .from("participants")
      .select("id, guest_name, profiles!participants_user_id_fkey(full_name)")
      .eq("session_id", sessionId)
      .eq("status", "confirmed")
      .not("checked_in_at", "is", null),
    supabase
      .from("match_players")
      .select("participant_id, matches!inner(status, session_id)")
      .eq("matches.session_id", sessionId)
      .in("matches.status", ["scheduled", "in_progress"]),
    supabase.from("session_games_played").select("participant_id, games_played").eq("session_id", sessionId),
    getRosterAttributes(sessionId),
    listCourts(sessionId),
    listMatches(sessionId),
  ]);

  if (roster.error) throw roster.error;
  if (busy.error) throw busy.error;
  if (games.error) throw games.error;

  const busyIds = new Set((busy.data ?? []).map((row) => row.participant_id));
  const gamesById = new Map((games.data ?? []).flatMap((g) => (g.participant_id ? [[g.participant_id, g.games_played ?? 0] as const] : [])));

  const pool = buildPool(roster.data ?? [], busyIds, gamesById, attributes, levelWeight(null));

  const reservedCourtIds = new Set(
    matches.filter((m) => m.status === "scheduled" || m.status === "in_progress").map((m) => m.courtId),
  );
  const freeCourts = courts
    .filter((c) => c.status === "idle" && !reservedCourtIds.has(c.id))
    .map((c) => ({ id: c.id, courtNumber: c.courtNumber }))
    .sort((a, b) => a.courtNumber - b.courtNumber);

  const history: PastMatch[] = matches
    .filter((m) => m.status === "completed")
    .map((m) => ({ team1: m.team1.map((p) => p.participantId), team2: m.team2.map((p) => p.participantId) }));

  return { pool, freeCourts, history };
}
