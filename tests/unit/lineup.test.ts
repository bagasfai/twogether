import { describe, expect, it } from "vitest";
import { lineupWarnings, swapPlayers } from "@/lib/matcher/lineup";
import type { PoolPlayer, SuggestedMatch } from "@/lib/matcher/types";
import type { Gender } from "@/lib/players/levels";

const player = (id: string, gender: Gender | null): PoolPlayer => ({
  participantId: id,
  name: id,
  gender,
  weight: 3,
  unrated: false,
  gamesPlayed: 0,
});

const byId = (...players: PoolPlayer[]) => new Map(players.map((x) => [x.participantId, x]));

const twoMatches = (): SuggestedMatch[] => [
  { team1: ["a", "b"], team2: ["c", "d"] },
  { team1: ["e", "f"], team2: ["g", "h"] },
];

describe("swapPlayers", () => {
  it("swaps two slots within a match", () => {
    const out = swapPlayers(twoMatches(), [], { matchIndex: 0, team: 1, position: 0 }, { matchIndex: 0, team: 2, position: 1 });
    expect(out.matches[0]).toEqual({ team1: ["d", "b"], team2: ["c", "a"] });
    expect(out.matches[1]).toEqual(twoMatches()[1]);
  });

  it("swaps two slots across matches", () => {
    const out = swapPlayers(twoMatches(), [], { matchIndex: 0, team: 1, position: 1 }, { matchIndex: 1, team: 2, position: 0 });
    expect(out.matches[0].team1).toEqual(["a", "g"]);
    expect(out.matches[1].team2).toEqual(["b", "h"]);
  });

  it("swapping with an unused player moves the displaced player into unused", () => {
    const out = swapPlayers(twoMatches(), ["z", "y"], { matchIndex: 0, team: 1, position: 0 }, "unused", "y");
    expect(out.matches[0].team1).toEqual(["y", "b"]);
    expect(out.unused).toEqual(["z", "a"]);
  });

  it("does not mutate its inputs", () => {
    const matches = twoMatches();
    const unused = ["z"];
    swapPlayers(matches, unused, { matchIndex: 0, team: 1, position: 0 }, "unused", "z");
    expect(matches).toEqual(twoMatches());
    expect(unused).toEqual(["z"]);
  });
});

describe("lineupWarnings", () => {
  const m = (...g: Gender[]) => ({
    ms: { team1: ["p1", "p2"], team2: ["p3", "p4"] } as SuggestedMatch,
    lookup: byId(...g.map((x, i) => player(`p${i + 1}`, x))),
  });

  it("is empty for valid lineups in every format", () => {
    const mens = m("male", "male", "male", "male");
    expect(lineupWarnings(mens.ms, "mens", mens.lookup)).toEqual([]);
    const womens = m("female", "female", "female", "female");
    expect(lineupWarnings(womens.ms, "womens", womens.lookup)).toEqual([]);
    const mixed = m("male", "female", "female", "male");
    expect(lineupWarnings(mixed.ms, "mixed", mixed.lookup)).toEqual([]);
  });

  it("warns for a woman in a men's double", () => {
    const x = m("male", "male", "female", "male");
    expect(lineupWarnings(x.ms, "mens", x.lookup).join(" ")).toContain("men");
  });

  it("warns when teammates share a gender in a mixed double", () => {
    const x = m("male", "male", "female", "female");
    expect(lineupWarnings(x.ms, "mixed", x.lookup).join(" ")).toContain("one man and one woman");
  });

  it("warns for a player with no gender", () => {
    const x = m("male", "male", "male", "male");
    x.lookup.set("p4", player("p4", null));
    expect(lineupWarnings(x.ms, "mens", x.lookup).join(" ")).toContain("gender");
  });
});
