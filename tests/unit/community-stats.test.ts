import { describe, expect, it } from "vitest";
import {
  STATS_MIN_SESSIONS,
  shouldShowStats,
  toCommunityStats,
  type CommunityStats,
} from "@/lib/community-stats";

const stats = (overrides: Partial<CommunityStats> = {}): CommunityStats => ({
  sessionsHeld: 0,
  matchesPlayed: 0,
  totalCheckins: 0,
  activeMembers: 0,
  ...overrides,
});

describe("shouldShowStats", () => {
  it("pins the threshold at 10 sessions", () => {
    expect(STATS_MIN_SESSIONS).toBe(10);
  });

  it.each([
    [9, false],
    [10, true],
    [11, true],
  ])("with %i sessions held returns %s", (sessionsHeld, expected) => {
    expect(shouldShowStats(stats({ sessionsHeld }))).toBe(expected);
  });

  it("stays hidden with zero sessions however large the other counts are", () => {
    expect(
      shouldShowStats(
        stats({ matchesPlayed: 500, totalCheckins: 900, activeMembers: 80 }),
      ),
    ).toBe(false);
  });
});

describe("toCommunityStats", () => {
  it("maps snake_case columns to camelCase numbers", () => {
    expect(
      toCommunityStats({
        sessions_held: 12,
        matches_played: 34,
        total_checkins: 56,
        active_members: 7,
      }),
    ).toEqual({
      sessionsHeld: 12,
      matchesPlayed: 34,
      totalCheckins: 56,
      activeMembers: 7,
    });
  });

  it("converts numeric strings with Number()", () => {
    const row = {
      sessions_held: "12",
      matches_played: "34",
      total_checkins: "56",
      active_members: "7",
    } as unknown as Parameters<typeof toCommunityStats>[0];
    expect(toCommunityStats(row).sessionsHeld).toBe(12);
  });

  it("throws on a missing row", () => {
    expect(() => toCommunityStats(undefined)).toThrow();
  });
});
