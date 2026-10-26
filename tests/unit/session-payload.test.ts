import { describe, expect, it } from "vitest";
import { sessionUpdatePayload } from "@/lib/actions/session-payload";
import type { SessionInput } from "@/lib/validation/session";

const validSessionInput: SessionInput = {
  title: "Friday Night Badminton",
  description: null,
  startsAt: "2026-10-02T19:00:00.000Z",
  endsAt: "2026-10-02T21:00:00.000Z",
  location: "SBM Sport Club Citra",
  locationUrl: null,
  price: 45000,
  kind: "open_play",
  premiumSurchargeIdr: 0,
  coachCount: null,
  seatsPerCoach: null,
  courtCount: 3,
  maxParticipants: 20,
  waitlistCapacity: 5,
  registrationState: "open",
  status: "scheduled",
};

describe("sessionUpdatePayload", () => {
  // court_count is reconciled exclusively through the manage page's
  // add/delete court controls (guard_court_delete trigger); writing it here
  // would desync sessions.court_count from the actual courts rows. This is
  // the single most safety-critical property of the edit flow, so it gets
  // an explicit regression test rather than relying on the code comment
  // above sessionUpdatePayload alone.
  it("never includes court_count, even though it is part of SessionInput", () => {
    expect(Object.keys(sessionUpdatePayload(validSessionInput, "open_play"))).not.toContain("court_count");
  });

  it("maps every other SessionInput field to its snake_case DB column", () => {
    expect(sessionUpdatePayload(validSessionInput, "open_play")).toEqual({
      title: "Friday Night Badminton",
      description: null,
      starts_at: "2026-10-02T19:00:00.000Z",
      ends_at: "2026-10-02T21:00:00.000Z",
      location: "SBM Sport Club Citra",
      location_url: null,
      price: 45000,
      premium_surcharge_idr: 0,
      max_participants: 20,
      waitlist_capacity: 5,
      registration_state: "open",
      status: "scheduled",
    });
  });

  const drillingInput: SessionInput = {
    ...validSessionInput,
    kind: "drilling",
    premiumSurchargeIdr: 25000,
    coachCount: 2,
    seatsPerCoach: 4,
    courtCount: 2,
    maxParticipants: 8,
  };

  // Drilling capacity is owned by adjust_drilling_capacity (it promotes the
  // waitlist and reconciles courts); an edit must not write around it.
  it("omits max_participants and the drilling-owned columns for a drilling session", () => {
    const keys = Object.keys(sessionUpdatePayload(drillingInput, "drilling"));
    for (const column of ["max_participants", "court_count", "kind", "coach_count", "seats_per_coach"]) {
      expect(keys).not.toContain(column);
    }
  });

  it("keeps max_participants for open play and never writes kind or coach columns", () => {
    const keys = Object.keys(sessionUpdatePayload(validSessionInput, "open_play"));
    expect(keys).toContain("max_participants");
    for (const column of ["kind", "coach_count", "seats_per_coach"]) {
      expect(keys).not.toContain(column);
    }
  });

  it("always writes premium_surcharge_idr", () => {
    expect(sessionUpdatePayload(drillingInput, "drilling").premium_surcharge_idr).toBe(25000);
    expect(sessionUpdatePayload(validSessionInput, "open_play").premium_surcharge_idr).toBe(0);
  });
});
