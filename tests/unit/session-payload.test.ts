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
    expect(Object.keys(sessionUpdatePayload(validSessionInput))).not.toContain("court_count");
  });

  it("maps every other SessionInput field to its snake_case DB column", () => {
    expect(sessionUpdatePayload(validSessionInput)).toEqual({
      title: "Friday Night Badminton",
      description: null,
      starts_at: "2026-10-02T19:00:00.000Z",
      ends_at: "2026-10-02T21:00:00.000Z",
      location: "SBM Sport Club Citra",
      location_url: null,
      price: 45000,
      max_participants: 20,
      waitlist_capacity: 5,
      registration_state: "open",
      status: "scheduled",
    });
  });
});
