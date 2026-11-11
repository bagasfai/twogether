import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avatarPublicUrl, isAllowedAvatarSrc } from "@/lib/avatar/url";

describe("avatarPublicUrl", () => {
  it("builds the public url with a version", () => {
    expect(avatarPublicUrl("https://x.supabase.co", "u1", "webp", 5)).toBe(
      "https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar.webp?v=5",
    );
  });
  it("does not double the slash", () => {
    expect(avatarPublicUrl("https://x.supabase.co/", "u1", "jpg", 1)).toBe(
      "https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar.jpg?v=1",
    );
  });
});

describe("isAllowedAvatarSrc", () => {
  const BASE = "https://x.supabase.co";
  const OWN = `${BASE}/storage/v1/object/public/avatars/u1/avatar.webp?v=1`;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows our bucket", () => {
    expect(isAllowedAvatarSrc(OWN)).toBe(true);
  });
  it("allows google avatars over https", () => {
    expect(isAllowedAvatarSrc("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(true);
  });
  it.each([
    ["http google", "http://lh3.googleusercontent.com/a/abc"],
    ["look-alike google host", "https://lh3.googleusercontent.com.evil.example/a"],
    ["wrong origin with bucket path", "https://evil.example/storage/v1/object/public/avatars/x"],
    ["our origin other bucket", `${BASE}/storage/v1/object/public/gallery/x.jpg`],
    ["our origin other path", `${BASE}/rest/v1/profiles`],
    ["relative", "/storage/v1/object/public/avatars/u1/avatar.webp"],
    ["data url", "data:image/png;base64,AAAA"],
    ["javascript url", "javascript:alert(1)"],
    ["malformed", "not a url"],
    ["empty", ""],
  ])("rejects %s", (_label, src) => {
    expect(isAllowedAvatarSrc(src)).toBe(false);
  });
  it("rejects null and undefined", () => {
    expect(isAllowedAvatarSrc(null)).toBe(false);
    expect(isAllowedAvatarSrc(undefined)).toBe(false);
  });
  it("does not throw and rejects our bucket when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isAllowedAvatarSrc(OWN)).toBe(false);
    expect(isAllowedAvatarSrc("https://lh3.googleusercontent.com/a/abc")).toBe(true);
  });
  it("does not throw when the env var is unparsable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "garbage");
    expect(isAllowedAvatarSrc(OWN)).toBe(false);
  });
});
