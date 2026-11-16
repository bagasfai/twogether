import { describe, expect, it } from "vitest";
import { appNavItems } from "@/lib/nav/app-nav-items";

const labels = (role: Parameters<typeof appNavItems>[0]) =>
  appNavItems(role).map((item) => item.label);

describe("appNavItems", () => {
  it("gives a member Dashboard first and no Hosted or Admin", () => {
    expect(labels("member")).toEqual(["Dashboard", "Sessions", "History", "Leaderboard", "Profile"]);
  });

  it("gives a host a Hosted entry pointing at /hosted", () => {
    expect(labels("host")).toEqual([
      "Dashboard",
      "Sessions",
      "Hosted",
      "History",
      "Leaderboard",
      "Profile",
    ]);
    expect(appNavItems("host").find((item) => item.label === "Hosted")?.href).toBe("/hosted");
  });

  it("gives an admin Hosted and Admin", () => {
    expect(labels("admin")).toEqual([
      "Dashboard",
      "Sessions",
      "Hosted",
      "History",
      "Leaderboard",
      "Profile",
      "Admin",
    ]);
  });

  it("no longer lists New session in the nav", () => {
    expect(labels("admin")).not.toContain("New session");
  });
});
