import { describe, expect, it } from "vitest";
import { ImageEncodeError, MAX_AVATAR_BYTES, MAX_AVATAR_ORIGINAL_BYTES } from "@/lib/avatar/image";
import { AVATAR_MESSAGES, blobTooLarge, pickError, resizeErrorMessage } from "@/lib/avatar/pick";

describe("avatar pick errors", () => {
  it("accepts a valid file", () => {
    expect(pickError({ type: "image/png", size: 1000 })).toBeNull();
  });
  it("rejects wrong type, empty, and oversized originals", () => {
    expect(pickError({ type: "image/gif", size: 1000 })).toBe(AVATAR_MESSAGES.type);
    expect(pickError({ type: "image/png", size: 0 })).toBe(AVATAR_MESSAGES.empty);
    expect(pickError({ type: "image/png", size: MAX_AVATAR_ORIGINAL_BYTES + 1 })).toBe(AVATAR_MESSAGES.size);
  });
  it("accepts an original exactly at the limit", () => {
    expect(pickError({ type: "image/png", size: MAX_AVATAR_ORIGINAL_BYTES })).toBeNull();
  });
  it("maps resize failures", () => {
    expect(resizeErrorMessage(new ImageEncodeError())).toBe(AVATAR_MESSAGES.encode);
    expect(resizeErrorMessage(new Error("x"))).toBe(AVATAR_MESSAGES.decode);
  });
  it("flags blobs over the stored limit", () => {
    expect(blobTooLarge({ size: MAX_AVATAR_BYTES })).toBe(false);
    expect(blobTooLarge({ size: MAX_AVATAR_BYTES + 1 })).toBe(true);
  });
});
