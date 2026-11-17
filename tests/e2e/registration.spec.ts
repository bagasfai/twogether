import type { Page } from "@playwright/test";
import { admin } from "./support/admin";
import { expect, test } from "./support/fixtures";
import { en } from "./support/messages";

const waitlistLabel = (position: number) =>
  en.register.waitlistPosition.replace("{position}", String(position));

const registerButton = (page: Page) =>
  page.getByRole("button", { name: en.register.register, exact: true });

const myStatus = (page: Page) => page.getByTestId("my-registration-status");

const cancelButton = (page: Page) => page.getByRole("button", { name: en.register.cancel, exact: true });

test("member registers and cancels", async ({ asUser, users, makeSession }) => {
  const s = await makeSession(users.host);
  const page = await asUser(users.memberA);
  await page.goto(`/en/sessions/${s.id}`);
  await registerButton(page).click();
  await expect(myStatus(page)).toHaveText(en.register.confirmed);
  await cancelButton(page).click();
  await expect(registerButton(page)).toBeVisible();
});

test("full session waitlists the next member and promotes them when a seat frees", async ({
  asUser,
  users,
  makeSession,
}) => {
  const s = await makeSession(users.host, { maxParticipants: 1, waitlistCapacity: 2 });

  const pageA = await asUser(users.memberA);
  await pageA.goto(`/en/sessions/${s.id}`);
  await registerButton(pageA).click();
  await expect(myStatus(pageA)).toHaveText(en.register.confirmed);

  const pageB = await asUser(users.memberB);
  await pageB.goto(`/en/sessions/${s.id}`);
  await registerButton(pageB).click();
  await expect(myStatus(pageB)).toHaveText(waitlistLabel(1));

  await cancelButton(pageA).click();
  await expect(registerButton(pageA)).toBeVisible();

  // The public session page does not subscribe to realtime; the panel reads its state once on load.
  await pageB.reload();
  await expect(myStatus(pageB)).toHaveText(en.register.confirmed, { timeout: 15_000 });

  const { data, error } = await admin()
    .from("participants")
    .select("user_id, status")
    .eq("session_id", s.id);
  expect(error).toBeNull();
  const statusOf = (userId: string) => data?.find((row) => row.user_id === userId)?.status;
  expect(statusOf(users.memberA.id)).toBe("cancelled");
  expect(statusOf(users.memberB.id)).toBe("confirmed");
});

test("signed-out visitor is offered login, not register", async ({ page, users, makeSession }) => {
  const s = await makeSession(users.host);
  await page.goto(`/en/sessions/${s.id}`);
  await expect(page.getByRole("link", { name: en.register.loginToRegister })).toBeVisible();
  await expect(registerButton(page)).toHaveCount(0);
});

test("closed registration shows the closed message", async ({ asUser, users, makeSession }) => {
  const s = await makeSession(users.host, { registrationState: "closed" });
  const page = await asUser(users.memberA);
  await page.goto(`/en/sessions/${s.id}`);
  await expect(page.getByText(en.register.registrationClosed)).toBeVisible();
  await expect(registerButton(page)).toHaveCount(0);
});
