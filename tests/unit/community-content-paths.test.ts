import { describe, expect, it } from "vitest";
import { communityContentRevalidationPaths } from "@/lib/community-content/revalidate";

describe("communityContentRevalidationPaths", () => {
  it("covers the about and faq pages across every locale", () => {
    expect(communityContentRevalidationPaths()).toEqual([
      { path: "/[locale]/(marketing)/about", type: "page" },
      { path: "/[locale]/(marketing)/faq", type: "page" },
    ]);
  });
});
