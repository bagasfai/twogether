import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { test as base, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import {
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  type TestSession,
  type TestUser,
} from "./admin";

const AUTH_DIR = path.join(process.cwd(), "tests", "e2e", ".auth");
const savedStates = new Map<string, string>();

type Users = { host: TestUser; memberA: TestUser; memberB: TestUser };

type TestFixtures = {
  asUser: (user: TestUser, o?: { fresh?: boolean }) => Promise<Page>;
  makeSession: (owner: TestUser, o?: Parameters<typeof createSession>[1]) => Promise<TestSession>;
};

type WorkerFixtures = { users: Users };

// A field filled before React hydrates is reset to the form's default value.
export async function hydrated(locator: Locator): Promise<void> {
  await expect(async () => {
    const attached = await locator.evaluate((node) =>
      Object.keys(node).some((key) => key.startsWith("__reactProps$")),
    );
    expect(attached).toBe(true);
  }).toPass({ timeout: 30_000 });
}

// Next's route announcer is a second, always-present role="alert" node.
export function formAlert(page: Page): Locator {
  return page.getByRole("alert").and(page.locator(":not(#__next-route-announcer__)"));
}

export async function logIn(page: Page, email: string, password: string): Promise<void> {
  const submit = page.getByRole("button", { name: "Log in", exact: true });
  await hydrated(submit);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submit.click();
}

async function dropSavedState(userId: string): Promise<void> {
  const file = savedStates.get(userId);
  if (!file) return;
  savedStates.delete(userId);
  await rm(file, { force: true });
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  users: [
    async ({}, provide) => {
      const created: TestUser[] = [];
      try {
        const host = await createUser({ label: "host", role: "host" });
        created.push(host);
        const memberA = await createUser({ label: "member-a" });
        created.push(memberA);
        const memberB = await createUser({ label: "member-b" });
        created.push(memberB);
        await provide({ host, memberA, memberB });
      } finally {
        for (const user of created) {
          await dropSavedState(user.id);
          await deleteUser(user.id);
        }
      }
    },
    { scope: "worker" },
  ],

  asUser: async ({ browser }, provide) => {
    const contexts: BrowserContext[] = [];

    await provide(async (user, o = {}) => {
      if (o.fresh) await dropSavedState(user.id);

      const saved = savedStates.get(user.id);
      if (saved) {
        const context = await browser.newContext({ storageState: saved });
        contexts.push(context);
        return context.newPage();
      }

      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.goto("/login");
      await logIn(page, user.email, user.password);
      await page.waitForURL("/dashboard");

      if (!o.fresh) {
        await mkdir(AUTH_DIR, { recursive: true });
        const file = path.join(AUTH_DIR, `${user.id}.json`);
        await context.storageState({ path: file });
        savedStates.set(user.id, file);
      }
      return page;
    });

    for (const context of contexts) await context.close();
  },

  makeSession: async ({}, provide) => {
    const ids: string[] = [];

    await provide(async (owner, o) => {
      const session = await createSession(owner, o);
      ids.push(session.id);
      return session;
    });

    for (const id of ids) await deleteSession(id);
  },
});

export { expect };
