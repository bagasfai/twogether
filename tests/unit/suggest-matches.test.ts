import { describe, expect, it } from "vitest";
import { suggestMatches } from "@/lib/matcher/suggest";
import type { MatchFormat, PoolPlayer } from "@/lib/matcher/types";
import type { Gender } from "@/lib/players/levels";

function p(id: string, gender: Gender | null, weight = 3, gamesPlayed = 0): PoolPlayer {
  return { participantId: id, name: id, gender, weight, unrated: false, gamesPlayed };
}

function males(n: number, weight = 3): PoolPlayer[] {
  return Array.from({ length: n }, (_, i) => p(`m${i + 1}`, "male", weight));
}

function run(pool: PoolPlayer[], format: MatchFormat, courtCount: number, history = [] as { team1: string[]; team2: string[] }[], rng = () => 0) {
  return suggestMatches({ pool, format, courtCount, history, rng });
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("suggestMatches", () => {
  it("mens: only male players, two per team", () => {
    const pool = [...males(4), p("f1", "female"), p("f2", "female")];
    const { matches } = run(pool, "mens", 1);
    expect(matches).toHaveLength(1);
    const ids = [...matches[0].team1, ...matches[0].team2].sort();
    expect(ids).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("womens: only female players", () => {
    const pool = [...males(2), p("f1", "female"), p("f2", "female"), p("f3", "female"), p("f4", "female")];
    const { matches } = run(pool, "womens", 1);
    const ids = [...matches[0].team1, ...matches[0].team2].sort();
    expect(ids).toEqual(["f1", "f2", "f3", "f4"]);
  });

  it("mixed: each team has one man and one woman", () => {
    const pool = [p("m1", "male"), p("m2", "male"), p("f1", "female"), p("f2", "female")];
    const { matches } = run(pool, "mixed", 1);
    const gender = new Map(pool.map((x) => [x.participantId, x.gender]));
    for (const team of [matches[0].team1, matches[0].team2]) {
      expect(team.map((id) => gender.get(id)).sort()).toEqual(["female", "male"]);
    }
  });

  it("excludes players with null gender from every format", () => {
    const pool = [...males(4), p("x1", null), p("x2", null), p("x3", null), p("x4", null)];
    const { matches, unused } = run(pool, "mens", 2);
    expect(matches).toHaveLength(1);
    expect([...matches[0].team1, ...matches[0].team2].sort()).toEqual(["m1", "m2", "m3", "m4"]);
    expect(unused).not.toContain("m1");
  });

  it("never uses a player twice across courts", () => {
    const { matches } = run(males(8), "mens", 2);
    const ids = matches.flatMap((m) => [...m.team1, ...m.team2]);
    expect(matches).toHaveLength(2);
    expect(new Set(ids).size).toBe(8);
  });

  it("returns fewer matches than courts when the pool is short, with a reason", () => {
    const { matches, unused, reason } = run(males(5), "mens", 2);
    expect(matches).toHaveLength(1);
    expect(unused).toHaveLength(1);
    expect(reason).toContain("more");
  });

  it("mixed with 3 men and 1 woman returns no matches and names the short gender", () => {
    const pool = [p("m1", "male"), p("m2", "male"), p("m3", "male"), p("f1", "female")];
    const { matches, reason } = run(pool, "mixed", 1);
    expect(matches).toEqual([]);
    expect(reason).toContain("woman");
  });

  it("0 courts returns an empty result with no reason", () => {
    const result = run(males(4), "mens", 0);
    expect(result.matches).toEqual([]);
    expect(result.reason).toBeNull();
    expect(result.unused).toHaveLength(4);
  });

  it("balances skill: weights 5,1,3,3 pair 5+1 against 3+3", () => {
    const pool = [p("a", "male", 5), p("b", "male", 1), p("c", "male", 3), p("d", "male", 3)];
    const { matches } = run(pool, "mens", 1);
    const team = (t: string[]) => t.slice().sort().join("");
    const teams = [team(matches[0].team1), team(matches[0].team2)].sort();
    expect(teams).toEqual(["ab", "cd"]);
  });

  it("prefers players with fewer games played", () => {
    const pool = [
      p("m1", "male", 3, 4),
      p("m2", "male", 3, 4),
      p("m3", "male", 3, 0),
      p("m4", "male", 3, 0),
      p("m5", "male", 3, 0),
      p("m6", "male", 3, 0),
    ];
    const { unused } = run(pool, "mens", 1);
    expect(unused.sort()).toEqual(["m1", "m2"]);
  });

  it("avoids repeating a partner pair seen in history", () => {
    const pool = males(4);
    const { matches } = run(pool, "mens", 1, [{ team1: ["m1", "m2"], team2: ["m3", "m4"] }]);
    const same = (t: string[]) => t.includes("m1") && t.includes("m2");
    expect(same(matches[0].team1) || same(matches[0].team2)).toBe(false);
  });

  it("all unrated players still produce a valid match", () => {
    const pool = males(4).map((x) => ({ ...x, unrated: true }));
    expect(run(pool, "mens", 1).matches).toHaveLength(1);
  });

  it("is deterministic for a fixed rng and varies across rngs", () => {
    const pool = males(8);
    const a = suggestMatches({ pool, format: "mens", courtCount: 2, history: [], rng: seeded(1) });
    const b = suggestMatches({ pool, format: "mens", courtCount: 2, history: [], rng: seeded(1) });
    expect(a).toEqual(b);
    const variants = new Set(
      Array.from({ length: 10 }, (_, i) =>
        JSON.stringify(suggestMatches({ pool, format: "mens", courtCount: 2, history: [], rng: seeded(i + 2) }).matches),
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it("mixed still finds women when many low-game men crowd the pool", () => {
    const pool = [...males(50), p("f1", "female", 3, 9), p("f2", "female", 3, 9)];
    const { matches } = run(pool, "mixed", 1);
    expect(matches).toHaveLength(1);
  });

  it("does not mutate its inputs", () => {
    const pool = males(5);
    const history = [{ team1: ["m1", "m2"], team2: ["m3", "m4"] }];
    const poolCopy = JSON.stringify(pool);
    const historyCopy = JSON.stringify(history);
    run(pool, "mens", 1, history);
    expect(JSON.stringify(pool)).toBe(poolCopy);
    expect(JSON.stringify(history)).toBe(historyCopy);
  });
});
