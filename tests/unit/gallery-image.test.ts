import { describe, expect, it, vi } from "vitest";
import {
  ENCODE_QUALITY,
  ImageEncodeError,
  MAX_BYTES,
  MAX_ORIGINAL_BYTES,
  encodeWithFallback,
  fitWithin,
  galleryPhotoPath,
  validatePickedFile,
} from "@/lib/gallery/image";

describe("fitWithin", () => {
  it("scales landscape by the long edge", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
  });
  it("scales portrait by the long edge", () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
  });
  it("leaves small images unchanged", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });
  it("returns integers of at least 1", () => {
    const r = fitWithin(10000, 1);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe("galleryPhotoPath", () => {
  it("joins gallery id and uuid", () => {
    expect(galleryPhotoPath("g", "u")).toBe("g/u.webp");
  });
  it("uses the given extension", () => {
    expect(galleryPhotoPath("g", "u", "webp")).toBe("g/u.webp");
    expect(galleryPhotoPath("g", "u", "jpg")).toBe("g/u.jpg");
  });
});

describe("validatePickedFile", () => {
  it("rejects unsupported types", () => {
    expect(validatePickedFile({ type: "image/heic", size: 10 })).toEqual({ ok: false, reason: "type" });
    expect(validatePickedFile({ type: "application/pdf", size: 10 })).toEqual({ ok: false, reason: "type" });
  });
  it("rejects empty", () => {
    expect(validatePickedFile({ type: "image/png", size: 0 })).toEqual({ ok: false, reason: "empty" });
  });
  it("accepts originals over MAX_BYTES (they are resized before upload)", () => {
    expect(validatePickedFile({ type: "image/jpeg", size: MAX_BYTES + 1 })).toEqual({ ok: true });
    expect(validatePickedFile({ type: "image/jpeg", size: 12 * 1024 * 1024 })).toEqual({ ok: true });
  });
  it("rejects originals over MAX_ORIGINAL_BYTES, accepts exactly MAX_ORIGINAL_BYTES", () => {
    expect(validatePickedFile({ type: "image/jpeg", size: MAX_ORIGINAL_BYTES + 1 })).toEqual({
      ok: false,
      reason: "size",
    });
    expect(validatePickedFile({ type: "image/jpeg", size: MAX_ORIGINAL_BYTES })).toEqual({ ok: true });
  });
});

describe("encodeWithFallback", () => {
  const webp = new Blob(["w"], { type: "image/webp" });
  const jpeg = new Blob(["j"], { type: "image/jpeg" });
  const png = new Blob(["p"], { type: "image/png" });

  it("uses webp when the browser encodes it", async () => {
    const encode = vi.fn(async (type: string) => (type === "image/webp" ? webp : jpeg));
    await expect(encodeWithFallback(encode)).resolves.toEqual({ blob: webp, ext: "webp" });
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith("image/webp", ENCODE_QUALITY);
  });

  it("falls back to jpeg when webp comes back as PNG (WebKit)", async () => {
    const encode = vi.fn(async (type: string) => (type === "image/webp" ? png : jpeg));
    await expect(encodeWithFallback(encode)).resolves.toEqual({ blob: jpeg, ext: "jpg" });
    expect(encode).toHaveBeenLastCalledWith("image/jpeg", ENCODE_QUALITY);
  });

  it("falls back to jpeg when webp encoding returns null", async () => {
    const encode = vi.fn(async (type: string) => (type === "image/webp" ? null : jpeg));
    await expect(encodeWithFallback(encode)).resolves.toEqual({ blob: jpeg, ext: "jpg" });
  });

  it("throws ImageEncodeError when neither webp nor jpeg can be produced", async () => {
    await expect(encodeWithFallback(async () => png)).rejects.toBeInstanceOf(ImageEncodeError);
    await expect(encodeWithFallback(async () => null)).rejects.toBeInstanceOf(ImageEncodeError);
  });
});
