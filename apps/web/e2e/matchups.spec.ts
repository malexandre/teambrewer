import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_MATCHUP_DECK_NAME,
  E2E_MATCHUP_EVENT_NAME,
  E2E_MATCHUP_SETUP_TOKEN,
  E2E_PASSWORD,
  E2E_REFERENCE,
  E2E_TEAMS,
} from "./fixtures";

test("read the matchup matrix and event coverage, then confirm isolation", async ({ page }) => {
  // 1. Onboard the matchups user (setup -> TOTP -> app), landing on alpha (default).
  await page.goto(`/setup/${E2E_MATCHUP_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Open the matchups hub and scope to the seeded format.
  await page.getByRole("link", { name: "Matchups", exact: true }).click();
  await page.getByLabel("Format").selectOption({ label: E2E_REFERENCE.formatName });

  // The matrix shows our deck vs the seeded hero: two wins → 100% over N=2, and
  // because the effective sample is tiny the cell reads as low trust (never green).
  const matrixRow = page.getByRole("row", { name: new RegExp(E2E_MATCHUP_DECK_NAME) });
  await expect(matrixRow).toBeVisible();
  await expect(matrixRow.getByText("100%")).toBeVisible();
  await expect(matrixRow.getByText("N=2")).toBeVisible();
  await expect(matrixRow.getByText("Low trust")).toBeVisible();

  // 3. Scope to the seeded event to load its gauntlet coverage; both targets are
  //    thin, so at least one is flagged under-tested.
  await page.getByLabel("Event").selectOption({ label: E2E_MATCHUP_EVENT_NAME });
  await expect(page.getByText(/under-tested/).first()).toBeVisible();
  await expect(page.getByText("Aggro Red")).toBeVisible();

  // 4. Switch to the other team: our deck's matchup must not be visible (isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Matchups", exact: true }).click();
  await page.getByLabel("Format").selectOption({ label: E2E_REFERENCE.formatName });
  await expect(page.getByText(E2E_MATCHUP_DECK_NAME)).toHaveCount(0);
});
