import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_CARD_NAME,
  E2E_GAMEPLAN_DECK_NAME,
  E2E_GAMEPLAN_SETUP_TOKEN,
  E2E_PASSWORD,
} from "./fixtures";

test("write a matchup game-plan on a deck with an inline +card reference", async ({ page }) => {
  // 1. Onboard the game-plans user (setup -> TOTP -> app), landing on alpha.
  await page.goto(`/setup/${E2E_GAMEPLAN_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Open the seeded deck and write a game-plan.
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(E2E_GAMEPLAN_DECK_NAME) }).click();
  await expect(page.getByRole("heading", { name: E2E_GAMEPLAN_DECK_NAME })).toBeVisible();

  // Game-plans live under the deck's "Plan" tab. A plan is titled by a free-text name.
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.getByRole("button", { name: "Write a game-plan" }).click();
  await page.getByLabel("Name").fill("vs Aggro Fai");

  // The plan body carries key cards inline via the +card composer (no structured
  // key-card strip anymore — meta-pivot). Type prose then a +card token and pick it.
  const planBody = page.getByRole("textbox", { name: "Plan" });
  await planBody.click();
  await planBody.pressSequentially("Race the clock and respect their on-hits. +Command");
  await page
    .getByRole("list", { name: /card suggestions/i })
    .getByRole("button", { name: new RegExp(E2E_CARD_NAME, "i") })
    .click();
  await page.getByRole("button", { name: "Create game-plan" }).click();

  // The plan renders with its matchup header and the resolved +card chip.
  await expect(page.getByRole("heading", { name: "vs Aggro Fai" })).toBeVisible();
  const gamePlan = page.locator("article").filter({ hasText: "vs Aggro Fai" });
  await expect(gamePlan.getByText(E2E_CARD_NAME)).toBeVisible();
});
