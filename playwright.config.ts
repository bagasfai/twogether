import { defineConfig, devices } from "@playwright/test";
import { assertLocalStack, env } from "./tests/e2e/support/env";

assertLocalStack();

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: env.baseUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: env.baseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { RESEND_API_KEY: "" },
  },
});
