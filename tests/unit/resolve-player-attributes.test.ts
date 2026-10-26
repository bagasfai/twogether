import { describe, expect, it } from "vitest";
import { checkInBlockedReason, resolvePlayerAttributes } from "@/lib/players/resolve";

describe("resolvePlayerAttributes", () => {
  it("marks a player with no level as unrated at the middle weight", () => {
    expect(resolvePlayerAttributes({ gender: "male", level: null })).toEqual({
      gender: "male",
      level: null,
      unrated: true,
      weight: 3,
    });
  });

  it("uses the level weight for a rated player", () => {
    const r = resolvePlayerAttributes({ gender: "female", level: "advanced" });
    expect(r.unrated).toBe(false);
    expect(r.weight).toBe(5);
  });
});

describe("checkInBlockedReason", () => {
  it("blocks a guest with no gender", () => {
    expect(checkInBlockedReason({ isGuest: true, gender: null })).toEqual(expect.any(String));
    expect(checkInBlockedReason({ isGuest: true, gender: null })).not.toBe("");
  });

  it("does not block a member with no gender", () => {
    expect(checkInBlockedReason({ isGuest: false, gender: null })).toBeNull();
  });

  it("does not block a guest with a gender", () => {
    expect(checkInBlockedReason({ isGuest: true, gender: "female" })).toBeNull();
  });
});
