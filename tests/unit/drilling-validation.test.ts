import { describe, expect, it } from "vitest";
import { sessionSchema } from "@/lib/validation/session";
import { adjustCapacitySchema, transferSeatSchema } from "@/lib/validation/drilling";

const base = {
  title: "Drilling Sabtu",
  description: "",
  startsAt: "2026-10-03T09:00",
  endsAt: "2026-10-03T11:00",
  location: "GOR Jakarta Barat",
  locationUrl: "",
  price: "80000",
  premiumSurchargeIdr: "0",
  courtCount: "2",
  maxParticipants: "8",
  waitlistCapacity: "4",
  registrationState: "open",
  status: "scheduled",
};

const drilling = { ...base, kind: "drilling", coachCount: "2", seatsPerCoach: "4", premiumSurchargeIdr: "25000" };

describe("sessionSchema kind", () => {
  it("accepts a consistent drilling session", () => {
    const result = sessionSchema.safeParse(drilling);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coachCount).toBe(2);
      expect(result.data.seatsPerCoach).toBe(4);
      expect(result.data.premiumSurchargeIdr).toBe(25000);
    }
  });

  it("round-trips a drilling session", () => {
    const once = sessionSchema.parse(drilling);
    expect(sessionSchema.parse(once)).toEqual(once);
  });

  it("rejects drilling without coachCount", () => {
    const result = sessionSchema.safeParse({ ...drilling, coachCount: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === "coachCount")).toBe(true);
  });

  it("rejects drilling without seatsPerCoach", () => {
    expect(sessionSchema.safeParse({ ...drilling, seatsPerCoach: "" }).success).toBe(false);
  });

  it("rejects drilling whose maxParticipants is not coachCount * seatsPerCoach", () => {
    const result = sessionSchema.safeParse({ ...drilling, maxParticipants: "9" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === "maxParticipants")).toBe(true);
  });

  it("rejects drilling whose courtCount is not coachCount", () => {
    const result = sessionSchema.safeParse({ ...drilling, courtCount: "3" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === "courtCount")).toBe(true);
  });

  it("rejects open play carrying coach fields", () => {
    expect(sessionSchema.safeParse({ ...base, kind: "open_play", coachCount: "2", seatsPerCoach: "4" }).success).toBe(false);
  });

  it("defaults to open play with no surcharge when kind is omitted", () => {
    const result = sessionSchema.safeParse({ ...base, premiumSurchargeIdr: undefined });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("open_play");
      expect(result.data.premiumSurchargeIdr).toBe(0);
      expect(result.data.coachCount).toBeNull();
    }
  });

  it("rejects a nonzero surcharge on open play", () => {
    const result = sessionSchema.safeParse({ ...base, kind: "open_play", premiumSurchargeIdr: "25000" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === "premiumSurchargeIdr")).toBe(true);
  });

  it("accepts the maximum coherent drilling size (20 coaches x 10 seats)", () => {
    expect(
      sessionSchema.safeParse({ ...drilling, coachCount: "20", seatsPerCoach: "10", courtCount: "20", maxParticipants: "200" }).success,
    ).toBe(true);
  });

  it("rejects 21 coaches", () => {
    expect(
      sessionSchema.safeParse({ ...drilling, coachCount: "21", seatsPerCoach: "1", courtCount: "21", maxParticipants: "21" }).success,
    ).toBe(false);
  });

  it("rejects 11 seats per coach", () => {
    expect(sessionSchema.safeParse({ ...drilling, coachCount: "1", seatsPerCoach: "11", courtCount: "1", maxParticipants: "11" }).success).toBe(false);
  });

  it("rejects a negative surcharge", () => {
    expect(sessionSchema.safeParse({ ...base, kind: "open_play", premiumSurchargeIdr: "-1" }).success).toBe(false);
  });
});

describe("adjustCapacitySchema", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";

  it("accepts coachCount >= 1", () => {
    expect(adjustCapacitySchema.safeParse({ sessionId, coachCount: 3 }).success).toBe(true);
  });

  it("accepts coachCount 20 and rejects 21", () => {
    expect(adjustCapacitySchema.safeParse({ sessionId, coachCount: 20 }).success).toBe(true);
    expect(adjustCapacitySchema.safeParse({ sessionId, coachCount: 21 }).success).toBe(false);
  });

  it("rejects coachCount 0", () => {
    expect(adjustCapacitySchema.safeParse({ sessionId, coachCount: 0 }).success).toBe(false);
  });

  it("rejects a non-uuid sessionId", () => {
    expect(adjustCapacitySchema.safeParse({ sessionId: "x", coachCount: 1 }).success).toBe(false);
  });
});

describe("transferSeatSchema", () => {
  it("accepts two uuids", () => {
    expect(
      transferSeatSchema.safeParse({
        participantId: "11111111-1111-4111-8111-111111111111",
        toUserId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(true);
  });

  it("rejects a missing toUserId", () => {
    expect(transferSeatSchema.safeParse({ participantId: "11111111-1111-4111-8111-111111111111" }).success).toBe(false);
  });
});
