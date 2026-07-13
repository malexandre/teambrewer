import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_PASSWORD, E2E_SETUP_TOKEN, E2E_TEAMS } from "./fixtures";

test("setup link -> password -> TOTP -> backup codes -> lands on Decks -> team switch", async ({
  page,
}) => {
  // 1. Open the setup link and set a password.
  await page.goto(`/setup/${E2E_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // 2. Enrol TOTP: read the manual secret and enter a live code.
  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  // 3. Backup codes are shown once; save and continue into the app.
  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 4. Lands on the authenticated app: the landing route is Decks, and the sidebar
  //    highlights it.
  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Decks", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // 5. Both memberships are offered; switching the active team works (deeper
  //    tenant-isolation is proven by the decks/smoke journeys).
  const teamSelector = page.getByRole("combobox", { name: /active team/i });
  await expect(teamSelector).toHaveValue(E2E_TEAMS.alpha.id);
  await teamSelector.selectOption({ label: E2E_TEAMS.bravo.name });
  await expect(teamSelector).toHaveValue(E2E_TEAMS.bravo.id);
});
