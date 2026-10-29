import { describe, expect, it } from "vitest";
import { socialRevalidationPaths } from "@/lib/socials/revalidate";

describe("socialRevalidationPaths", () => {
  it("covers the landing page and partner page across every locale", () => {
    expect(socialRevalidationPaths()).toEqual([
      { path: "/[locale]/(marketing)", type: "page" },
      { path: "/[locale]/(marketing)/partner", type: "page" },
    ]);
  });
});
