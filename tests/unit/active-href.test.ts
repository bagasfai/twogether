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

describe("activeHref with Hosted in the nav", () => {
  const appHrefs = ["/dashboard", "/sessions", "/hosted", "/history"];

  it("marks Hosted on the new-session page", () => {
    expect(activeHref("/sessions/new", appHrefs)).toBe("/hosted");
  });
  it("marks Hosted on a session's manage page", () => {
    expect(activeHref("/sessions/abc/manage", appHrefs)).toBe("/hosted");
  });
  it("keeps Sessions on a public session page", () => {
    expect(activeHref("/sessions/abc", appHrefs)).toBe("/sessions");
  });
  it("keeps Sessions on host pages when Hosted is not in the nav", () => {
    expect(activeHref("/sessions/abc/manage", ["/sessions", "/history"])).toBe("/sessions");
  });
});
