import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { profileSchema } from "@/lib/validation/profile";
import { sessionSchema, isZonedInstant } from "@/lib/validation/session";

describe("signUpSchema", () => {
  const valid = {
    fullName: "Bagas Kara",
    email: "Bagas@Example.com ",
    password: "supersecret",
  };

  it("accepts a valid signup and normalises the email", () => {
    const result = signUpSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("bagas@example.com");
  });

  it("rejects a malformed email", () => {
    expect(signUpSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "short7c" }).success).toBe(false);
  });

  it("accepts a password of exactly 8 characters", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "exactly8" }).success).toBe(true);
  });

  it("rejects a one-character name", () => {
    expect(signUpSchema.safeParse({ ...valid, fullName: "B" }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts any non-empty password so old accounts can still log in", () => {
    const result = signInSchema.safeParse({ email: "a@b.com", password: "old" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts a profile with no phone and no avatar", () => {
    const result = profileSchema.safeParse({ fullName: "Bagas", phone: "", avatarUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeNull();
  });

  it("accepts an Indonesian mobile number", () => {
    const result = profileSchema.safeParse({
      fullName: "Bagas",
      phone: "+62 812 3456 7890",
      avatarUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a phone number containing letters", () => {
    const result = profileSchema.safeParse({
      fullName: "Bagas",
      phone: "call me",
      avatarUrl: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an avatar value that is not a URL", () => {
    const result = profileSchema.safeParse({
      fullName: "Bagas",
      phone: "",
      avatarUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("sessionSchema", () => {
  const valid = {
    title: "Friday Night Badminton",
    description: "",
    startsAt: "2026-10-02T19:00",
    endsAt: "2026-10-02T22:00",
    location: "GOR Jakarta Barat",
    locationUrl: "",
    courtCount: "4",
    maxParticipants: "16",
    waitlistCapacity: "4",
    registrationState: "open",
    status: "scheduled",
  };

  it("accepts a valid session and coerces the numeric fields", () => {
    const result = sessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.courtCount).toBe(4);
      expect(result.data.maxParticipants).toBe(16);
    }
  });

  it("rejects an end time at or before the start time, on the endsAt field", () => {
    const result = sessionSchema.safeParse({ ...valid, endsAt: "2026-10-02T19:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "endsAt")).toBe(true);
    }
  });

  it("rejects a court count of zero, matching the CHECK constraint", () => {
    expect(sessionSchema.safeParse({ ...valid, courtCount: "0" }).success).toBe(false);
  });

  it("accepts a waitlist capacity of zero", () => {
    expect(sessionSchema.safeParse({ ...valid, waitlistCapacity: "0" }).success).toBe(true);
  });

  it("rejects a negative waitlist capacity", () => {
    expect(sessionSchema.safeParse({ ...valid, waitlistCapacity: "-1" }).success).toBe(false);
  });

  it("rejects a status a host is not allowed to set directly", () => {
    expect(sessionSchema.safeParse({ ...valid, status: "completed" }).success).toBe(false);
  });

  // The .refine() comparing endsAt > startsAt must hold both before the
  // browser converts datetime-local strings to zoned instants (client-side
  // validation, run pre-conversion) and after (the server re-parses the
  // already-converted, zone-qualified strings). Date parsing of two
  // same-format strings preserves relative order either way -- bare
  // datetime-local strings are parsed consistently in whichever zone is
  // running, and "Z"/offset-suffixed strings are parsed as absolute instants
  // regardless of zone -- so both forms are exercised here.
  it("accepts a valid order for raw datetime-local strings (pre-conversion, client-side)", () => {
    const result = sessionSchema.safeParse({
      ...valid,
      startsAt: "2026-10-02T19:00",
      endsAt: "2026-10-02T22:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bad order for raw datetime-local strings (pre-conversion, client-side)", () => {
    const result = sessionSchema.safeParse({
      ...valid,
      startsAt: "2026-10-02T22:00",
      endsAt: "2026-10-02T19:00",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid order for zoned instants (post-conversion, server-side)", () => {
    const result = sessionSchema.safeParse({
      ...valid,
      startsAt: "2026-10-02T12:00:00.000Z",
      endsAt: "2026-10-02T15:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bad order for zoned instants (post-conversion, server-side)", () => {
    const result = sessionSchema.safeParse({
      ...valid,
      startsAt: "2026-10-02T15:00:00.000Z",
      endsAt: "2026-10-02T12:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("isZonedInstant", () => {
  it("accepts a Z-suffixed instant", () => {
    expect(isZonedInstant("2026-10-02T12:00:00.000Z")).toBe(true);
  });

  it("accepts a lowercase z-suffixed instant", () => {
    expect(isZonedInstant("2026-10-02T12:00:00.000z")).toBe(true);
  });

  it("accepts a positive offset instant", () => {
    expect(isZonedInstant("2026-10-02T19:00:00+07:00")).toBe(true);
  });

  it("accepts a negative offset instant", () => {
    expect(isZonedInstant("2026-10-02T08:00:00-05:00")).toBe(true);
  });

  it("rejects a bare datetime-local value with no seconds", () => {
    expect(isZonedInstant("2026-10-02T19:00")).toBe(false);
  });

  it("rejects a bare value that includes seconds but still has no zone", () => {
    expect(isZonedInstant("2026-10-02T19:00:00")).toBe(false);
  });
});
