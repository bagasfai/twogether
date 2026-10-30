import { describe, expect, it, vi } from "vitest";
import { submitInquiryCore } from "@/lib/partner/submit-inquiry";
import { hashIp } from "@/lib/partner/ip-hash";

const valid = {
  name: "Budi",
  organisation: "Acme",
  email: "budi@acme.test",
  whatsapp: "0812-3456-7890",
  inquiryType: "sponsorship",
  message: "We would like to sponsor your sessions.",
  website: "",
};
const SALT = "salt";
const NOW = new Date("2026-10-29T12:00:00Z");

function makeFakes(count: number) {
  const insert = vi.fn((row: Record<string, unknown>) => (void row, {
    select: () => ({ single: () => Promise.resolve({ data: { id: "new-id" }, error: null }) }),
  }));
  const gte = vi.fn((...args: [string, string]) => (void args, Promise.resolve({ count, error: null })));
  const eq = vi.fn((...args: [string, string]) => (void args, { gte }));
  const select = vi.fn((...args: [string, unknown]) => (void args, { eq }));
  const supabase = { from: () => ({ select, insert }) };
  const sendEmail = vi.fn(async (...args: [string]) => (void args, { sent: true }));
  return { insert, gte, eq, supabase, sendEmail };
}

function run(f: ReturnType<typeof makeFakes>, input: unknown = valid, ip: string | null = "1.2.3.4") {
  return submitInquiryCore(input, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: f.supabase as any,
    ip,
    salt: SALT,
    now: () => NOW,
    sendEmail: f.sendEmail,
  });
}

describe("submitInquiryCore", () => {
  it("returns ok without inserting when the honeypot is filled", async () => {
    const f = makeFakes(0);
    expect(await run(f, { ...valid, website: "x" })).toEqual({ ok: true, data: null });
    expect(f.insert).not.toHaveBeenCalled();
    expect(f.sendEmail).not.toHaveBeenCalled();
  });

  it("returns validation failure for bad input", async () => {
    const f = makeFakes(0);
    const r = await run(f, { ...valid, whatsapp: "12345" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("validation");
    expect(f.insert).not.toHaveBeenCalled();
  });

  it("rate limits at 3 inquiries in the last hour", async () => {
    const f = makeFakes(3);
    const r = await run(f);
    expect(r).toMatchObject({ ok: false, code: "rate_limited" });
    expect(f.insert).not.toHaveBeenCalled();
  });

  it("inserts with the ip hash and sends the email when under the limit", async () => {
    const f = makeFakes(2);
    expect(await run(f)).toEqual({ ok: true, data: null });
    expect(f.insert).toHaveBeenCalledTimes(1);
    const row = f.insert.mock.calls[0][0];
    expect(row.ip_hash).toBe(hashIp("1.2.3.4", SALT));
    expect(row.whatsapp).toBe("+6281234567890");
    expect(row.inquiry_type).toBe("sponsorship");
    expect(f.sendEmail).toHaveBeenCalledWith("new-id");
  });

  it("still succeeds when sendEmail rejects", async () => {
    const f = makeFakes(0);
    f.sendEmail.mockRejectedValueOnce(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run(f)).toEqual({ ok: true, data: null });
    spy.mockRestore();
  });

  it("hashes 'unknown' when there is no ip", async () => {
    const f = makeFakes(0);
    await run(f, valid, null);
    expect(f.insert.mock.calls[0][0].ip_hash).toBe(hashIp("unknown", SALT));
    expect(hashIp(null, SALT)).toBe(hashIp("unknown", SALT));
  });

  it("counts rows for that hash since now - 3600s", async () => {
    const f = makeFakes(0);
    await run(f);
    expect(f.eq).toHaveBeenCalledWith("ip_hash", hashIp("1.2.3.4", SALT));
    expect(f.gte).toHaveBeenCalledWith("created_at", "2026-10-29T11:00:00.000Z");
  });
});
