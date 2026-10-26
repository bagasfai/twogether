import { describe, expect, it } from "vitest";
import { excludedUserIds } from "@/lib/sessions/excluded-user-ids";

describe("excludedUserIds", () => {
  it("drops guest rows (null user_id)", () => {
    expect(excludedUserIds([{ user_id: "a" }, { user_id: null }, { user_id: "b" }])).toEqual(["a", "b"]);
  });
  it("returns [] for only guests", () => {
    expect(excludedUserIds([{ user_id: null }])).toEqual([]);
  });
});
