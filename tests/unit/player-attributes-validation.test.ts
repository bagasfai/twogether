import { describe, expect, it } from "vitest";
import { levelWeight } from "@/lib/players/levels";
import {
  setGuestAttributesSchema,
  setMemberGenderSchema,
  setMemberLevelSchema,
} from "@/lib/validation/player-attributes";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("levelWeight", () => {
  it("maps levels to 1..5", () => {
    expect(levelWeight("newbie")).toBe(1);
    expect(levelWeight("advanced")).toBe(5);
  });
  it("treats unrated as 3", () => {
    expect(levelWeight(null)).toBe(3);
  });
});

describe("setMemberLevelSchema", () => {
  it("accepts a valid level", () => {
    expect(setMemberLevelSchema.safeParse({ userId: UUID, level: "novice" }).success).toBe(true);
  });
  it("rejects unknown level", () => {
    expect(setMemberLevelSchema.safeParse({ userId: UUID, level: "expert" }).success).toBe(false);
  });
});

describe("setMemberGenderSchema", () => {
  it("accepts a valid gender", () => {
    expect(setMemberGenderSchema.safeParse({ userId: UUID, gender: "female" }).success).toBe(true);
  });
  it("rejects unknown gender", () => {
    expect(setMemberGenderSchema.safeParse({ userId: UUID, gender: "other" }).success).toBe(false);
  });
});

describe("setGuestAttributesSchema", () => {
  it("accepts a valid payload", () => {
    expect(
      setGuestAttributesSchema.safeParse({ participantId: UUID, gender: "male", level: "advanced" }).success,
    ).toBe(true);
  });
  it("accepts null level and omitted gender", () => {
    expect(setGuestAttributesSchema.safeParse({ participantId: UUID, level: null }).success).toBe(true);
  });
  it("rejects bad gender", () => {
    expect(setGuestAttributesSchema.safeParse({ participantId: UUID, gender: "x" }).success).toBe(false);
  });
});
