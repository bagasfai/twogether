import { describe, expect, it } from "vitest";
import { sortRotationQueue, type RotationCandidate } from "@/lib/rotation/queue";

function candidate(overrides: Partial<RotationCandidate> & { participantId: string }): RotationCandidate {
  return {
    checkedInAt: "2026-09-13T10:00:00Z",
    lastPlayedAt: null,
    ...overrides,
  };
}

describe("sortRotationQueue", () => {
  it("orders never-played players by check-in time, earliest first", () => {
    const a = candidate({ participantId: "a", checkedInAt: "2026-09-13T10:05:00Z" });
    const b = candidate({ participantId: "b", checkedInAt: "2026-09-13T10:00:00Z" });
    const c = candidate({ participantId: "c", checkedInAt: "2026-09-13T10:10:00Z" });

    expect(sortRotationQueue([a, b, c]).map((p) => p.participantId)).toEqual(["b", "a", "c"]);
  });

  it("orders players who have played by last-played time, oldest first", () => {
    const a = candidate({ participantId: "a", lastPlayedAt: "2026-09-13T11:00:00Z" });
    const b = candidate({ participantId: "b", lastPlayedAt: "2026-09-13T10:30:00Z" });

    expect(sortRotationQueue([a, b]).map((p) => p.participantId)).toEqual(["b", "a"]);
  });

  it("ranks a never-played player ahead of one who played after the never-played player checked in", () => {
    // never-played, checked in at 10:00 -- has been waiting since 10:00
    const neverPlayed = candidate({ participantId: "never", checkedInAt: "2026-09-13T10:00:00Z" });
    // played a match that finished at 11:00 -- has only been waiting since 11:00
    const playedRecently = candidate({
      participantId: "played",
      checkedInAt: "2026-09-13T09:00:00Z",
      lastPlayedAt: "2026-09-13T11:00:00Z",
    });

    expect(sortRotationQueue([playedRecently, neverPlayed]).map((p) => p.participantId)).toEqual(["never", "played"]);
  });

  it("breaks ties deterministically by participantId", () => {
    const a = candidate({ participantId: "b", checkedInAt: "2026-09-13T10:00:00Z" });
    const b = candidate({ participantId: "a", checkedInAt: "2026-09-13T10:00:00Z" });

    expect(sortRotationQueue([a, b]).map((p) => p.participantId)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const a = candidate({ participantId: "a", checkedInAt: "2026-09-13T10:05:00Z" });
    const b = candidate({ participantId: "b", checkedInAt: "2026-09-13T10:00:00Z" });
    const input = [a, b];

    sortRotationQueue(input);

    expect(input).toEqual([a, b]);
  });
});
