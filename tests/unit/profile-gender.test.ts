import { describe, expect, it } from "vitest";
import { profileSchema } from "@/lib/validation/profile";

const validProfile = { fullName: "Bagas", phone: "", avatarUrl: "" };

describe("profileSchema gender", () => {
  it.each(["male", "female"])("accepts %s", (gender) => {
    const result = profileSchema.safeParse({ ...validProfile, gender });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gender).toBe(gender);
  });

  it("rejects an unknown gender", () => {
    expect(profileSchema.safeParse({ ...validProfile, gender: "x" }).success).toBe(false);
  });

  it("treats gender as optional and leaves it undefined", () => {
    const result = profileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gender).toBeUndefined();
  });

  it("does not accept a level key (members never set level)", () => {
    const result = profileSchema.safeParse({ ...validProfile, level: "advanced" });
    expect(result.success && "level" in result.data).toBe(false);
  });

  it("is idempotent with gender set", () => {
    const once = profileSchema.parse({ ...validProfile, gender: "female" });
    expect(profileSchema.parse(once)).toEqual(once);
  });
});
