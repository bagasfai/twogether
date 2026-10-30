import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => `label:${key}`,
}));

import { CommunityStatsStrip } from "@/components/community-stats";

const stats = {
  sessionsHeld: 12,
  matchesPlayed: 34,
  totalCheckins: 56,
  activeMembers: 7,
};

describe("CommunityStatsStrip", () => {
  it("puts each term before its value inside the definition list", async () => {
    const html = renderToStaticMarkup(await CommunityStatsStrip({ stats }));
    const pairs = [...html.matchAll(/<(dt|dd)[ >]/g)].map((m) => m[1]);
    expect(pairs).toEqual(["dt", "dd", "dt", "dd", "dt", "dd", "dt", "dd"]);
  });

  it("renders nothing below the session threshold", async () => {
    expect(await CommunityStatsStrip({ stats: { ...stats, sessionsHeld: 9 } })).toBeNull();
  });
});
