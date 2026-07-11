import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const webPort = 5173;

// The API is started by global-setup against an ephemeral Testcontainers Postgres
// (seeded with the canonical onboarding fixtures), because it cannot boot without
// a database. Playwright only launches the Vite dev server here; its /api proxy
// forwards to the seeded API on :3000. global-teardown stops both.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  globalSetup: resolve(import.meta.dirname, "e2e/global-setup.ts"),
  globalTeardown: resolve(import.meta.dirname, "e2e/global-teardown.ts"),
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @teambrewer/web dev",
      port: webPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
