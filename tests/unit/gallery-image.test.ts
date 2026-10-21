import { describe, expect, it } from "vitest";
import { MAX_BYTES, fitWithin, galleryPhotoPath, validatePickedFile } from "@/lib/gallery/image";

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
});

describe("validatePickedFile", () => {
  it("rejects unsupported types", () => {
    expect(validatePickedFile({ type: "image/heic", size: 10 })).toEqual({ ok: false, reason: "type" });
    expect(validatePickedFile({ type: "application/pdf", size: 10 })).toEqual({ ok: false, reason: "type" });
  });
  it("rejects empty", () => {
    expect(validatePickedFile({ type: "image/png", size: 0 })).toEqual({ ok: false, reason: "empty" });
  });
  it("rejects oversize, accepts exactly MAX_BYTES", () => {
    expect(validatePickedFile({ type: "image/jpeg", size: MAX_BYTES + 1 })).toEqual({ ok: false, reason: "size" });
    expect(validatePickedFile({ type: "image/jpeg", size: MAX_BYTES })).toEqual({ ok: true });
  });
});
