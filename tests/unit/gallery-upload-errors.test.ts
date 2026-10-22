import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import id from "@/messages/id.json";
import { galleryErrorKey } from "@/lib/gallery/upload-errors";

const MAPPED = [
  ["upload_not_eligible", "error.uploadNotEligible"],
  ["upload_window_closed", "error.uploadWindowClosed"],
  ["upload_cap_reached", "error.uploadCapReached"],
  ["invalid_upload", "error.invalidUpload"],
  ["not_authorized", "error.notAuthorized"],
  ["invalid_state", "error.invalidState"],
  ["not_authenticated", "error.notAuthenticated"],
] as const;

function lookup(messages: { gallery: Record<string, unknown> }, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages.gallery);
}

describe("galleryErrorKey", () => {
  it.each(MAPPED)("maps %s to %s", (code, key) => {
    expect(galleryErrorKey(code, "fileSaveFailed")).toBe(key);
  });

  it("falls back for unmapped codes and missing codes", () => {
    expect(galleryErrorKey("unknown", "fileSaveFailed")).toBe("fileSaveFailed");
    expect(galleryErrorKey("validation", "deleteFailed")).toBe("deleteFailed");
    expect(galleryErrorKey(null, "deleteFailed")).toBe("deleteFailed");
    expect(galleryErrorKey(undefined, "deleteFailed")).toBe("deleteFailed");
  });

  it.each(MAPPED)("has an en and id message for %s", (_code, key) => {
    expect(typeof lookup(en, key)).toBe("string");
    expect(typeof lookup(id, key)).toBe("string");
  });
});
