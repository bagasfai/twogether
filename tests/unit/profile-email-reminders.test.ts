import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/dal/user", () => ({ getCurrentUser: () => getCurrentUser() }));

import { updateProfile } from "@/lib/actions/profile";

function makeClient() {
  const payloads: Record<string, Record<string, unknown>[]> = {};
  const from = vi.fn((table: string) => ({
    update: (payload: Record<string, unknown>) => {
      (payloads[table] ??= []).push(payload);
      return { eq: async () => ({ error: null }) };
    },
  }));
  return { client: { from }, payloads };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("updateProfile email_reminders", () => {
  it("writes email_reminders when provided", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const res = await updateProfile({ fullName: "Budi", phone: "", emailReminders: false });
    expect(res.ok).toBe(true);
    expect(m.payloads.profiles).toEqual([{ full_name: "Budi", email_reminders: false }]);
  });

  it("does not touch email_reminders when omitted", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const res = await updateProfile({ fullName: "Budi", phone: "" });
    expect(res.ok).toBe(true);
    expect(m.payloads.profiles).toEqual([{ full_name: "Budi" }]);
  });
});
