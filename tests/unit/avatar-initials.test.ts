import { describe, expect, it } from "vitest";
import { avatarColorIndex, getInitials } from "@/lib/avatar/initials";

describe("getInitials", () => {
  it("uses first and last word", () => {
    expect(getInitials("Dimas Pratama")).toBe("DP");
    expect(getInitials("  Ana  Maria  Lopez ")).toBe("AL");
  });
  it("handles a single word", () => {
    expect(getInitials("siti")).toBe("S");
  });
  it("falls back to a question mark", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials(null)).toBe("?");
    expect(getInitials(undefined)).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });
  it("is code point safe", () => {
    expect(getInitials("👍 Budi")).toBe("👍B");
    expect(getInitials("Åsa Öberg")).toBe("ÅÖ");
  });
});

describe("avatarColorIndex", () => {
  it("is stable for equal input", () => {
    expect(avatarColorIndex("abc")).toBe(avatarColorIndex("abc"));
  });
  it("stays within the palette", () => {
    for (let i = 0; i < 200; i++) {
      const n = avatarColorIndex(crypto.randomUUID());
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
    expect(avatarColorIndex("x", 3)).toBeLessThan(3);
  });
  it("spreads uuids over every bucket", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(avatarColorIndex(crypto.randomUUID()));
    expect(seen.size).toBe(6);
  });
});
