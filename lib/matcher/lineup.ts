import type { MatchFormat, PoolPlayer, SuggestedMatch } from "@/lib/matcher/types";

export type Slot = { matchIndex: number; team: 1 | 2; position: 0 | 1 };

const teamKey = (slot: Slot) => (slot.team === 1 ? "team1" : "team2");

function cloneMatches(matches: SuggestedMatch[]): SuggestedMatch[] {
  return matches.map((m) => ({ team1: [...m.team1] as [string, string], team2: [...m.team2] as [string, string] }));
}

// Swaps the player in slot `a` with the player in slot `b`, or, when `b` is
// "unused", with `unusedId` from the unused list (the displaced player takes
// that place in the list).
export function swapPlayers(
  matches: SuggestedMatch[],
  unused: string[],
  a: Slot,
  b: Slot | "unused",
  unusedId?: string,
): { matches: SuggestedMatch[]; unused: string[] } {
  const nextMatches = cloneMatches(matches);
  const nextUnused = [...unused];
  const at = nextMatches[a.matchIndex][teamKey(a)];

  if (b === "unused") {
    const at2 = nextUnused.indexOf(unusedId ?? "");
    if (at2 === -1) return { matches: nextMatches, unused: nextUnused };
    const displaced = at[a.position];
    at[a.position] = nextUnused[at2];
    nextUnused[at2] = displaced;
    return { matches: nextMatches, unused: nextUnused };
  }

  const bt = nextMatches[b.matchIndex][teamKey(b)];
  [at[a.position], bt[b.position]] = [bt[b.position], at[a.position]];
  return { matches: nextMatches, unused: nextUnused };
}

export function lineupWarnings(match: SuggestedMatch, format: MatchFormat, byId: Map<string, PoolPlayer>): string[] {
  const warnings: string[] = [];
  const gender = (id: string) => byId.get(id)?.gender ?? null;
  const all = [...match.team1, ...match.team2];

  if (all.some((id) => gender(id) === null)) warnings.push("A player has no gender set.");

  if (format === "mens" && all.some((id) => gender(id) !== null && gender(id) !== "male")) {
    warnings.push("A men's double needs four men.");
  }
  if (format === "womens" && all.some((id) => gender(id) !== null && gender(id) !== "female")) {
    warnings.push("A women's double needs four women.");
  }
  if (format === "mixed") {
    const ok = (team: string[]) => new Set(team.map(gender)).size === 2 && !team.some((id) => gender(id) === null);
    if (!ok(match.team1) || !ok(match.team2)) {
      warnings.push("A mixed double needs one man and one woman on each team.");
    }
  }
  return warnings;
}
