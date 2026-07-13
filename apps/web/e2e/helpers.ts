import { expect, type Page } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_PASSWORD } from "./fixtures";

/**
 * Drive the real onboarding flow (setup link → password → TOTP → backup codes)
 * and land in the app. Shared by specs so the critical auth path is exercised
 * once, in one place. Each caller passes its own single-use setup token.
 */
export async function completeOnboarding(
  page: Page,
  options: { setupToken: string; password?: string },
): Promise<void> {
  const password = options.password ?? E2E_PASSWORD;

  await page.goto(`/setup/${options.setupToken}`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // Landed in the app: the shared header (with Sign out) is present on every
  // viewport, unlike the sidebar nav which collapses to a drawer on mobile.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
