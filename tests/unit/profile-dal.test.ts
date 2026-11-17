import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/dal/user", () => ({ getCurrentUser: () => getCurrentUser() }));

import { getMyProfile } from "@/lib/dal/profile";

type Result = { data: Record<string, unknown> | null; error: { message: string } | null };

function makeClient(results: Record<string, Result>) {
  return {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => results[table] }) }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1", fullName: "Budi", avatarUrl: null, role: "member" });
});

describe("getMyProfile", () => {
  it("returns the stored reminder opt-out", async () => {
    createClient.mockResolvedValue(
      makeClient({
        profiles_private: { data: { phone: "0812", gender: null }, error: null },
        profiles: { data: { email_reminders: false }, error: null },
      }),
    );
    const profile = await getMyProfile();
    expect(profile?.emailReminders).toBe(false);
    expect(profile?.phone).toBe("0812");
  });

  it("throws when the reminder preference cannot be read", async () => {
    createClient.mockResolvedValue(
      makeClient({
        profiles_private: { data: { phone: "0812", gender: null }, error: null },
        profiles: { data: null, error: { message: "boom" } },
      }),
    );
    await expect(getMyProfile()).rejects.toThrow();
  });

  it("throws when the phone and gender cannot be read", async () => {
    createClient.mockResolvedValue(
      makeClient({
        profiles_private: { data: null, error: { message: "boom" } },
        profiles: { data: { email_reminders: true }, error: null },
      }),
    );
    await expect(getMyProfile()).rejects.toThrow();
  });
});
