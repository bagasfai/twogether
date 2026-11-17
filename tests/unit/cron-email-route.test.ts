import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls: string[] = [];
const rpc = vi.fn();
const drainEmailOutbox = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc }),
}));
vi.mock("@/lib/email/drain-outbox", () => ({
  drainEmailOutbox: (...args: unknown[]) => drainEmailOutbox(...args),
}));

import { GET, maxDuration } from "@/app/api/cron/email/route";
import { isProtected } from "@/proxy";

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/email", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

beforeEach(() => {
  calls.length = 0;
  rpc.mockReset();
  drainEmailOutbox.mockReset();
  rpc.mockImplementation(async () => {
    calls.push("rpc");
    return { data: 3, error: null };
  });
  drainEmailOutbox.mockImplementation(async () => {
    calls.push("drain");
    return { sent: 2, failed: 1, skipped: 0 };
  });
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cron email route", () => {
  it("allows up to 300 seconds", () => {
    expect(maxDuration).toBe(300);
  });

  it("rejects a missing header", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(drainEmailOutbox).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await GET(request("Bearer nope"));
    expect(res.status).toBe(401);
    expect(drainEmailOutbox).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const header of ["Bearer ", "Bearer undefined", "Bearer", undefined]) {
      const res = await GET(request(header));
      expect(res.status).toBe(401);
    }
    delete process.env.CRON_SECRET;
    for (const header of ["Bearer ", "Bearer undefined"]) {
      const res = await GET(request(header));
      expect(res.status).toBe(401);
    }
    expect(drainEmailOutbox).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("queues reminders then drains", async () => {
    const res = await GET(request("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: 3, sent: 2, failed: 1, skipped: 0 });
    expect(rpc).toHaveBeenCalledWith("queue_session_reminders");
    expect(calls).toEqual(["rpc", "drain"]);
  });

  it("still drains when queueing fails", async () => {
    rpc.mockImplementation(async () => {
      calls.push("rpc");
      return { data: null, error: { message: "boom" } };
    });
    const res = await GET(request("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: 0, sent: 2, failed: 1, skipped: 0 });
    expect(drainEmailOutbox).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("is outside the protected routes", () => {
    expect(isProtected("/api/cron/email")).toBe(false);
  });

  it("declares the daily schedule", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.crons).toEqual([{ path: "/api/cron/email", schedule: "0 11 * * *" }]);
  });
});
