import { describe, expect, it } from "vitest";
import { busyPlayerMessage, buildPool, displayName, type RosterRow } from "@/lib/matcher/pool";
import { suggestMatches } from "@/lib/matcher/suggest";
import type { PoolPlayer } from "@/lib/matcher/types";

const row = (id: string, fullName: string | null, guestName: string | null = null): RosterRow => ({
  id,
  guest_name: guestName,
  profiles: fullName === null ? null : { full_name: fullName },
});

const attrs = new Map([
  ["a", { gender: "male" as const, unrated: false, weight: 5 }],
  ["b", { gender: "female" as const, unrated: false, weight: 2 }],
]);

describe("buildPool", () => {
  it("excludes players in a scheduled or in_progress match", () => {
    const pool = buildPool([row("a", "Ana"), row("b", "Bo"), row("c", "Cy")], new Set(["b"]), new Map(), attrs, 3);
    expect(pool.map((p) => p.participantId)).toEqual(["a", "c"]);
  });

  it("returns an empty pool when everyone is busy", () => {
    expect(buildPool([row("a", "Ana")], new Set(["a"]), new Map(), attrs, 3)).toEqual([]);
  });

  it("carries gender, weight and games played; missing games means 0", () => {
    const [a, b] = buildPool([row("a", "Ana"), row("b", "Bo")], new Set(), new Map([["a", 4]]), attrs, 3);
    expect(a).toMatchObject({ gender: "male", weight: 5, unrated: false, gamesPlayed: 4 });
    expect(b).toMatchObject({ gender: "female", weight: 2, gamesPlayed: 0 });
  });

  it("treats a player with no attributes as unrated with the provisional weight and no gender", () => {
    const [c] = buildPool([row("c", "Cy")], new Set(), new Map(), attrs, 3);
    expect(c).toMatchObject({ gender: null, weight: 3, unrated: true });
  });

  it("names a member by profile, a guest by guest_name, else 'Unnamed player'", () => {
    const pool = buildPool([row("a", "Ana"), row("g", null, "Guest Gus"), row("x", null)], new Set(), new Map(), new Map(), 3);
    expect(pool.map((p) => p.name)).toEqual(["Ana", "Guest Gus", "Unnamed player"]);
  });
});

describe("displayName", () => {
  it("prefers the profile name, then the guest name, else null", () => {
    expect(displayName("Ana", "Guest")).toBe("Ana");
    expect(displayName(null, "Guest")).toBe("Guest");
    expect(displayName(undefined, undefined)).toBeNull();
  });
});

describe("busyPlayerMessage", () => {
  it("names the busy player", () => {
    expect(busyPlayerMessage("Ana", "generic")).toBe("Ana is already in another match.");
  });

  it("keeps the generic message when nobody was found", () => {
    expect(busyPlayerMessage(null, "A player in this match is already in another active match.")).toBe(
      "A player in this match is already in another active match.",
    );
  });
});

describe("one-gender pool in mixed format", () => {
  const men: PoolPlayer[] = Array.from({ length: 8 }, (_, i) => ({
    participantId: `m${i + 1}`,
    name: `m${i + 1}`,
    gender: "male",
    weight: 3,
    unrated: false,
    gamesPlayed: 0,
  }));

  it("returns no matches, leaves everyone unused, and says women are missing", () => {
    const result = suggestMatches({ pool: men, format: "mixed", courtCount: 2, history: [], rng: () => 0 });
    expect(result.matches).toEqual([]);
    expect(result.reason).toBe("Need 2 more women for a mixed double.");
    expect(result.unused).toHaveLength(8);
  });
});
