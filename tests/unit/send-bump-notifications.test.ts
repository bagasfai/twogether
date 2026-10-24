import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPendingBumpNotifications } from "@/lib/email/send-bump-notifications";

type Row = { id: string; participant_id: string; sent_at: string | null };

function makeFakes(opts: { rows: Row[]; sendError?: boolean; lookupError?: boolean }) {
  const rows = opts.rows.map((r) => ({ ...r }));
  const resets: string[] = [];

  const supabase = {
    from(table: string) {
      if (table === "bump_notifications") {
        return {
          update(patch: { sent_at: string | null }) {
            if (patch.sent_at === null) {
              return {
                eq(_col: string, id: string) {
                  resets.push(id);
                  const row = rows.find((r) => r.id === id);
                  if (row) row.sent_at = null;
                  return Promise.resolve({ error: null });
                },
              };
            }
            return {
              is() {
                return {
                  select() {
                    const claimed = rows.filter((r) => r.sent_at === null);
                    for (const r of claimed) r.sent_at = patch.sent_at;
                    return Promise.resolve({
                      data: claimed.map((r) => ({ id: r.id, participant_id: r.participant_id })),
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "participants") {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              single: () =>
                Promise.resolve({
                  data: {
                    user_id: `user-of-${id}`,
                    sessions: { id: "s1", title: "Mabar Jumat", starts_at: "2026-11-01T12:00:00Z" },
                  },
                  error: null,
                }),
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
          opts.lookupError
            ? { data: { user: null }, error: new Error("nope") }
            : { data: { user: { email: `${id}@example.com` } }, error: null },
        ),
      },
    },
  };

  const send = vi.fn(async () =>
    opts.sendError
      ? { data: null, error: { name: "x", message: "boom" } }
      : { data: { id: "e1" }, error: null },
  );
  const resend = { emails: { send } };

  return { rows, resets, supabase, resend, send };
}

async function run(f: ReturnType<typeof makeFakes>) {
  return sendPendingBumpNotifications({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: f.supabase as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resend: f.resend as any,
  });
}

describe("sendPendingBumpNotifications", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    vi.stubEnv("RESEND_EMAIL_DOMAIN", "example.test");
  });

  it("sends one email per claimed row and reports sent count", async () => {
    const f = makeFakes({
      rows: [
        { id: "b1", participant_id: "p1", sent_at: null },
        { id: "b2", participant_id: "p2", sent_at: null },
      ],
    });
    expect(await run(f)).toEqual({ sent: 2, failed: 0 });
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.resets).toEqual([]);
  });

  it("resets sent_at when the email send fails and does not throw", async () => {
    const f = makeFakes({
      rows: [{ id: "b1", participant_id: "p1", sent_at: null }],
      sendError: true,
    });
    expect(await run(f)).toEqual({ sent: 0, failed: 1 });
    expect(f.resets).toEqual(["b1"]);
    expect(f.rows[0].sent_at).toBeNull();
  });

  it("resets sent_at when the user lookup fails", async () => {
    const f = makeFakes({
      rows: [{ id: "b1", participant_id: "p1", sent_at: null }],
      lookupError: true,
    });
    expect(await run(f)).toEqual({ sent: 0, failed: 1 });
    expect(f.send).not.toHaveBeenCalled();
    expect(f.resets).toEqual(["b1"]);
  });

  it("claims only rows with null sent_at", async () => {
    const f = makeFakes({
      rows: [
        { id: "b1", participant_id: "p1", sent_at: "2026-10-01T00:00:00Z" },
        { id: "b2", participant_id: "p2", sent_at: null },
      ],
    });
    expect(await run(f)).toEqual({ sent: 1, failed: 0 });
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("returns zero counts when nothing is pending", async () => {
    const f = makeFakes({ rows: [] });
    expect(await run(f)).toEqual({ sent: 0, failed: 0 });
    expect(f.send).not.toHaveBeenCalled();
  });
});
