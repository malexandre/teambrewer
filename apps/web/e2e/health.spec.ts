import { expect, test } from "@playwright/test";

test("home page loads and shows a healthy API status", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "TeamBrewer" })).toBeVisible();
  // Proves the full path through the browser: SPA → proxied /api/health →
  // shared schema → rendered status.
  await expect(page.getByText(/api status: ok/i)).toBeVisible();
});
