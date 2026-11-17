import { createUser, deleteUser, recoveryLink, type TestUser } from "./support/admin";
import { expect, formAlert, hydrated, logIn, test } from "./support/fixtures";

const NEW_PASSWORD = "E2e-next-456";

let user: TestUser;

test.beforeEach(async () => {
  user = await createUser({ label: "reset" });
});

test.afterEach(async () => {
  await deleteUser(user.id);
});

test("request a reset, set a new password, log in with it", async ({ page }) => {
  await page.goto("/forgot-password");
  const send = page.getByRole("button", { name: "Send reset link" });
  await hydrated(send);
  await page.getByLabel("Email").fill(user.email);
  await send.click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(await recoveryLink(user.email));
  await expect(page).toHaveURL("/reset-password");
  const save = page.getByRole("button", { name: "Save new password" });
  await hydrated(save);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await save.click();
  await expect(page).toHaveURL("/dashboard");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/login");
  await logIn(page, user.email, user.password);
  await expect(formAlert(page)).toHaveText("Email or password is incorrect.");

  await logIn(page, user.email, NEW_PASSWORD);
  await expect(page).toHaveURL("/dashboard");
});

test("mismatched passwords are rejected in the form", async ({ page }) => {
  await page.goto(await recoveryLink(user.email));
  await expect(page).toHaveURL("/reset-password");
  const save = page.getByRole("button", { name: "Save new password" });
  await hydrated(save);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill("E2e-other-789");
  await save.click();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await expect(page).toHaveURL("/reset-password");
});
