import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl, localizedUrls } from "@/lib/seo/urls";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSiteUrl", () => {
  it("returns null when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getSiteUrl()).toBeNull();
  });

  it("returns a valid origin unchanged", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://jakbar.example");
    expect(getSiteUrl()).toBe("https://jakbar.example");
  });

  it("drops a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://jakbar.example/");
    expect(getSiteUrl()).toBe("https://jakbar.example");
  });

  it("keeps the origin only, so joined URLs never contain //", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://jakbar.example/app");
    expect(getSiteUrl()).toBe("https://jakbar.example");
  });

  it("returns null for a malformed value", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(getSiteUrl()).toBeNull();
  });

  it("returns null for a non-http(s) scheme", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "ftp://x.example");
    expect(getSiteUrl()).toBeNull();
  });
});

describe("localizedUrls", () => {
  it("leaves the default locale unprefixed and prefixes en", () => {
    expect(localizedUrls("/about", "https://s.example")).toEqual({
      url: "https://s.example/about",
      languages: {
        id: "https://s.example/about",
        en: "https://s.example/en/about",
      },
    });
  });

  it("maps the root path without a trailing slash", () => {
    expect(localizedUrls("/", "https://s.example")).toEqual({
      url: "https://s.example",
      languages: {
        id: "https://s.example",
        en: "https://s.example/en",
      },
    });
  });
});
