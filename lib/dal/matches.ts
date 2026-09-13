import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Database } from "@/types/supabase";

export type MatchStatus = Database["public"]["Enums"]["match_status"];

export type MatchPlayer = {
  participantId: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type MatchEntry = {
  id: string;
  courtId: string | null;
  courtNumber: number | null;
  status: MatchStatus;
  startedAt: string | null;
  completedAt: string | null;
  team1: MatchPlayer[];
  team2: MatchPlayer[];
};

export async function listMatches(sessionId: string): Promise<MatchEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, court_id, status, started_at, completed_at,
       courts(court_number),
       match_players(team, participants(id, profiles!participants_user_id_fkey(full_name, avatar_url)))`,
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const team1: MatchPlayer[] = [];
    const team2: MatchPlayer[] = [];

    for (const mp of row.match_players) {
      const player: MatchPlayer = {
        participantId: mp.participants.id,
        fullName: mp.participants.profiles.full_name,
        avatarUrl: mp.participants.profiles.avatar_url,
      };
      (mp.team === 1 ? team1 : team2).push(player);
    }

    return {
      id: row.id,
      courtId: row.court_id,
      courtNumber: row.courts?.court_number ?? null,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      team1,
      team2,
    };
  });
}
