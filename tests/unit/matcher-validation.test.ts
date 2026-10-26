import { describe, expect, it } from "vitest";
import { confirmSuggestionsSchema, generateSuggestionsSchema } from "@/lib/validation/matcher";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const session = uuid(1);
const match = (court: number, base: number) => ({
  courtId: uuid(100 + court),
  team1: [uuid(base), uuid(base + 1)],
  team2: [uuid(base + 2), uuid(base + 3)],
});

describe("generateSuggestionsSchema", () => {
  it("accepts each format", () => {
    for (const format of ["mens", "womens", "mixed"]) {
      expect(generateSuggestionsSchema.safeParse({ sessionId: session, format }).success).toBe(true);
    }
  });

  it("rejects an unknown format", () => {
    expect(generateSuggestionsSchema.safeParse({ sessionId: session, format: "singles" }).success).toBe(false);
  });
});

describe("confirmSuggestionsSchema", () => {
  it("accepts a valid payload", () => {
    expect(confirmSuggestionsSchema.safeParse({ sessionId: session, matches: [match(1, 10), match(2, 20)] }).success).toBe(true);
  });

  it("rejects a team of one", () => {
    const bad = { ...match(1, 10), team1: [uuid(10)] };
    expect(confirmSuggestionsSchema.safeParse({ sessionId: session, matches: [bad] }).success).toBe(false);
  });

  it("rejects a participant appearing twice across the payload", () => {
    expect(confirmSuggestionsSchema.safeParse({ sessionId: session, matches: [match(1, 10), match(2, 12)] }).success).toBe(false);
  });

  it("rejects a court used twice", () => {
    const second = { ...match(1, 20) };
    expect(confirmSuggestionsSchema.safeParse({ sessionId: session, matches: [match(1, 10), second] }).success).toBe(false);
  });

  it("rejects an empty list and more than 20 matches", () => {
    expect(confirmSuggestionsSchema.safeParse({ sessionId: session, matches: [] }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => match(i, 1000 + i * 10));
    expect(confirmSuggestionsSchema.safeParse({ sessionId: session, matches: many }).success).toBe(false);
  });
});
