import type { Database } from "@/types/supabase";

// Hide the whole strip until the community has this many completed sessions;
// a code constant (not env) so changing it is a reviewed change.
export const STATS_MIN_SESSIONS = 10;

export type CommunityStats = {
  sessionsHeld: number;
  matchesPlayed: number;
  totalCheckins: number;
  activeMembers: number;
};

type StatsRow =
  Database["public"]["Functions"]["public_community_stats"]["Returns"][number];

export function shouldShowStats(stats: CommunityStats): boolean {
  return stats.sessionsHeld >= STATS_MIN_SESSIONS;
}

// The RPC's bigint columns arrive as JSON numbers; counts are far below
// Number.MAX_SAFE_INTEGER. A missing row is an error, never "zero stats".
export function toCommunityStats(row: StatsRow | undefined): CommunityStats {
  if (!row) throw new Error("public_community_stats returned no row");
  return {
    sessionsHeld: Number(row.sessions_held),
    matchesPlayed: Number(row.matches_played),
    totalCheckins: Number(row.total_checkins),
    activeMembers: Number(row.active_members),
  };
}
