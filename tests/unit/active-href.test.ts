import { describe, expect, it } from "vitest";
import { activeHref } from "@/lib/nav/active-href";

const hrefs = ["/sessions", "/sessions/new", "/history"];

describe("activeHref", () => {
  it("prefers the longest matching href", () => {
    expect(activeHref("/sessions/new", hrefs)).toBe("/sessions/new");
  });
  it("matches nested routes to the parent", () => {
    expect(activeHref("/sessions/abc/manage", hrefs)).toBe("/sessions");
  });
  it("returns null when nothing matches", () => {
    expect(activeHref("/", ["/sessions"])).toBeNull();
  });
  it("does not match a sibling sharing a prefix", () => {
    expect(activeHref("/sessionsx", hrefs)).toBeNull();
  });
});
