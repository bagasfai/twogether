import {
  TEST_PASSWORD,
  confirmationLink,
  deleteUser,
  findUserIdByEmail,
  randomPhone,
  testEmail,
} from "./support/admin";
import { expect, formAlert, hydrated, logIn, test } from "./support/fixtures";

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

test.describe("signup", () => {
  const email = testEmail("signup");

  test.afterEach(async () => {
    const id = await findUserIdByEmail(email);
    if (id) await deleteUser(id);
  });

  test("signup, confirm by link, land on the dashboard", async ({ page }) => {
    await page.goto("/signup");
    const submit = page.getByRole("button", { name: "Sign up", exact: true });
    await hydrated(submit);
    await page.getByLabel("Name").fill("E2E signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone number").fill(randomPhone());
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await submit.click();

    const alert = formAlert(page);
    const heading = page.getByRole("heading", { name: "Check your email" });
    // The send-email hook answers after a cold edge-function start plus a Resend call.
    await expect(heading.or(alert)).toBeVisible({ timeout: 30_000 });
    expect(
      await alert.count(),
      "signup was rejected: is supabase_edge_runtime_twogether running?",
    ).toBe(0);

    await page.goto(await confirmationLink(email, TEST_PASSWORD));
    await expect(page).toHaveURL("/dashboard");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/login");
    await logIn(page, email, TEST_PASSWORD);
    await expect(page).toHaveURL("/dashboard");
  });
});

test("a bad confirmation link lands on the auth error page", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-token&type=email");
  await expect(page).toHaveURL("/auth/error?reason=invalid_link");
});
