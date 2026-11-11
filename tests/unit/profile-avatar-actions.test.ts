import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const createClient = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/dal/user", () => ({ getCurrentUser: () => getCurrentUser() }));

import { removeAvatar, setAvatar, updateProfile } from "@/lib/actions/profile";
import { avatarPublicUrl } from "@/lib/avatar/url";

const BASE = "https://proj.supabase.co";

type Opts = {
  updateError?: { code: string } | null;
  removeThrows?: boolean;
  removeError?: { message: string } | null;
};

function makeClient(opts: Opts = {}) {
  const remove = vi.fn(async (paths: string[]) => {
    void paths;
    if (opts.removeThrows) throw new Error("storage down");
    return { error: opts.removeError ?? null };
  });
  const storageFrom = vi.fn(() => ({ remove }));
  const eq = vi.fn(async () => ({ error: opts.updateError ?? null }));
  const update = vi.fn((payload: Record<string, unknown>) => {
    void payload;
    return { eq };
  });
  const from = vi.fn((table: string) => {
    void table;
    return { update };
  });
  return { client: { from, storage: { from: storageFrom } }, remove, storageFrom, update, eq, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE);
  getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("setAvatar", () => {
  it("fails when unauthenticated and writes nothing", async () => {
    getCurrentUser.mockResolvedValue(null);
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const res = await setAvatar({ ext: "webp", version: 1 });
    expect(res).toMatchObject({ ok: false, code: "not_authenticated" });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });

  it.each([
    { ext: "png", version: 1 },
    { ext: "webp", version: 0 },
    { ext: "webp", version: 1.5 },
  ])("rejects invalid input %j", async (input) => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const res = await setAvatar(input as never);
    expect(res).toMatchObject({ ok: false, code: "validation" });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("stores the derived url, removes the other extension, revalidates", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const res = await setAvatar({ ext: "webp", version: 7 });
    const url = avatarPublicUrl(BASE, "u1", "webp", 7);
    expect(res).toEqual({ ok: true, data: { avatarUrl: url } });
    expect(m.update).toHaveBeenCalledWith({ avatar_url: url });
    expect(m.eq).toHaveBeenCalledWith("id", "u1");
    expect(m.storageFrom).toHaveBeenCalledWith("avatars");
    expect(m.remove).toHaveBeenCalledWith(["u1/avatar.jpg"]);
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("removes the webp object when ext is jpg", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    await setAvatar({ ext: "jpg", version: 2 });
    expect(m.remove).toHaveBeenCalledWith(["u1/avatar.webp"]);
  });

  it("ignores storage removal errors", async () => {
    const m = makeClient({ removeThrows: true });
    createClient.mockResolvedValue(m.client);
    const res = await setAvatar({ ext: "webp", version: 3 });
    expect(res.ok).toBe(true);
  });

  it("returns an unknown failure on a database error", async () => {
    const m = makeClient({ updateError: { code: "X" } });
    createClient.mockResolvedValue(m.client);
    const res = await setAvatar({ ext: "webp", version: 3 });
    expect(res).toMatchObject({ ok: false, code: "unknown", message: "Could not save your photo." });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
});

describe("removeAvatar", () => {
  it("fails when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const res = await removeAvatar();
    expect(res).toMatchObject({ ok: false, code: "not_authenticated" });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("removes both objects and nulls the column", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const res = await removeAvatar();
    expect(res).toEqual({ ok: true, data: null });
    expect(m.storageFrom).toHaveBeenCalledWith("avatars");
    expect(m.remove).toHaveBeenCalledWith(["u1/avatar.webp", "u1/avatar.jpg"]);
    expect(m.from).toHaveBeenCalledWith("profiles");
    expect(m.update).toHaveBeenCalledWith({ avatar_url: null });
    expect(m.eq).toHaveBeenCalledWith("id", "u1");
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a failure and keeps the column when storage returns an error", async () => {
    const m = makeClient({ removeError: { message: "nope" } });
    createClient.mockResolvedValue(m.client);
    const res = await removeAvatar();
    expect(res).toMatchObject({ ok: false, code: "unknown", message: "Could not remove your photo." });
    expect(m.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a failure and keeps the column when storage throws", async () => {
    const m = makeClient({ removeThrows: true });
    createClient.mockResolvedValue(m.client);
    const res = await removeAvatar();
    expect(res).toMatchObject({ ok: false, code: "unknown", message: "Could not remove your photo." });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("returns an unknown failure on a database error", async () => {
    const m = makeClient({ updateError: { code: "X" } });
    createClient.mockResolvedValue(m.client);
    const res = await removeAvatar();
    expect(res).toMatchObject({ ok: false, code: "unknown", message: "Could not save your photo." });
  });
});

describe("updateProfile", () => {
  it("writes full_name and never avatar_url", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    await updateProfile({ fullName: "Bagas", phone: null } as never);
    expect(m.from.mock.calls[0][0]).toBe("profiles");
    const first = m.update.mock.calls[0][0];
    expect(first).toEqual({ full_name: "Bagas" });
    expect("avatar_url" in first).toBe(false);
  });
});
