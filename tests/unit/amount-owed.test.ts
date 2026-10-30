import { describe, expect, it } from "vitest";
import { amountOwed, payerUserId } from "@/lib/sessions/amount-owed";

describe("amountOwed", () => {
  it("charges a premium entry on a drilling session the surcharge", () => {
    expect(amountOwed({ price: 80000, premiumSurchargeIdr: 25000 }, { isPremium: true })).toBe(25000);
  });

  it("charges a non-premium entry the session price", () => {
    expect(amountOwed({ price: 80000, premiumSurchargeIdr: 25000 }, { isPremium: false })).toBe(80000);
  });

  it("charges a premium entry on open play (surcharge 0) nothing", () => {
    expect(amountOwed({ price: 45000, premiumSurchargeIdr: 0 }, { isPremium: true })).toBe(0);
  });
});

describe("payerUserId", () => {
  it("returns paidByUserId when a seat was handed off with payment", () => {
    expect(payerUserId({ userId: "u1", paidByUserId: "u0" })).toBe("u0");
  });

  it("falls back to userId otherwise", () => {
    expect(payerUserId({ userId: "u1", paidByUserId: null })).toBe("u1");
  });

  it("returns null for a guest with no payer", () => {
    expect(payerUserId({ userId: null, paidByUserId: null })).toBeNull();
  });
});
