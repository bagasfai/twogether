import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import { DISALLOWED_PATHS } from "@/lib/seo/robots-paths";

afterEach(() => {
  vi.unstubAllEnvs();
});

function dirNames(dir: string): string[] {
  return fs
    .readdirSync(path.resolve(import.meta.dirname, "../..", dir), {
      withFileTypes: true,
    })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

describe("robots", () => {
  it("allows the site and disallows the listed paths for every crawler", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(robots().rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: DISALLOWED_PATHS,
    });
  });

  it("points at the sitemap when the site URL is known", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://s.example");
    expect(robots().sitemap).toBe("https://s.example/sitemap.xml");
  });

  it("omits the sitemap key when the site URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(robots()).not.toHaveProperty("sitemap");
  });
});

describe("DISALLOWED_PATHS coverage", () => {
  // `sessions` is shared: /sessions and /sessions/[id] are public, so it is
  // covered by the two specific entries asserted below instead.
  const areas = [
    ...dirNames("app/(app)"),
    ...dirNames("app/(auth)"),
    "auth",
    "api",
  ].filter((name) => name !== "sessions");

  it.each(areas)("covers /%s", (name) => {
    const covered = DISALLOWED_PATHS.some((p) => p.startsWith(`/${name}`));
    expect(
      covered,
      `app route directory "${name}" is not covered by DISALLOWED_PATHS in lib/seo/robots-paths.ts`,
    ).toBe(true);
  });

  it("covers the non-public parts of /sessions", () => {
    expect(DISALLOWED_PATHS).toContain("/sessions/new");
    expect(DISALLOWED_PATHS).toContain("/sessions/*/manage");
  });
});
