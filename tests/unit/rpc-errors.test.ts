import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mapRpcError } from "@/lib/errors/rpc";
import { failFromRpc, failFromZod, ok } from "@/lib/actions/result";

describe("mapRpcError", () => {
  const cases = [
    ["JB001", "registration_closed"],
    ["JB002", "session_full"],
    ["JB003", "registration_conflict"],
    ["JB004", "not_authenticated"],
    ["JB005", "invalid_match_player"],
    ["JB006", "wrong_isolation"],
    ["JB007", "not_authorized"],
    ["JB008", "not_found"],
    ["JB009", "court_not_available"],
    ["JB010", "court_has_active_match"],
  ] as const;

  it.each(cases)("maps %s to %s", (pgCode, appCode) => {
    expect(mapRpcError({ code: pgCode, message: "anything at all" }).code).toBe(appCode);
  });

  it("gives every mapped code a non-empty user-facing message", () => {
    for (const [pgCode] of cases) {
      expect(mapRpcError({ code: pgCode }).message.length).toBeGreaterThan(0);
    }
  });

  it("does not leak the raw database message for an internal failure", () => {
    const mapped = mapRpcError({ code: "JB006", message: "requires read committed isolation" });
    expect(mapped.message).not.toContain("isolation");
  });

  it("falls back to unknown for an unrecognised code", () => {
    expect(mapRpcError({ code: "23505", message: "duplicate key" }).code).toBe("unknown");
  });

  it("falls back to unknown for a null error", () => {
    expect(mapRpcError(null).code).toBe("unknown");
  });

  it("ignores the message entirely when deciding the code", () => {
    // a reworded database message must not change the outcome
    expect(mapRpcError({ code: "JB002", message: "no room left" }).code).toBe("session_full");
  });
});

describe("ActionResult", () => {
  it("wraps a success", () => {
    expect(ok({ id: "abc" })).toEqual({ ok: true, data: { id: "abc" } });
  });

  it("turns an rpc error into a failure carrying the mapped code", () => {
    const result = failFromRpc({ code: "JB007", message: "not authorized" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not_authorized");
  });

  it("turns a zod error into field errors keyed by path", () => {
    const schema = z.object({ email: z.email(), name: z.string().min(2) });
    const parsed = schema.safeParse({ email: "nope", name: "x" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const result = failFromZod(parsed.error);
    expect(result.code).toBe("validation");
    expect(result.fieldErrors?.email?.length).toBeGreaterThan(0);
    expect(result.fieldErrors?.name?.length).toBeGreaterThan(0);
  });

  it("files a top-level zod issue under _form", () => {
    const schema = z
      .object({ a: z.number(), b: z.number() })
      .refine((v) => v.b > v.a, { message: "b must exceed a" });
    const parsed = schema.safeParse({ a: 2, b: 1 });
    if (parsed.success) throw new Error("expected a failure");

    expect(failFromZod(parsed.error).fieldErrors?._form?.[0]).toBe("b must exceed a");
  });
});
