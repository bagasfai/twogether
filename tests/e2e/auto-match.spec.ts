import type { Page } from "@playwright/test";
import { addCheckedInParticipant, admin, createUser, deleteUser, type TestUser } from "./support/admin";
import { expect, hydrated, test } from "./support/fixtures";

test.use({ viewport: { width: 1280, height: 800 } });

const WAIT = { timeout: 15_000 };

let players: TestUser[] = [];

test.beforeAll(async () => {
  for (const label of ["man-1", "man-2", "man-3", "man-4"]) {
    players.push(await createUser({ label, gender: "male" }));
  }
});

test.afterAll(async () => {
  for (const player of players) await deleteUser(player.id);
  players = [];
});

const panelWithHeading = (page: Page, name: string) =>
  page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .last();

const autoMatchPanel = (page: Page) => panelWithHeading(page, "Auto-match");

async function startAndGenerateMensDouble(host: Page, sessionId: string): Promise<void> {
  await host.goto(`/sessions/${sessionId}/manage`);
  const start = host.getByRole("button", { name: "Start session" });
  await hydrated(start);
  await start.click();
  await expect(start).toBeHidden(WAIT);

  const panel = autoMatchPanel(host);
  await panel.getByLabel("Format").click();
  await host.getByRole("option", { name: "Men's double", exact: true }).click();
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Regenerate" })).toBeVisible(WAIT);
}

test("host generates a men's double from four checked-in players and confirms it", async ({
  asUser,
  users,
  makeSession,
}) => {
  const s = await makeSession(users.host, { courtCount: 1 });
  for (const player of players) await addCheckedInParticipant(s.id, player);

  const host = await asUser(users.host);
  await startAndGenerateMensDouble(host, s.id);

  const panel = autoMatchPanel(host);
  await expect(panel.getByRole("button", { name: "Discard" })).toHaveCount(1);
  for (const player of players) {
    await expect(panel.getByRole("button", { name: new RegExp(player.fullName) })).toBeVisible();
  }

  await panel.getByRole("button", { name: "Confirm all" }).click();
  await expect(panel.getByRole("button", { name: "Confirm all" })).toBeHidden(WAIT);

  let match = panelWithHeading(host, "Matches").getByRole("listitem").filter({ hasText: " vs " });
  for (const player of players) match = match.filter({ hasText: player.fullName });
  await expect(match).toHaveCount(1, WAIT);

  const { data: matches, error } = await admin().from("matches").select("id").eq("session_id", s.id);
  expect(error).toBeNull();
  expect(matches).toHaveLength(1);
  const { data: matchPlayers } = await admin()
    .from("match_players")
    .select("participant_id")
    .eq("match_id", matches![0].id);
  expect(matchPlayers).toHaveLength(4);
});

test("too few players shows the shortfall instead of a suggestion", async ({ asUser, users, makeSession }) => {
  const s = await makeSession(users.host, { courtCount: 1 });
  for (const player of players.slice(0, 2)) await addCheckedInParticipant(s.id, player);

  const host = await asUser(users.host);
  await startAndGenerateMensDouble(host, s.id);

  const panel = autoMatchPanel(host);
  await expect(panel.getByText("Need 2 more men for a men's double.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirm all" })).toHaveCount(0);
});
