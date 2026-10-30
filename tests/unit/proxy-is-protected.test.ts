import { describe, expect, it } from "vitest";
import { isProtected } from "@/proxy";

describe("isProtected", () => {
  it.each([
    ["/sessions", false],
    ["/sessions/abc", false],
    ["/sessions/abc?tab=roster", false],
    ["/dashboard", true],
    ["/dashboard/x", true],
    ["/profile", true],
    ["/profile/edit", true],
    ["/sessions/new", true],
    ["/sessions/abc/manage", true],
    // Pinned, not an oversight: trailing slash is unmatched here because
    // Next's own trailing-slash redirect (308 to the no-slash form) runs
    // before this guard ever sees the request settle on this path -- see
    // the comment above isProtected in proxy.ts.
    ["/sessions/new/", false],
  ])("isProtected(%s) === %s", (pathname, expected) => {
    expect(isProtected(pathname)).toBe(expected);
  });
});
