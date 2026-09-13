import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { sortRotationQueue } from "@/lib/rotation/queue";

export type RotationEntry = {
  participantId: string;
  fullName: string | null;
  avatarUrl: string | null;
  checkedInAt: string;
  lastPlayedAt: string | null;
};

// Read-only fairness ordering, not a concurrency-sensitive decision (unlike
// registration/waitlist), so a plain app-layer join is fine here -- no RPC.
// See docs/superpowers/specs/2026-09-13-player-rotation-design.md.
export async function getRotationQueue(sessionId: string): Promise<RotationEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const [rosterResult, lastPlayedResult, busyResult] = await Promise.all([
    supabase
      .from("participants")
      .select("id, checked_in_at, profiles!participants_user_id_fkey(full_name, avatar_url)")
      .eq("session_id", sessionId)
      .eq("status", "confirmed")
      .not("checked_in_at", "is", null),
    supabase
      .from("match_players")
      .select("participant_id, matches!inner(status, completed_at, session_id)")
      .eq("matches.session_id", sessionId)
      .eq("matches.status", "completed"),
    supabase
      .from("match_players")
      .select("participant_id, matches!inner(status, session_id)")
      .eq("matches.session_id", sessionId)
      .in("matches.status", ["scheduled", "in_progress"]),
  ]);

  if (rosterResult.error) throw rosterResult.error;
  if (lastPlayedResult.error) throw lastPlayedResult.error;
  if (busyResult.error) throw busyResult.error;

  const lastPlayedByParticipant = new Map<string, string>();
  for (const row of lastPlayedResult.data ?? []) {
    if (!row.matches.completed_at) continue;
    const existing = lastPlayedByParticipant.get(row.participant_id);
    if (!existing || row.matches.completed_at > existing) {
      lastPlayedByParticipant.set(row.participant_id, row.matches.completed_at);
    }
  }

  const busyParticipantIds = new Set((busyResult.data ?? []).map((row) => row.participant_id));

  const candidates = (rosterResult.data ?? [])
    .filter((row) => row.checked_in_at !== null && !busyParticipantIds.has(row.id))
    .map((row) => ({
      participantId: row.id,
      fullName: row.profiles.full_name,
      avatarUrl: row.profiles.avatar_url,
      checkedInAt: row.checked_in_at as string,
      lastPlayedAt: lastPlayedByParticipant.get(row.id) ?? null,
    }));

  return sortRotationQueue(candidates);
}
