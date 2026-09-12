import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/redirect";

describe("safeNext", () => {
  it("keeps an ordinary in-app path", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
  });

  it("keeps a path with a query string", () => {
    expect(safeNext("/sessions/abc?tab=roster")).toBe("/sessions/abc?tab=roster");
  });

  it("falls back to /dashboard when absent", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("rejects an absolute URL", () => {
    expect(safeNext("https://evil.example.com/steal")).toBe("/dashboard");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeNext("//evil.example.com")).toBe("/dashboard");
  });

  it("rejects a backslash-prefixed path, which some browsers normalise to //", () => {
    expect(safeNext("/\\evil.example.com")).toBe("/dashboard");
  });

  it("rejects a path that does not start with a slash", () => {
    expect(safeNext("dashboard")).toBe("/dashboard");
  });
});
