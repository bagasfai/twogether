import { describe, expect, it } from "vitest";
import { grantMembershipSchema, planSchema } from "@/lib/validation/memberships";
import { deriveMembershipStatus } from "@/lib/memberships/status";

const validPlan = {
  name: "Gold",
  priceIdr: 100000,
  quota: 8,
  durationDays: 30,
  isActive: true,
};

describe("planSchema", () => {
  it("rejects quota 0, negative price, blank name", () => {
    expect(planSchema.safeParse({ ...validPlan, quota: 0 }).success).toBe(false);
    expect(planSchema.safeParse({ ...validPlan, priceIdr: -1 }).success).toBe(false);
    expect(planSchema.safeParse({ ...validPlan, name: "   " }).success).toBe(false);
    expect(planSchema.safeParse(validPlan).success).toBe(true);
  });

  it("caps the name at 120 characters (DB check)", () => {
    expect(planSchema.safeParse({ ...validPlan, name: "a".repeat(120) }).success).toBe(true);
    const tooLong = planSchema.safeParse({ ...validPlan, name: "a".repeat(121) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toBe("Name must be at most 120 characters");
  });

  it("defaults refundCutoffHours to 24", () => {
    const parsed = planSchema.parse(validPlan);
    expect(parsed.refundCutoffHours).toBe(24);
  });
});

describe("grantMembershipSchema", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const base = { userId: uuid, planId: uuid, paymentReceivedAt: "2026-10-23T10:00:00Z" };

  it("accepts overrides and rejects non-uuid ids", () => {
    expect(grantMembershipSchema.safeParse(base).success).toBe(true);
    expect(
      grantMembershipSchema.safeParse({ ...base, priceIdr: 0, quota: 3, durationDays: 10 }).success,
    ).toBe(true);
    expect(grantMembershipSchema.safeParse({ ...base, userId: "nope" }).success).toBe(false);
    expect(grantMembershipSchema.safeParse({ ...base, planId: "nope" }).success).toBe(false);
    expect(grantMembershipSchema.safeParse({ ...base, quota: 0 }).success).toBe(false);
  });
});

describe("deriveMembershipStatus", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const past = "2026-10-01T00:00:00Z";
  const future = "2026-11-01T00:00:00Z";
  const row = {
    cancelledAt: null as string | null,
    startedAt: past as string | null,
    expiresAt: future as string | null,
    quotaTotal: 4,
    quotaUsed: 1,
  };

  it("queued when startedAt is null", () => {
    expect(deriveMembershipStatus({ ...row, startedAt: null, expiresAt: null }, now)).toBe("queued");
  });
  it("active", () => {
    expect(deriveMembershipStatus(row, now)).toBe("active");
  });
  it("exhausted when quotaUsed >= quotaTotal", () => {
    expect(deriveMembershipStatus({ ...row, quotaUsed: 4 }, now)).toBe("exhausted");
    expect(deriveMembershipStatus({ ...row, quotaUsed: 5 }, now)).toBe("exhausted");
  });
  it("expired when expiresAt <= now", () => {
    expect(deriveMembershipStatus({ ...row, expiresAt: now.toISOString() }, now)).toBe("expired");
    expect(deriveMembershipStatus({ ...row, expiresAt: past }, now)).toBe("expired");
  });
  it("exhausted wins over expired", () => {
    expect(deriveMembershipStatus({ ...row, quotaUsed: 4, expiresAt: past }, now)).toBe("exhausted");
  });
  it("queued wins over exhausted only when startedAt is null", () => {
    expect(deriveMembershipStatus({ ...row, startedAt: null, expiresAt: null, quotaUsed: 4 }, now)).toBe("queued");
    expect(deriveMembershipStatus({ ...row, quotaUsed: 4 }, now)).toBe("exhausted");
  });
  it("cancelled wins over all", () => {
    const c = "2026-10-10T00:00:00Z";
    expect(deriveMembershipStatus({ ...row, cancelledAt: c, quotaUsed: 4, expiresAt: past }, now)).toBe("cancelled");
    expect(deriveMembershipStatus({ ...row, cancelledAt: c, startedAt: null, expiresAt: null }, now)).toBe("cancelled");
  });
});
