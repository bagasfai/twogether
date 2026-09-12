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

  // The WHATWG URL parser strips raw tab, LF and CR before parsing a relative
  // reference, so these normalise to "//evil.example.com" (protocol-relative)
  // even though they pass the plain "//" / "/\\" prefix checks above.
  it("rejects a tab-prefixed path that URL parsers strip to protocol-relative", () => {
    expect(safeNext("/\t/evil.example.com")).toBe("/dashboard");
  });

  it("rejects a newline-prefixed protocol-relative path", () => {
    expect(safeNext("/\n//evil.example.com")).toBe("/dashboard");
  });

  it("rejects a carriage-return-prefixed backslash path", () => {
    expect(safeNext("/\r\\evil.example.com")).toBe("/dashboard");
  });

  it("keeps a percent-encoded tab, which stays encoded and is safe", () => {
    expect(safeNext("/%09/evil.example.com")).toBe("/%09/evil.example.com");
  });
});
