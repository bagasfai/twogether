import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { profileSchema } from "@/lib/validation/profile";
import { sessionSchema, isZonedInstant } from "@/lib/validation/session";
import { setCheckedInSchema, setPaidSchema } from "@/lib/validation/participants";
import { createCourtSchema, deleteCourtSchema, setCourtStatusSchema } from "@/lib/validation/courts";
import { createMatchSchema, matchIdSchema } from "@/lib/validation/matches";

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

// The client→server convention is "one schema, client resolver plus server
// re-parse": a Server Action re-parses the schema's own OUTPUT (react-hook-form
// is typed on it, see profile-form.tsx / session-form.tsx). That is only sound
// when parse(parse(x)) === parse(x). signUpSchema/signInSchema only trim/lowercase,
// which are naturally idempotent, but the assertion is added here too so the
// property is proven uniformly rather than assumed for this schema alone.
describe("idempotence (parse(parse(x)) === parse(x))", () => {
  it("signUpSchema round-trips", () => {
    const input = { fullName: "Bagas Kara", email: "Bagas@Example.com ", password: "supersecret" };
    const once = signUpSchema.parse(input);
    expect(signUpSchema.parse(once)).toEqual(once);
  });

  it("signInSchema round-trips", () => {
    const input = { email: "Bagas@Example.com ", password: "old" };
    const once = signInSchema.parse(input);
    expect(signInSchema.parse(once)).toEqual(once);
  });

  it("profileSchema round-trips with all optional fields blank", () => {
    const input = { fullName: "Bagas", phone: "", avatarUrl: "" };
    const once = profileSchema.parse(input);
    expect(profileSchema.parse(once)).toEqual(once);
  });

  it("profileSchema round-trips with all optional fields filled", () => {
    const input = { fullName: "Bagas", phone: "+62 812 3456 7890", avatarUrl: "https://example.com/a.png" };
    const once = profileSchema.parse(input);
    expect(profileSchema.parse(once)).toEqual(once);
  });

  const sessionValid = {
    title: "Friday Night Badminton",
    startsAt: "2026-10-02T19:00",
    endsAt: "2026-10-02T22:00",
    location: "GOR Jakarta Barat",
    courtCount: "4",
    maxParticipants: "16",
    waitlistCapacity: "4",
    registrationState: "open",
    status: "scheduled",
  };

  it("sessionSchema round-trips with all optional fields blank", () => {
    const input = { ...sessionValid, description: "", locationUrl: "" };
    const once = sessionSchema.parse(input);
    expect(sessionSchema.parse(once)).toEqual(once);
  });

  it("sessionSchema round-trips with all optional fields filled", () => {
    const input = {
      ...sessionValid,
      description: "Bring your own shuttle",
      locationUrl: "https://maps.example.com/x",
    };
    const once = sessionSchema.parse(input);
    expect(sessionSchema.parse(once)).toEqual(once);
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
    price: "",
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

  it("treats a blank price as null", () => {
    const result = sessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price).toBeNull();
  });

  it("coerces a numeric price string", () => {
    const result = sessionSchema.safeParse({ ...valid, price: "45000" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price).toBe(45000);
  });

  it("rejects a negative price", () => {
    expect(sessionSchema.safeParse({ ...valid, price: "-1" }).success).toBe(false);
  });
});

describe("setCheckedInSchema", () => {
  const valid = {
    participantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
    checkedIn: true,
  };

  it("accepts a valid check-in", () => {
    expect(setCheckedInSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid check-out", () => {
    expect(setCheckedInSchema.safeParse({ ...valid, checkedIn: false }).success).toBe(true);
  });

  it("rejects a non-uuid participantId", () => {
    expect(setCheckedInSchema.safeParse({ ...valid, participantId: "nope" }).success).toBe(false);
  });

  it("rejects a non-boolean checkedIn", () => {
    expect(setCheckedInSchema.safeParse({ ...valid, checkedIn: "true" }).success).toBe(false);
  });
});

describe("setPaidSchema", () => {
  it("accepts a valid payload", () => {
    const result = setPaidSchema.safeParse({
      participantId: "3fa85f64-5717-4562-b3fc-2c963f66afa8",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa9",
      paid: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid participantId", () => {
    const result = setPaidSchema.safeParse({
      participantId: "not-a-uuid",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa9",
      paid: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("createCourtSchema", () => {
  it("accepts a valid sessionId", () => {
    expect(createCourtSchema.safeParse({ sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }).success).toBe(true);
  });

  it("rejects a non-uuid sessionId", () => {
    expect(createCourtSchema.safeParse({ sessionId: "nope" }).success).toBe(false);
  });
});

describe("setCourtStatusSchema", () => {
  const valid = {
    courtId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
    status: "in_use",
  };

  it("accepts each valid court_status value", () => {
    for (const status of ["idle", "in_use", "unavailable"]) {
      expect(setCourtStatusSchema.safeParse({ ...valid, status }).success).toBe(true);
    }
  });

  it("rejects a status outside the court_status enum", () => {
    expect(setCourtStatusSchema.safeParse({ ...valid, status: "closed" }).success).toBe(false);
  });

  it("rejects a non-uuid courtId", () => {
    expect(setCourtStatusSchema.safeParse({ ...valid, courtId: "nope" }).success).toBe(false);
  });
});

describe("deleteCourtSchema", () => {
  it("accepts a valid courtId and sessionId", () => {
    const result = deleteCourtSchema.safeParse({
      courtId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid sessionId", () => {
    const result = deleteCourtSchema.safeParse({
      courtId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      sessionId: "nope",
    });
    expect(result.success).toBe(false);
  });
});

describe("createMatchSchema", () => {
  const valid = {
    sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    courtId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
    team1: ["3fa85f64-5717-4562-b3fc-2c963f66afa1"],
    team2: ["3fa85f64-5717-4562-b3fc-2c963f66afa2"],
  };

  it("accepts a valid 1v1 match", () => {
    expect(createMatchSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid 2v2 match", () => {
    const result = createMatchSchema.safeParse({
      ...valid,
      team1: ["3fa85f64-5717-4562-b3fc-2c963f66afa1", "3fa85f64-5717-4562-b3fc-2c963f66afa3"],
      team2: ["3fa85f64-5717-4562-b3fc-2c963f66afa2", "3fa85f64-5717-4562-b3fc-2c963f66afa4"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty team1", () => {
    expect(createMatchSchema.safeParse({ ...valid, team1: [] }).success).toBe(false);
  });

  it("rejects an empty team2", () => {
    expect(createMatchSchema.safeParse({ ...valid, team2: [] }).success).toBe(false);
  });

  it("rejects mismatched team sizes", () => {
    const result = createMatchSchema.safeParse({
      ...valid,
      team1: ["3fa85f64-5717-4562-b3fc-2c963f66afa1", "3fa85f64-5717-4562-b3fc-2c963f66afa3"],
      team2: ["3fa85f64-5717-4562-b3fc-2c963f66afa2"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "team2")).toBe(true);
    }
  });

  it("rejects a participant assigned to both teams", () => {
    const shared = "3fa85f64-5717-4562-b3fc-2c963f66afa1";
    const result = createMatchSchema.safeParse({ ...valid, team1: [shared], team2: [shared] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid courtId", () => {
    expect(createMatchSchema.safeParse({ ...valid, courtId: "nope" }).success).toBe(false);
  });
});

describe("matchIdSchema", () => {
  it("accepts a valid matchId and sessionId", () => {
    const result = matchIdSchema.safeParse({
      matchId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid matchId", () => {
    const result = matchIdSchema.safeParse({
      matchId: "nope",
      sessionId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
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
