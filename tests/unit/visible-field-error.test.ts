import { describe, expect, it } from "vitest";
import { hasVisibleFieldError } from "@/lib/partner/visible-field-error";

describe("hasVisibleFieldError", () => {
  it("is false for honeypot-only errors", () => {
    expect(hasVisibleFieldError({ website: ["partner.errors.spam"] })).toBe(false);
  });
  it("is true for a visible field", () => {
    expect(hasVisibleFieldError({ email: ["partner.errors.email"] })).toBe(true);
  });
  it("is false for empty or missing", () => {
    expect(hasVisibleFieldError({})).toBe(false);
    expect(hasVisibleFieldError(undefined)).toBe(false);
  });
});
