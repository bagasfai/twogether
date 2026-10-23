import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

const KEYS = [
  "activeMembers",
  "matchesPlayed",
  "sessionsHeld",
  "title",
  "totalCheckins",
];

describe("home.stats messages", () => {
  it("carries the same keys in both locales", () => {
    expect(Object.keys(en.home.stats).sort()).toEqual(KEYS);
    expect(Object.keys(id.home.stats).sort()).toEqual(KEYS);
  });

  it.each([
    ["en", en],
    ["id", id],
  ])("has a non-empty string for every %s value", (_locale, messages) => {
    for (const value of Object.values(messages.home.stats)) {
      expect(typeof value).toBe("string");
      expect((value as string).trim()).not.toBe("");
    }
  });
});
