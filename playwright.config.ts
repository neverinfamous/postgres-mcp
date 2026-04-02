import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  timeout: 60000, // Mitigation for erratic CI pipeline and environment startup lags
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "api",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
