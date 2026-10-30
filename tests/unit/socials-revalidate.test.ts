import { describe, expect, it } from "vitest";
import { socialRevalidationPaths } from "@/lib/socials/revalidate";

describe("socialRevalidationPaths", () => {
  it("revalidates the marketing layout (footer included) across every locale", () => {
    expect(socialRevalidationPaths()).toEqual([
      { path: "/[locale]/(marketing)", type: "layout" },
    ]);
  });
});
