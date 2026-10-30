import type { Gender } from "@/lib/players/levels";
import type { MatchFormat, PastMatch, PoolPlayer, SuggestedMatch, SuggestResult } from "@/lib/matcher/types";

// Tunable in one place. Costs are summed per candidate match; lowest wins.
export const MATCH_WEIGHTS = {
  skillGap: 3, // per point of difference between the two teams' level sums
  gamesPlayed: 1, // per game already played by each of the four players
  repeatPartner: 2, // per earlier game a team's two players already shared a team
  repeatOpponent: 1, // per earlier game two opposing players already faced each other
  jitter: 0.5, // random noise so "regenerate" can pick a different near-best lineup
} as const;

// Exhaustive search per court is C(n,4) groups (or C(n,2)^2 for mixed); capping
// n keeps that bounded. Mixed caps each gender so one cannot crowd out the other.
const MAX_ELIGIBLE = 40;
const MAX_ELIGIBLE_PER_GENDER = 20;

type Split = { team1: [PoolPlayer, PoolPlayer]; team2: [PoolPlayer, PoolPlayer] };

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function countPairs(history: PastMatch[]) {
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const bump = (map: Map<string, number>, a: string, b: string) => map.set(pairKey(a, b), (map.get(pairKey(a, b)) ?? 0) + 1);
  for (const m of history) {
    for (const team of [m.team1, m.team2]) {
      for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) bump(partners, team[i], team[j]);
    }
    for (const a of m.team1) for (const b of m.team2) bump(opponents, a, b);
  }
  return { partners, opponents };
}

function* combinations<T>(items: T[], k: number): Generator<T[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (items.length < k) return;
  while (true) {
    yield idx.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === items.length - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function* splitsFor(format: MatchFormat, eligible: PoolPlayer[]): Generator<Split> {
  if (format === "mixed") {
    const men = eligible.filter((x) => x.gender === "male");
    const women = eligible.filter((x) => x.gender === "female");
    for (const [m1, m2] of combinations(men, 2)) {
      for (const [f1, f2] of combinations(women, 2)) {
        yield { team1: [m1, f1], team2: [m2, f2] };
        yield { team1: [m1, f2], team2: [m2, f1] };
      }
    }
    return;
  }
  for (const [a, b, c, d] of combinations(eligible, 4)) {
    yield { team1: [a, b], team2: [c, d] };
    yield { team1: [a, c], team2: [b, d] };
    yield { team1: [a, d], team2: [b, c] };
  }
}

function shortfall(format: MatchFormat, remaining: PoolPlayer[]): string {
  const missing = (g: Gender, needed: number) => Math.max(0, needed - remaining.filter((x) => x.gender === g).length);
  const more = (n: number, one: string, many: string) => `${n} more ${n === 1 ? one : many}`;
  if (format === "mixed") {
    const parts = [
      missing("male", 2) > 0 ? more(missing("male", 2), "man", "men") : null,
      missing("female", 2) > 0 ? more(missing("female", 2), "woman", "women") : null,
    ].filter((x): x is string => x !== null);
    return `Need ${parts.join(" and ")} for a mixed double.`;
  }
  if (format === "mens") return `Need ${more(missing("male", 4), "man", "men")} for a men's double.`;
  return `Need ${more(missing("female", 4), "woman", "women")} for a women's double.`;
}

function selectEligible(format: MatchFormat, remaining: PoolPlayer[]): PoolPlayer[] {
  const byGames = (a: PoolPlayer, b: PoolPlayer) =>
    a.gamesPlayed - b.gamesPlayed || (a.participantId < b.participantId ? -1 : 1);
  const of = (g: Gender) => remaining.filter((x) => x.gender === g).sort(byGames);
  if (format === "mixed") return [...of("male").slice(0, MAX_ELIGIBLE_PER_GENDER), ...of("female").slice(0, MAX_ELIGIBLE_PER_GENDER)];
  return of(format === "mens" ? "male" : "female").slice(0, MAX_ELIGIBLE);
}

export function suggestMatches(input: {
  pool: PoolPlayer[];
  format: MatchFormat;
  courtCount: number;
  history: PastMatch[];
  rng?: () => number;
}): SuggestResult {
  const { pool, format, courtCount, history } = input;
  const rng = input.rng ?? Math.random;
  const { partners, opponents } = countPairs(history);

  let remaining = [...pool];
  const matches: SuggestedMatch[] = [];

  while (matches.length < courtCount) {
    const eligible = selectEligible(format, remaining);

    let best: Split | null = null;
    let bestCost = Infinity;
    for (const split of splitsFor(format, eligible)) {
      const [a, b] = split.team1;
      const [c, d] = split.team2;
      const gap = Math.abs(a.weight + b.weight - (c.weight + d.weight));
      const games = a.gamesPlayed + b.gamesPlayed + c.gamesPlayed + d.gamesPlayed;
      const repeatP = (partners.get(pairKey(a.participantId, b.participantId)) ?? 0) + (partners.get(pairKey(c.participantId, d.participantId)) ?? 0);
      const repeatO = [a, b].reduce(
        (sum, x) => sum + [c, d].reduce((s, y) => s + (opponents.get(pairKey(x.participantId, y.participantId)) ?? 0), 0),
        0,
      );
      const cost =
        MATCH_WEIGHTS.skillGap * gap +
        MATCH_WEIGHTS.gamesPlayed * games +
        MATCH_WEIGHTS.repeatPartner * repeatP +
        MATCH_WEIGHTS.repeatOpponent * repeatO +
        MATCH_WEIGHTS.jitter * rng();
      if (cost < bestCost) {
        bestCost = cost;
        best = split;
      }
    }

    if (!best) break;
    const used = new Set([...best.team1, ...best.team2].map((x) => x.participantId));
    matches.push({
      team1: [best.team1[0].participantId, best.team1[1].participantId],
      team2: [best.team2[0].participantId, best.team2[1].participantId],
    });
    remaining = remaining.filter((x) => !used.has(x.participantId));
  }

  const reason = courtCount > 0 && matches.length < courtCount ? shortfall(format, remaining) : null;
  return { matches, unused: remaining.map((x) => x.participantId), reason };
}
