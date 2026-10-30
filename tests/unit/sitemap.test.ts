import { describe, expect, it } from "vitest";
import { buildSitemap } from "@/lib/seo/sitemap";

const SITE = "https://s.example";

describe("buildSitemap", () => {
  it("is empty without a site URL", () => {
    expect(
      buildSitemap(null, [{ id: "s1", updatedAt: "2026-10-01T00:00:00Z" }], []),
    ).toEqual([]);
  });

  it("lists the static routes with both locale alternates", () => {
    const entries = buildSitemap(SITE, [], []);
    for (const path of ["", "/sessions", "/gallery", "/about", "/faq", "/partner"]) {
      const entry = entries.find((e) => e.url === `${SITE}${path}`);
      expect(entry, `missing ${path || "/"}`).toBeDefined();
      expect(entry?.alternates?.languages).toEqual({
        id: `${SITE}${path}`,
        en: `${SITE}/en${path}`,
      });
    }
  });

  it("adds a session with lastModified and alternates", () => {
    const entries = buildSitemap(
      SITE,
      [{ id: "s1", updatedAt: "2026-10-01T00:00:00Z" }],
      [],
    );
    const entry = entries.find((e) => e.url === `${SITE}/sessions/s1`);
    expect(entry?.lastModified).toBe("2026-10-01T00:00:00Z");
    expect(entry?.alternates?.languages?.en).toBe(`${SITE}/en/sessions/s1`);
  });

  it("adds an album, omitting lastModified when it has none", () => {
    const entries = buildSitemap(
      SITE,
      [],
      [
        { id: "a1", lastModified: null },
        { id: "a2", lastModified: "2026-10-02T00:00:00Z" },
      ],
    );
    const a1 = entries.find((e) => e.url === `${SITE}/gallery/a1`);
    const a2 = entries.find((e) => e.url === `${SITE}/gallery/a2`);
    expect(a1).toBeDefined();
    expect(a1).not.toHaveProperty("lastModified");
    expect(a2?.lastModified).toBe("2026-10-02T00:00:00Z");
  });

  it("never produces a double slash after the scheme", () => {
    const entries = buildSitemap(
      SITE,
      [{ id: "s1", updatedAt: "2026-10-01T00:00:00Z" }],
      [{ id: "a1", lastModified: null }],
    );
    const urls = entries.flatMap((e) => [
      e.url,
      ...Object.values(e.alternates?.languages ?? {}),
    ]);
    for (const url of urls) {
      expect(url).toBeDefined();
      expect((url as string).replace("https://", "")).not.toContain("//");
    }
  });
});
