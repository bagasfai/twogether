import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { confirmDestination, parseOtpType, RESET_PASSWORD_PATH } from "@/lib/auth/otp";

describe("forgotPasswordSchema", () => {
  it("normalises the email", () => {
    const parsed = forgotPasswordSchema.safeParse({ email: "  Member@Example.COM " });
    expect(parsed.success && parsed.data.email).toBe("member@example.com");
  });

  it.each([[""], ["nope"], ["a@"]])("rejects %j", (email) => {
    expect(forgotPasswordSchema.safeParse({ email }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a matching pair at the length floor", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "eight8ch", confirmPassword: "eight8ch" }).success,
    ).toBe(true);
  });

  it("rejects a password under the length floor", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "short7c", confirmPassword: "short7c" }).success,
    ).toBe(false);
  });

  it("reports a mismatch on confirmPassword", () => {
    const parsed = resetPasswordSchema.safeParse({
      password: "eight8ch",
      confirmPassword: "eight8cH",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["confirmPassword"]);
    }
  });
});

describe("parseOtpType", () => {
  it.each([
    ["email", "email"],
    ["recovery", "recovery"],
    ["magiclink", null],
    ["invite", null],
    ["email_change", null],
    ["signup", null],
    ["", null],
    [null, null],
  ])("parseOtpType(%j) === %j", (value, expected) => {
    expect(parseOtpType(value)).toBe(expected);
  });
});

describe("confirmDestination", () => {
  it("sends a signup confirmation to the safe next path", () => {
    expect(confirmDestination("email", "/sessions/abc")).toBe("/sessions/abc");
    expect(confirmDestination("email", null)).toBe("/dashboard");
    expect(confirmDestination("email", "//evil.example.com")).toBe("/dashboard");
  });

  it("always sends a recovery link to the reset page, whatever next says", () => {
    expect(confirmDestination("recovery", null)).toBe(RESET_PASSWORD_PATH);
    expect(confirmDestination("recovery", "/dashboard")).toBe(RESET_PASSWORD_PATH);
    expect(confirmDestination("recovery", "//evil.example.com")).toBe(RESET_PASSWORD_PATH);
  });
});
