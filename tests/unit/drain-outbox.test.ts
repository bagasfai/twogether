import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainEmailOutbox } from "@/lib/email/drain-outbox";

type Row = {
  id: string;
  user_id: string;
  session_id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  claimed_at: string | null;
  sent_at: string | null;
  last_error: string | null;
};

type SessionRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  status: string;
};

const FUTURE_START = "2099-01-01T01:00:00Z";
const FUTURE_END = "2099-01-01T03:00:00Z";

function makeRow(over: Partial<Row> & { id: string }): Row {
  return {
    user_id: "u1",
    session_id: "s1",
    type: "registration_confirmed",
    payload: {},
    attempts: 0,
    claimed_at: null,
    sent_at: null,
    last_error: null,
    ...over,
  };
}

function makeFakes(opts: {
  rows: Row[];
  sessions?: SessionRow[];
  noEmailFor?: string[];
  sendError?: boolean;
  sendResult?: (call: number) => { data: unknown; error: unknown };
  claimError?: boolean;
}) {
  const db = { now: Date.parse("2026-11-17T00:00:00Z") };
  const rows = opts.rows;
  const sessions = opts.sessions ?? [
    {
      id: "s1",
      title: "Sabtu Pagi",
      starts_at: FUTURE_START,
      ends_at: FUTURE_END,
      location: "GOR Jakbar",
      status: "open",
    },
  ];

  const rpc = vi.fn(async (_name: string, args: { p_limit: number }) => {
    if (opts.claimError) return { data: null, error: { message: "rpc down" } };
    const claimable = rows
      .filter(
        (r) =>
          r.sent_at === null &&
          r.attempts < 3 &&
          (r.claimed_at === null || Date.parse(r.claimed_at) < db.now - 10 * 60 * 1000),
      )
      .slice(0, args.p_limit);
    for (const r of claimable) {
      r.claimed_at = new Date(db.now).toISOString();
      r.attempts += 1;
    }
    return { data: claimable.map((r) => ({ ...r })), error: null };
  });

  const supabase = {
    rpc,
    from(table: string) {
      if (table === "email_outbox") {
        return {
          update(patch: Partial<Row>) {
            return {
              eq(_col: string, id: string) {
                const row = rows.find((r) => r.id === id);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "sessions") {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: () =>
                Promise.resolve({ data: sessions.find((s) => s.id === id) ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { full_name: "Budi" }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) =>
          opts.noEmailFor?.includes(id)
            ? { data: { user: { email: undefined } }, error: null }
            : { data: { user: { email: id === "u1" ? "a@test.local" : `${id}@test.local` } }, error: null },
        ),
      },
    },
  };

  let sendCalls = 0;
  const send = vi.fn(async () => {
    sendCalls += 1;
    if (opts.sendResult) return opts.sendResult(sendCalls);
    return opts.sendError
      ? { data: null, error: { name: "x", message: "boom" } }
      : { data: { id: "e1" }, error: null };
  });
  const resend = { emails: { send } };

  return { rows, rpc, supabase, resend, send, db };
}

async function run(
  f: ReturnType<typeof makeFakes>,
  extra: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
) {
  return drainEmailOutbox({
    sleep: async () => {},
    ...extra,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: f.supabase as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resend: f.resend as any,
  });
}

function manyRows(n: number) {
  return Array.from({ length: n }, (_, i) => makeRow({ id: `r${i}` }));
}

describe("drainEmailOutbox", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    vi.stubEnv("RESEND_EMAIL_DOMAIN", "example.test");
  });

  it("sends a claimed row and closes it", async () => {
    const f = makeFakes({ rows: [makeRow({ id: "r1" })] });
    expect(await run(f)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(f.rows[0].sent_at).not.toBeNull();
    expect(f.send).toHaveBeenCalledTimes(1);
    const [payload, options] = f.send.mock.calls[0] as unknown as [
      { from: string; to: string[]; subject: string; html: string },
      { idempotencyKey: string },
    ];
    expect(payload.to).toEqual(["a@test.local"]);
    expect(payload.subject).toBe("Pendaftaran kamu terkonfirmasi: Sabtu Pagi");
    expect(payload.from).toBe("Jakbar Twogether <no-reply@example.test>");
    expect(payload.html).toContain("Sabtu Pagi");
    expect(options).toEqual({ idempotencyKey: "r1" });
  });

  it("keeps the claim and stores the error when Resend fails", async () => {
    const f = makeFakes({ rows: [makeRow({ id: "r1" })], sendError: true });
    expect(await run(f)).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(f.rows[0].claimed_at).not.toBeNull();
    expect(f.rows[0].attempts).toBe(1);
    expect(f.rows[0].last_error).toBe("boom");
    expect(f.rows[0].sent_at).toBeNull();
  });

  it("continues past a recipient with no address", async () => {
    const f = makeFakes({
      rows: [makeRow({ id: "r1", user_id: "u-bad" }), makeRow({ id: "r2", user_id: "u2" })],
      noEmailFor: ["u-bad"],
    });
    expect(await run(f)).toEqual({ sent: 1, failed: 1, skipped: 0 });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.rows[0].claimed_at).not.toBeNull();
    expect(f.rows[0].last_error).toBeTruthy();
    expect(f.rows[0].sent_at).toBeNull();
    expect(f.rows[1].sent_at).not.toBeNull();
  });

  it("closes rows for an ended session as stale without sending", async () => {
    const f = makeFakes({
      rows: [makeRow({ id: "r1" })],
      sessions: [
        {
          id: "s1",
          title: "Sabtu Pagi",
          starts_at: "2020-01-01T01:00:00Z",
          ends_at: "2020-01-01T03:00:00Z",
          location: "GOR",
          status: "completed",
        },
      ],
    });
    expect(await run(f)).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(f.send).not.toHaveBeenCalled();
    expect(f.rows[0].last_error).toBe("stale");
    expect(f.rows[0].sent_at).not.toBeNull();
  });

  it("closes a receipt as stale when the session is cancelled", async () => {
    const f = makeFakes({
      rows: [makeRow({ id: "r1", type: "registration_confirmed" })],
      sessions: [
        {
          id: "s1",
          title: "Sabtu Pagi",
          starts_at: FUTURE_START,
          ends_at: FUTURE_END,
          location: "GOR",
          status: "cancelled",
        },
      ],
    });
    expect(await run(f)).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(f.send).not.toHaveBeenCalled();
    expect(f.rows[0].last_error).toBe("stale");
    expect(f.rows[0].sent_at).not.toBeNull();
  });

  it("still sends session_cancelled for a cancelled session", async () => {
    const f = makeFakes({
      rows: [makeRow({ id: "r1", type: "session_cancelled" })],
      sessions: [
        {
          id: "s1",
          title: "Sabtu Pagi",
          starts_at: FUTURE_START,
          ends_at: FUTURE_END,
          location: "GOR",
          status: "cancelled",
        },
      ],
    });
    expect(await run(f)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("claims nothing when the email domain is unset", async () => {
    vi.stubEnv("RESEND_EMAIL_DOMAIN", "");
    const f = makeFakes({ rows: [makeRow({ id: "r1" })] });
    expect(await run(f)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.rows[0].claimed_at).toBeNull();
  });

  it("claims nothing when the site url is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const f = makeFakes({ rows: [makeRow({ id: "r1" })] });
    expect(await run(f)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("claims nothing when the api key is unset and no resend is injected", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const f = makeFakes({ rows: [makeRow({ id: "r1" })] });
    const result = await drainEmailOutbox({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: f.supabase as any,
      sleep: async () => {},
    });
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("never throws when the claim rpc errors", async () => {
    const f = makeFakes({ rows: [makeRow({ id: "r1" })], claimError: true });
    await expect(run(f)).resolves.toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(f.send).not.toHaveBeenCalled();
  });

  it("stops after a short batch", async () => {
    const f = makeFakes({
      rows: [makeRow({ id: "r1" }), makeRow({ id: "r2" }), makeRow({ id: "r3" })],
    });
    expect(await run(f)).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith("claim_email_outbox", { p_limit: 10 });
  });

  it("drains at most 10 batches of 10", async () => {
    const f = makeFakes({ rows: manyRows(220) });
    expect(await run(f)).toEqual({ sent: 100, failed: 0, skipped: 0 });
    expect(f.rpc).toHaveBeenCalledTimes(10);
  });

  it("never claims a failed row twice in one drain", async () => {
    const f = makeFakes({ rows: manyRows(25), sendError: true });
    expect(await run(f)).toEqual({ sent: 0, failed: 25, skipped: 0 });
    expect(f.send).toHaveBeenCalledTimes(25);
    expect(f.rows.map((r) => r.attempts)).toEqual(Array(25).fill(1));
    expect(f.rows.every((r) => r.claimed_at !== null && r.sent_at === null)).toBe(true);
  });

  it("does not re-claim a full batch of failures in the same drain", async () => {
    const f = makeFakes({ rows: manyRows(10), sendError: true });
    await run(f);
    expect(f.rows.map((r) => r.attempts)).toEqual(Array(10).fill(1));
    expect(f.send).toHaveBeenCalledTimes(10);
  });

  it("retries a failed row only after the stale window and stops at 3 attempts", async () => {
    const f = makeFakes({ rows: [makeRow({ id: "r1" })], sendError: true });
    await run(f);
    await run(f);
    expect(f.rows[0].attempts).toBe(1);
    f.db.now += 11 * 60 * 1000;
    await run(f);
    expect(f.rows[0].attempts).toBe(2);
    f.db.now += 11 * 60 * 1000;
    await run(f);
    f.db.now += 11 * 60 * 1000;
    await run(f);
    expect(f.rows[0].attempts).toBe(3);
    expect(f.send).toHaveBeenCalledTimes(3);
  });

  it("sleeps after a failed send", async () => {
    const sleep = vi.fn(async () => {});
    const f = makeFakes({ rows: manyRows(3), sendError: true });
    await run(f, { sleep });
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("does not sleep when no send was made", async () => {
    const sleep = vi.fn(async () => {});
    const f = makeFakes({ rows: [makeRow({ id: "r1", user_id: "u-bad" })], noEmailFor: ["u-bad"] });
    await run(f, { sleep });
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ["rate_limit_exceeded", 429],
    ["daily_quota_exceeded", 429],
    ["monthly_quota_exceeded", 429],
    ["application_error", 429],
    ["rate_limit_exceeded", null],
  ])("stops the drain on %s (%s) without burning attempts", async (name, statusCode) => {
    const f = makeFakes({
      rows: manyRows(25),
      sendResult: (call) =>
        call < 3
          ? { data: { id: "e" }, error: null }
          : { data: null, error: { name, statusCode, message: "limited" } },
    });
    const result = await run(f);
    expect(result).toEqual({ sent: 2, failed: 1, skipped: 0 });
    expect(f.send).toHaveBeenCalledTimes(3);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rows[0].sent_at).not.toBeNull();
    expect(f.rows[1].sent_at).not.toBeNull();
    expect(f.rows[2].attempts).toBe(0);
    expect(f.rows[2].claimed_at).not.toBeNull();
    expect(f.rows[2].last_error).toBe("limited");
    for (const r of f.rows.slice(3, 10)) {
      expect(r.attempts).toBe(0);
      expect(r.claimed_at).toBeNull();
    }
    for (const r of f.rows.slice(10)) {
      expect(r.attempts).toBe(0);
      expect(r.claimed_at).toBeNull();
    }
  });

  it("does not treat an ordinary error as a rate limit", async () => {
    const f = makeFakes({
      rows: manyRows(3),
      sendResult: () => ({
        data: null,
        error: { name: "validation_error", statusCode: 422, message: "bad" },
      }),
    });
    expect(await run(f)).toEqual({ sent: 0, failed: 3, skipped: 0 });
    expect(f.send).toHaveBeenCalledTimes(3);
  });

  it("releases untried rows with their attempt restored when the budget expires mid-batch", async () => {
    let t = 0;
    const f = makeFakes({ rows: manyRows(25) });
    const result = await run(f, {
      now: () => t,
      sleep: async () => {
        t += 20_000;
      },
    });
    expect(result).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(f.send).toHaveBeenCalledTimes(3);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    for (const r of f.rows.slice(0, 3)) expect(r.sent_at).not.toBeNull();
    for (const r of f.rows.slice(3)) {
      expect(r.attempts).toBe(0);
      expect(r.claimed_at).toBeNull();
      expect(r.sent_at).toBeNull();
    }
  });

  it("does not claim another batch once the budget has expired", async () => {
    let t = 0;
    const f = makeFakes({ rows: manyRows(20) });
    const result = await run(f, {
      now: () => t,
      sleep: async () => {
        t += 4_600;
      },
    });
    expect(result).toEqual({ sent: 10, failed: 0, skipped: 0 });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    for (const r of f.rows.slice(10)) {
      expect(r.attempts).toBe(0);
      expect(r.claimed_at).toBeNull();
    }
  });
});
