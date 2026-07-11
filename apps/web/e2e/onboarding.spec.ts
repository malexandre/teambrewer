import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_PASSWORD, E2E_SETUP_TOKEN, E2E_TEAMS } from "./fixtures";

test("setup link -> password -> TOTP -> backup codes -> team-switch isolation", async ({ page }) => {
  // 1. Open the setup link and set a password.
  await page.goto(`/setup/${E2E_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Enrol TOTP: read the manual secret and enter a live code.
  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  // 3. Backup codes are shown once; save and continue into the app.
  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 4. Lands on the active team (alpha, the first membership) and shows only its roster.
  await expect(page.getByText(E2E_TEAMS.alpha.extraMember)).toBeVisible();
  await expect(page.getByText(E2E_TEAMS.bravo.extraMember)).toHaveCount(0);

  // 5. Switch teams: only the newly active team's members are shown (isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });

  await expect(page.getByText(E2E_TEAMS.bravo.extraMember)).toBeVisible();
  await expect(page.getByText(E2E_TEAMS.alpha.extraMember)).toHaveCount(0);
});
