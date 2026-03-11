import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "api",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "node dist/cli.js --transport http --port 3000 --postgres postgres://postgres:postgres@localhost:5432/postgres --tool-filter +all",
    url: "http://localhost:3000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Prevent 429s during E2E runs with many client connections
      MCP_RATE_LIMIT_MAX: "1000",
    },
  },
});
