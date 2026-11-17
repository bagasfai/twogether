import { expect, formAlert, logIn, test } from "./support/fixtures";

test("signed-out visitor is sent to login and back", async ({ page, users }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");
  await logIn(page, users.memberA.email, users.memberA.password);
  await expect(page).toHaveURL("/dashboard");
});

test("wrong password shows the error and stays on login", async ({ page, users }) => {
  await page.goto("/login");
  await logIn(page, users.memberA.email, "not-the-password");
  await expect(formAlert(page)).toHaveText("Email or password is incorrect.");
  await expect(page).toHaveURL(/\/login/);
});

test("sign out returns home and re-protects the dashboard", async ({ asUser, users }) => {
  const page = await asUser(users.memberA, { fresh: true });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");
});
