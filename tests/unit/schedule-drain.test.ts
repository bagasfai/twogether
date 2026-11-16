import { readFileSync } from "node:fs";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainEmailOutbox } from "@/lib/email/drain-outbox";
import { scheduleEmailDrain } from "@/lib/email/schedule-drain";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/email/drain-outbox", () => ({ drainEmailOutbox: vi.fn() }));

const CALL_SITES: Record<string, string[]> = {
  "registration.ts": [
    "registerForSession",
    "cancelRegistration",
    "registerGuestForSession",
    "cancelGuestRegistration",
    "confirmParticipation",
  ],
  "participants.ts": ["setParticipantStatus", "hostAddParticipant"],
  "sessions.ts": ["updateSession", "cancelSession"],
  "transfers.ts": ["transferSeat"],
  "capacity.ts": ["adjustCoachCount"],
};

const runAfterCallback = () => (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scheduleEmailDrain", () => {
  it("defers the drain with after()", async () => {
    vi.mocked(drainEmailOutbox).mockResolvedValue({ sent: 0, failed: 0, skipped: 0 });
    scheduleEmailDrain();
    expect(after).toHaveBeenCalledTimes(1);
    expect(drainEmailOutbox).not.toHaveBeenCalled();
    await runAfterCallback();
    expect(drainEmailOutbox).toHaveBeenCalledTimes(1);
  });

  it("swallows a drain rejection", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(drainEmailOutbox).mockRejectedValue(new Error("boom"));
    scheduleEmailDrain();
    await expect(runAfterCallback()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("call sites", () => {
  it.each(Object.entries(CALL_SITES))("%s schedules a drain in each mutating action", (file, fns) => {
    const src = readFileSync(`lib/actions/${file}`, "utf8");
    for (const fn of fns) {
      const start = src.indexOf(`export async function ${fn}(`);
      expect(start).toBeGreaterThanOrEqual(0);
      const body = src.slice(start);
      const end = body.indexOf("\nexport ", 1);
      expect(body.slice(0, end === -1 ? undefined : end)).toContain("scheduleEmailDrain()");
    }
  });
});
