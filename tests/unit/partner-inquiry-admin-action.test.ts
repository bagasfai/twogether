import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const maybeSingle = vi.fn();
const createClient = vi.fn();
const update = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/dal/user", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));

import { setPartnerInquiryStatus } from "@/lib/actions/partner-inquiry-admin";

const id = "11111111-1111-4111-8111-111111111111";

describe("setPartnerInquiryStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { eq: vi.fn(), select: vi.fn(), maybeSingle };
    chain.eq.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    update.mockReturnValue(chain);
    createClient.mockResolvedValue({ from: () => ({ update }) });
  });

  it("returns validation and skips the client on invalid input", async () => {
    const result = await setPartnerInquiryStatus({ id: "nope", status: "replied" });
    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns not_authorized when zero rows are updated", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await setPartnerInquiryStatus({ id, status: "replied" });
    expect(result).toMatchObject({ ok: false, code: "not_authorized" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps 42501 to not_authorized", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    const result = await setPartnerInquiryStatus({ id, status: "closed" });
    expect(result).toMatchObject({ ok: false, code: "not_authorized" });
  });

  it("updates status only and revalidates /admin on success", async () => {
    maybeSingle.mockResolvedValue({ data: { id }, error: null });
    const result = await setPartnerInquiryStatus({ id, status: "replied" });
    expect(result).toEqual({ ok: true, data: null });
    expect(update).toHaveBeenCalledWith({ status: "replied" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });
});
