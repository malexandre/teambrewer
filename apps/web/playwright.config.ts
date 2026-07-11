import { defineConfig, devices } from "@playwright/test";

const webPort = 5173;
const apiPort = 3000;

// Boots the real stack for e2e: the built API on :3000 and the Vite dev server
// on :5173 (its /api proxy forwards to the API, mirroring the Nginx proxy in
// production). Playwright waits for both ports before running the specs.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "pnpm --filter @teambrewer/shared build && pnpm --filter @teambrewer/api build && pnpm --filter @teambrewer/api start",
      port: apiPort,
      env: { API_PORT: String(apiPort), WEB_ORIGIN: `http://localhost:${webPort}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @teambrewer/web dev",
      port: webPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
