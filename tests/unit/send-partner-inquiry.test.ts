import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPartnerInquiryEmail } from "@/lib/email/send-partner-inquiry";

function makeFakes(opts: { sendError?: boolean; alreadySent?: boolean } = {}) {
  const row = {
    name: "Budi",
    organisation: "Acme",
    email: "budi@acme.test",
    whatsapp: "+6281234567890",
    inquiry_type: "sponsorship",
    message: "We would like to sponsor your sessions.",
  };
  let emailSentAt: string | null = opts.alreadySent ? "2026-10-01T00:00:00Z" : null;
  const releases: unknown[] = [];
  const update = vi.fn((patch: { email_sent_at: string | null }) => {
    if (patch.email_sent_at === null) {
      return {
        eq() {
          emailSentAt = null;
          releases.push(patch);
          return Promise.resolve({ error: null });
        },
      };
    }
    return {
      eq: () => ({
        is: () => ({
          select: () => {
            if (emailSentAt !== null) return Promise.resolve({ data: [], error: null });
            emailSentAt = patch.email_sent_at;
            return Promise.resolve({ data: [row], error: null });
          },
        }),
      }),
    };
  });
  const supabase = { from: () => ({ update }) };
  const send = vi.fn(async (a: Record<string, unknown>) =>
    (void a, opts.sendError)
      ? { data: null, error: { name: "x", message: "boom" } }
      : { data: { id: "e1" }, error: null },
  );
  return { supabase, resend: { emails: { send } }, send, update, releases, getSentAt: () => emailSentAt };
}

function run(f: ReturnType<typeof makeFakes>) {
  return sendPartnerInquiryEmail("inq-1", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: f.supabase as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resend: f.resend as any,
  });
}

describe("sendPartnerInquiryEmail", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    vi.stubEnv("RESEND_EMAIL_DOMAIN", "example.test");
    vi.stubEnv("PARTNER_INBOX_EMAIL", "inbox@example.test");
    vi.restoreAllMocks();
  });

  it("claims then sends to the inbox with reply-to and subject", async () => {
    const f = makeFakes();
    expect(await run(f)).toEqual({ sent: true });
    expect(f.send).toHaveBeenCalledTimes(1);
    const arg = f.send.mock.calls[0][0];
    expect(arg.to).toEqual(["inbox@example.test"]);
    expect(arg.replyTo).toBe("budi@acme.test");
    expect(arg.subject).toBe("New partner inquiry: Acme (sponsorship)");
    expect(arg.from).toBe("Jakbar Twogether <no-reply@example.test>");
    expect(f.getSentAt()).not.toBeNull();
  });

  it("releases the claim and returns sent false on a Resend error", async () => {
    const f = makeFakes({ sendError: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run(f)).toEqual({ sent: false });
    expect(f.releases).toHaveLength(1);
    expect(f.getSentAt()).toBeNull();
  });

  it("does nothing and warns when PARTNER_INBOX_EMAIL is unset", async () => {
    vi.stubEnv("PARTNER_INBOX_EMAIL", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = makeFakes();
    expect(await run(f)).toEqual({ sent: false });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("sends nothing on a second call after a successful claim", async () => {
    const f = makeFakes();
    await run(f);
    expect(await run(f)).toEqual({ sent: false });
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
