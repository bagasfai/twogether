import { describe, expect, it } from "vitest";
import {
  FEATURED_POST_KINDS,
  SOCIAL_PLATFORMS,
  featuredPostImagePathSchema,
  featuredPostSchema,
  socialLinkMoveSchema,
  socialLinkSchema,
} from "@/lib/validation/socials";

const link = { platform: "instagram", url: "https://instagram.com/x", label: "@x", isVisible: true };

describe("socialLinkSchema", () => {
  it("accepts https and rejects http", () => {
    expect(socialLinkSchema.safeParse(link).success).toBe(true);
    expect(socialLinkSchema.safeParse({ ...link, url: "http://instagram.com/x" }).success).toBe(false);
  });
  it("rejects blank label, long url and unknown platform", () => {
    expect(socialLinkSchema.safeParse({ ...link, label: "  " }).success).toBe(false);
    expect(socialLinkSchema.safeParse({ ...link, url: `https://a.com/${"x".repeat(500)}` }).success).toBe(false);
    expect(socialLinkSchema.safeParse({ ...link, platform: "facebook" }).success).toBe(false);
  });
  it("exposes the enum tuples", () => {
    expect(SOCIAL_PLATFORMS).toEqual(["instagram", "tiktok", "threads", "whatsapp", "ayo", "other"]);
    expect(FEATURED_POST_KINDS).toEqual(["schedule", "match", "video", "other"]);
  });
});

describe("socialLinkMoveSchema", () => {
  it("needs a uuid and up/down", () => {
    const id = "3f2b1c4e-0000-4000-8000-000000000001";
    expect(socialLinkMoveSchema.safeParse({ id, direction: "up" }).success).toBe(true);
    expect(socialLinkMoveSchema.safeParse({ id, direction: "left" }).success).toBe(false);
    expect(socialLinkMoveSchema.safeParse({ id: "x", direction: "up" }).success).toBe(false);
  });
});

describe("featuredPostSchema", () => {
  const post = {
    platform: "tiktok",
    postUrl: "https://tiktok.com/@x/video/1",
    captionEn: "Hi",
    captionId: "Halo",
    kind: "video",
    postedAt: "2026-10-29",
    isVisible: true,
  };
  it("accepts a valid post and rejects bad date, blank or long caption", () => {
    expect(featuredPostSchema.safeParse(post).success).toBe(true);
    expect(featuredPostSchema.safeParse({ ...post, postedAt: "29/10/2026" }).success).toBe(false);
    expect(featuredPostSchema.safeParse({ ...post, captionEn: " " }).success).toBe(false);
    expect(featuredPostSchema.safeParse({ ...post, captionId: "x".repeat(201) }).success).toBe(false);
    expect(featuredPostSchema.safeParse({ ...post, postUrl: "http://a.com" }).success).toBe(false);
  });
});

describe("featuredPostImagePathSchema", () => {
  const uuid = "3f2b1c4e-5a6d-4e7f-8a9b-0c1d2e3f4a5b";
  it("accepts {uuid}.webp/.jpg", () => {
    expect(featuredPostImagePathSchema.safeParse(`${uuid}.webp`).success).toBe(true);
    expect(featuredPostImagePathSchema.safeParse(`${uuid}.jpg`).success).toBe(true);
  });
  it("rejects traversal and folders", () => {
    expect(featuredPostImagePathSchema.safeParse("../x.webp").success).toBe(false);
    expect(featuredPostImagePathSchema.safeParse("a/b.webp").success).toBe(false);
    expect(featuredPostImagePathSchema.safeParse(`${uuid}.png`).success).toBe(false);
  });
});
