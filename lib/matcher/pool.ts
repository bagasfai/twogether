import type { Gender } from "@/lib/players/levels";
import type { PlayerAttributes } from "@/lib/players/resolve";
import type { PoolPlayer } from "@/lib/matcher/types";

export type RosterRow = {
  id: string;
  guest_name: string | null;
  profiles: { full_name: string | null } | null;
};

export function displayName(fullName: string | null | undefined, guestName: string | null | undefined): string | null {
  return fullName ?? guestName ?? null;
}

// Rule 4: the pool is checked-in participants, minus anyone already in a
// scheduled or in_progress match. The caller has already limited `roster` to
// confirmed, checked-in rows; busy exclusion lives here so it can be tested
// without a database.
export function buildPool(
  roster: RosterRow[],
  busyIds: ReadonlySet<string>,
  gamesById: ReadonlyMap<string, number>,
  attributes: ReadonlyMap<string, Pick<PlayerAttributes, "gender" | "unrated" | "weight">>,
  unratedWeight: number,
): PoolPlayer[] {
  return roster
    .filter((row) => !busyIds.has(row.id))
    .map((row) => {
      const attrs = attributes.get(row.id);
      return {
        participantId: row.id,
        name: displayName(row.profiles?.full_name, row.guest_name) ?? "Unnamed player",
        gender: (attrs?.gender ?? null) as Gender | null,
        weight: attrs?.weight ?? unratedWeight,
        unrated: attrs?.unrated ?? true,
        gamesPlayed: gamesById.get(row.id) ?? 0,
      };
    });
}

// After JB017 the generic RPC message does not say who is busy; name them when
// the lookup found someone, else keep the generic message.
export function busyPlayerMessage(name: string | null, fallback: string): string {
  return name ? `${name} is already in another match.` : fallback;
}
