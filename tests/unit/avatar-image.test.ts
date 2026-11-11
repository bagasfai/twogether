import { describe, expect, it } from "vitest";
import {
  AVATAR_SIZE,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_ORIGINAL_BYTES,
  avatarObjectPath,
  squareCrop,
} from "@/lib/avatar/image";

describe("squareCrop", () => {
  it("centers a landscape image", () => {
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
  });
  it("centers a portrait image", () => {
    expect(squareCrop(300, 400)).toEqual({ sx: 0, sy: 50, side: 300 });
  });
  it("keeps a square image whole", () => {
    expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });
});

describe("avatar constants and path", () => {
  it("exposes limits", () => {
    expect(AVATAR_SIZE).toBe(256);
    expect(MAX_AVATAR_ORIGINAL_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_AVATAR_BYTES).toBe(524288);
  });
  it("builds the object path", () => {
    expect(avatarObjectPath("u1", "jpg")).toBe("u1/avatar.jpg");
    expect(avatarObjectPath("u1", "webp")).toBe("u1/avatar.webp");
  });
});
