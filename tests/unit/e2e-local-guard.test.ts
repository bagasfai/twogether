import { describe, expect, it } from "vitest";
import { appServerProblem, localStackProblem } from "@/tests/e2e/support/local-guard";

describe("localStackProblem", () => {
  it("accepts the local stack on the configured API port", () => {
    expect(localStackProblem("http://127.0.0.1:54331", "54331")).toBeNull();
    expect(localStackProblem("http://localhost:54331", "54331")).toBeNull();
  });

  it("refuses a hosted project", () => {
    expect(localStackProblem("https://abc.supabase.co", "54331")).toMatch(/abc\.supabase\.co/);
  });

  it("refuses a host that only starts with a local address", () => {
    expect(localStackProblem("http://127.0.0.1.evil.example:54331", "54331")).not.toBeNull();
  });

  it("refuses another local stack on a different port", () => {
    expect(localStackProblem("http://127.0.0.1:54321", "54331")).toMatch(/54321.*54331/);
  });

  it("refuses when this project's API port is unknown", () => {
    expect(localStackProblem("http://127.0.0.1:54331", null)).toMatch(/config\.toml/);
  });

  it("refuses a value that is not a URL", () => {
    expect(localStackProblem("not a url", "54331")).toMatch(/not a URL/);
  });
});

describe("appServerProblem", () => {
  const title = "E2E abc123 1";

  it("accepts a page that renders the canary session", () => {
    expect(appServerProblem(200, `<h1>${title}</h1>`, title)).toBeNull();
  });

  it("refuses a server that cannot see the canary session", () => {
    expect(appServerProblem(404, "<h1>Not found</h1>", title)).toMatch(/different Supabase/);
    expect(appServerProblem(200, "<h1>Other session</h1>", title)).toMatch(/different Supabase/);
  });
});
