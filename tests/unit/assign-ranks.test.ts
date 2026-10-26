import { describe, expect, it } from "vitest";
import { assignRanks, displayName } from "@/lib/stats";

describe("assignRanks", () => {
  it("shares a rank between ties and skips the next one", () => {
    const rows = [5, 3, 3, 1].map((gamesPlayed) => ({ gamesPlayed }));
    expect(assignRanks(rows).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("returns an empty array for no rows", () => {
    expect(assignRanks([])).toEqual([]);
  });

  it("ranks everyone 1 when all are equal", () => {
    const rows = [2, 2, 2].map((gamesPlayed) => ({ gamesPlayed }));
    expect(assignRanks(rows).map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it("keeps the other fields of each row", () => {
    expect(assignRanks([{ gamesPlayed: 1, name: "Ani" }])).toEqual([
      { gamesPlayed: 1, name: "Ani", rank: 1 },
    ]);
  });
});

describe("displayName", () => {
  it("falls back to Member for null and blank names", () => {
    expect(displayName(null)).toBe("Member");
    expect(displayName("   ")).toBe("Member");
  });

  it("returns a real name trimmed", () => {
    expect(displayName(" Ani ")).toBe("Ani");
  });
});
