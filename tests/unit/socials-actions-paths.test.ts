import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const rpc = vi.fn();
const createClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/dal/user", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));

import { createSocialLink } from "@/lib/actions/socials";

const valid = {
  platform: "instagram" as const,
  url: "https://instagram.com/jakbar",
  label: "Instagram",
  isVisible: true,
};

describe("createSocialLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: "11111111-1111-4111-8111-111111111111", error: null });
    createClient.mockResolvedValue({ rpc });
  });

  it("revalidates both social paths and /admin on success", async () => {
    const result = await createSocialLink(valid);
    expect(result).toEqual({ ok: true, data: { id: "11111111-1111-4111-8111-111111111111" } });
    expect(rpc).toHaveBeenCalledWith("social_link_create", {
      p_platform: "instagram",
      p_url: "https://instagram.com/jakbar",
      p_label: "Instagram",
      p_is_visible: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/(marketing)", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/(marketing)/partner", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("returns validation and skips the client on invalid input", async () => {
    const result = await createSocialLink({ ...valid, url: "http://x.com" });
    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(createClient).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
