import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { admin, deleteSession, type TestUser } from "./support/admin";
import { expect, hydrated, test } from "./support/fixtures";

test.use({ viewport: { width: 1280, height: 800 } });

const WAIT = { timeout: 15_000 };

const rosterRow = (page: Page, user: TestUser) =>
  page.getByRole("row", { name: new RegExp(user.fullName) });

async function pickDateTime(page: Page, label: "Starts" | "Ends", time: string): Promise<void> {
  const field = page
    .locator('[data-slot="form-item"]')
    .filter({ has: page.getByText(label, { exact: true }) });
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("button", { name: "Go to the Next Month" }).click();
  await page.getByRole("button", { name: /\b15th\b/ }).click();
  await page.keyboard.press("Escape");
  await field.getByTestId("datetime-time").fill(time);
}

async function addParticipant(page: Page, user: TestUser, as: "Confirmed" | "Waitlist"): Promise<void> {
  await page.getByRole("button", { name: "Add participant" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a participant" });
  await dialog.getByPlaceholder("Search by name…").fill(user.fullName);
  await dialog.getByRole("button", { name: user.fullName }).click();
  if (as === "Waitlist") {
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Waitlist" }).click();
  }
  await dialog.getByRole("button", { name: "Add participant" }).click();
  await expect(dialog).toBeHidden(WAIT);
}

test.describe("create session", () => {
  let createdId: string | null = null;

  test.afterEach(async () => {
    if (createdId) await deleteSession(createdId);
    createdId = null;
  });

  test("host creates a scheduled session and lands on its manage page", async ({ asUser, users }) => {
    const title = `E2E created ${randomBytes(3).toString("hex")}`;
    const page = await asUser(users.host);
    await page.goto("/sessions/new");
    const submit = page.getByRole("button", { name: "Create session" });
    await hydrated(submit);

    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Location", { exact: true }).fill("E2E Hall");
    await pickDateTime(page, "Starts", "19:00");
    await pickDateTime(page, "Ends", "21:00");
    await page.getByLabel("Capacity").fill("8");
    await page.getByLabel("Registration").selectOption("open");
    await page.getByLabel("Status").selectOption("scheduled");
    await submit.click();

    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}\/manage$/, WAIT);
    createdId = new URL(page.url()).pathname.split("/")[2];
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const { data } = await admin()
      .from("sessions")
      .select("status, registration_state, max_participants, created_by")
      .eq("id", createdId)
      .single();
    expect(data).toEqual({
      status: "scheduled",
      registration_state: "open",
      max_participants: 8,
      created_by: users.host.id,
    });
  });
});

test("member opening the create form is redirected to the dashboard", async ({ asUser, users }) => {
  const page = await asUser(users.memberA);
  await page.goto("/sessions/new");
  await expect(page).toHaveURL("/dashboard");
});

test("host adds a member, promotes from waitlist, checks in, and cancels a player", async ({
  asUser,
  users,
  makeSession,
}) => {
  const s = await makeSession(users.host, { maxParticipants: 1, waitlistCapacity: 2 });
  const host = await asUser(users.host);
  await host.goto(`/sessions/${s.id}/manage`);
  await hydrated(host.getByRole("button", { name: "Add participant" }));

  const rowA = rosterRow(host, users.memberA);
  const rowB = rosterRow(host, users.memberB);

  await addParticipant(host, users.memberA, "Confirmed");
  await expect(rowA.getByText("Confirmed", { exact: true })).toBeVisible(WAIT);
  await expect(rowA.getByText("Awaiting their confirmation")).toBeVisible();

  await addParticipant(host, users.memberB, "Waitlist");
  await expect(rowB.getByText("Waitlist", { exact: true })).toBeVisible(WAIT);

  await rowB.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(rowB.getByText("Confirmed", { exact: true })).toBeVisible(WAIT);

  await rowA.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(rowA.getByRole("button", { name: "Undo check-in" })).toBeVisible(WAIT);

  await host.getByRole("button", { name: `More actions for ${users.memberB.fullName}` }).click();
  await rowB.getByRole("button", { name: "Cancel player" }).click();
  const confirm = host.getByRole("dialog", { name: `Cancel ${users.memberB.fullName}?` });
  await confirm.getByRole("button", { name: "Cancel player" }).click();
  await expect(rowB.getByText("Cancelled", { exact: true })).toBeVisible(WAIT);

  const { data, error } = await admin()
    .from("participants")
    .select("user_id, status, checked_in_at")
    .eq("session_id", s.id);
  expect(error).toBeNull();
  const rowOf = (user: TestUser) => data?.find((row) => row.user_id === user.id);
  expect(rowOf(users.memberA)?.status).toBe("confirmed");
  expect(rowOf(users.memberA)?.checked_in_at).not.toBeNull();
  expect(rowOf(users.memberB)?.status).toBe("cancelled");
});

test("a member added by the host confirms the spot from their dashboard", async ({
  asUser,
  users,
  makeSession,
}) => {
  const s = await makeSession(users.host);
  const host = await asUser(users.host);
  await host.goto(`/sessions/${s.id}/manage`);
  await hydrated(host.getByRole("button", { name: "Add participant" }));
  await addParticipant(host, users.memberA, "Confirmed");
  const row = rosterRow(host, users.memberA);
  await expect(row.getByText("Awaiting their confirmation")).toBeVisible(WAIT);

  const member = await asUser(users.memberA);
  await member.goto("/dashboard");
  const banner = member
    .locator("div")
    .filter({ hasText: `A host added you to ${s.title}` })
    .last();
  await banner.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(banner).toBeHidden(WAIT);

  await expect(row.getByText("Awaiting their confirmation")).toHaveCount(0, WAIT);
  await expect(row.getByText("Confirmed", { exact: true })).toBeVisible();
});
