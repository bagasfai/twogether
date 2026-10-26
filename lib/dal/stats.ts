import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { assignRanks, displayName } from "@/lib/stats";

export type SessionLeaderboardRow = {
  participantId: string;
  name: string;
  isGuest: boolean;
  gamesPlayed: number;
  rank: number;
};

export type AllTimeLeaderboardRow = {
  name: string;
  gamesPlayed: number;
  isMe: boolean;
  rank: number;
};

// Host-facing: the manage page is behind requireHost, and session_games_played
// is security_invoker, so RLS bounds what comes back. The view carries counts
// only; names come from a second query keyed by participant id. No level or
// gender is selected anywhere.
export async function getSessionLeaderboard(
  sessionId: string,
): Promise<SessionLeaderboardRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data: counts, error } = await supabase
    .from("session_games_played")
    .select("participant_id, games_played")
    .eq("session_id", sessionId);
  if (error) throw error;
  if (!counts || counts.length === 0) return [];

  const ids = counts.flatMap((c) => (c.participant_id ? [c.participant_id] : []));
  const { data: people, error: peopleError } = await supabase
    .from("participants")
    .select("id, guest_name, profiles!participants_user_id_fkey(full_name)")
    .in("id", ids);
  if (peopleError) throw peopleError;

  const byId = new Map((people ?? []).map((p) => [p.id, p] as const));

  const rows = counts.flatMap((c) => {
    const person = c.participant_id ? byId.get(c.participant_id) : undefined;
    if (!c.participant_id || !person) return [];
    const isGuest = person.guest_name !== null;
    return [
      {
        participantId: c.participant_id,
        name: isGuest ? displayName(person.guest_name) : displayName(person.profiles?.full_name ?? null),
        isGuest,
        gamesPlayed: c.games_played ?? 0,
      },
    ];
  });

  rows.sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name));
  return assignRanks(rows);
}

// Any signed-in member. The RPC is security definer and returns only a display
// name, a count and is_me; guests are excluded in SQL.
export async function getAllTimeLeaderboard(limit = 50): Promise<AllTimeLeaderboardRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("all_time_leaderboard", { p_limit: limit });
  if (error) throw error;

  return assignRanks(
    (data ?? []).map((row) => ({
      name: row.full_name,
      gamesPlayed: row.games_played,
      isMe: row.is_me,
    })),
  );
}
