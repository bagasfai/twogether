import { describe, expect, it } from "vitest";
import { sweepE2eData, type SweepClient } from "@/tests/e2e/support/sweep";

type StubUser = { id: string; email: string };

function stubClient(users: StubUser[], failingIds: string[] = []) {
  const calls: string[] = [];
  const client: SweepClient = {
    async deleteGalleriesByTitlePrefix(prefix) {
      calls.push(`galleries:${prefix}`);
    },
    async deleteSessionsByTitlePrefix(prefix) {
      calls.push(`sessions:${prefix}`);
    },
    async listUsers(page, perPage) {
      return users.slice((page - 1) * perPage, page * perPage);
    },
    async deleteUser(id) {
      calls.push(`user:${id}`);
      if (failingIds.includes(id)) throw new Error("violates foreign key constraint");
    },
  };
  return { client, calls };
}

describe("sweepE2eData", () => {
  it("deletes E2E galleries and sessions before any user, and only e2e sink users", async () => {
    const { client, calls } = stubClient([
      { id: "seed-1", email: "host@jakbar.local" },
      { id: "e2e-1", email: "delivered+e2e-abc123-host@resend.dev" },
      { id: "real-1", email: "delivered+someone@resend.dev" },
      { id: "e2e-2", email: "delivered+e2e-leftover-x@resend.dev" },
    ]);

    await sweepE2eData(client);

    expect(calls).toEqual(["galleries:E2E ", "sessions:E2E ", "user:e2e-1", "user:e2e-2"]);
  });

  it("pages through every user", async () => {
    const users = Array.from({ length: 450 }, (_, i) => ({
      id: `u-${i}`,
      email: i === 449 ? "delivered+e2e-run-last@resend.dev" : `member${i}@jakbar.local`,
    }));
    const { client, calls } = stubClient(users);

    await sweepE2eData(client);

    expect(calls).toEqual(["galleries:E2E ", "sessions:E2E ", "user:u-449"]);
  });

  it("keeps deleting after a failure and throws naming the user it could not delete", async () => {
    const { client, calls } = stubClient(
      [
        { id: "e2e-1", email: "delivered+e2e-abc123-host@resend.dev" },
        { id: "e2e-2", email: "delivered+e2e-abc123-member@resend.dev" },
      ],
      ["e2e-1"],
    );

    await expect(sweepE2eData(client)).rejects.toThrow(/e2e-1.*violates foreign key constraint/);
    expect(calls).toContain("user:e2e-2");
  });
});
