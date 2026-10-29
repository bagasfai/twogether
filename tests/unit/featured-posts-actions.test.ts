import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const createClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/dal/user", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));

import {
  createFeaturedPost,
  deleteFeaturedPost,
  updateFeaturedPost,
} from "@/lib/actions/featured-posts";

const ID = "11111111-1111-4111-8111-111111111111";
const OLD = "22222222-2222-4222-8222-222222222222.webp";
const NEW = "33333333-3333-4333-8333-333333333333.jpg";

const valid = {
  platform: "instagram" as const,
  postUrl: "https://instagram.com/p/abc",
  captionEn: "Sunday schedule",
  captionId: "Jadwal Minggu",
  kind: "schedule" as const,
  postedAt: "2026-10-29",
  isVisible: true,
};

type Opts = { updateError?: { code: string } | null; removeError?: { message: string } | null };

function makeClient(opts: Opts = {}) {
  const calls: string[] = [];
  const remove = vi.fn(async (paths: string[]) => {
    calls.push("remove");
    void paths;
    return { error: opts.removeError ?? null };
  });
  const from = vi.fn(() => ({ remove }));
  const update = vi.fn((payload: Record<string, unknown>) => {
    void payload;
    calls.push("update");
    return {
      eq: () => ({
        select: () => ({
          maybeSingle: async () =>
            opts.updateError
              ? { data: null, error: opts.updateError }
              : { data: { id: ID }, error: null },
        }),
      }),
    };
  });
  const del = vi.fn(() => {
    calls.push("delete");
    return {
      eq: () => ({
        select: () => ({
          maybeSingle: async () => ({ data: { image_path: OLD }, error: null }),
        }),
      }),
    };
  });
  const client = {
    from: (table: string) =>
      table === "featured_posts"
        ? {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { image_path: OLD }, error: null }) }),
            }),
            update,
            delete: del,
            insert: vi.fn(),
          }
        : {},
    storage: { from },
  };
  return { client, update, remove, from, calls };
}

describe("updateFeaturedPost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps image_path and storage untouched without a new imagePath", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const result = await updateFeaturedPost(ID, valid);
    expect(result).toEqual({ ok: true, data: null });
    expect(m.update.mock.calls[0][0]).not.toHaveProperty("image_path");
    expect(m.remove).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("updates the row first, then removes the old object", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const result = await updateFeaturedPost(ID, { ...valid, imagePath: NEW });
    expect(result.ok).toBe(true);
    expect(m.update.mock.calls[0][0]).toMatchObject({ image_path: NEW });
    expect(m.from).toHaveBeenCalledWith("featured-posts");
    expect(m.remove).toHaveBeenCalledWith([OLD]);
    expect(m.calls).toEqual(["update", "remove"]);
  });

  it("does not remove the old object when the row update fails", async () => {
    const m = makeClient({ updateError: { code: "XX000" } });
    createClient.mockResolvedValue(m.client);
    const result = await updateFeaturedPost(ID, { ...valid, imagePath: NEW });
    expect(result).toMatchObject({ ok: false });
    expect(m.remove).not.toHaveBeenCalled();
  });
});

describe("deleteFeaturedPost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the row then removes the object", async () => {
    const m = makeClient();
    createClient.mockResolvedValue(m.client);
    const result = await deleteFeaturedPost(ID);
    expect(result).toEqual({ ok: true, data: null });
    expect(m.calls).toEqual(["delete", "remove"]);
    expect(m.remove).toHaveBeenCalledWith([OLD]);
  });

  it("still succeeds and logs when the object removal fails", async () => {
    const m = makeClient({ removeError: { message: "boom" } });
    createClient.mockResolvedValue(m.client);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await deleteFeaturedPost(ID);
    expect(result).toEqual({ ok: true, data: null });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("createFeaturedPost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a path-traversal imagePath as validation", async () => {
    const result = await createFeaturedPost({ ...valid, imagePath: "../x.webp" });
    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
