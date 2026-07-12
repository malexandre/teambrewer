import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_GAMELOG_DECK_NAME,
  E2E_GAMELOG_SETUP_TOKEN,
  E2E_PASSWORD,
  E2E_REFERENCE,
  E2E_TEAMS,
} from "./fixtures";

test("log a game on a phone with default factors, see the weight, confirm isolation", async ({
  page,
}) => {
  const deckName = E2E_GAMELOG_DECK_NAME;

  // 1. Onboard the game-logging user (setup -> TOTP -> app), landing on alpha (default).
  await page.goto(`/setup/${E2E_GAMELOG_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Log a game from the Games page — the fast path: format, deck, opponent hero,
  //    accept the default confidence factors, save. A handful of taps.
  await page.getByRole("link", { name: "Games", exact: true }).click();
  await page.getByRole("button", { name: "Log a game" }).click();
  await page.locator("#game-format").selectOption({ label: E2E_REFERENCE.formatName });
  await page.locator("#game-deck").selectOption({ label: deckName });
  await page
    .getByRole("combobox", { name: "Hero", exact: true })
    .selectOption({ label: E2E_REFERENCE.heroName });
  // Submit via the keyboard: on the narrow phone viewport the wrapped segmented
  // controls make a pointer click flaky (scroll-bounce hit-testing), and pressing
  // Enter on the focused submit button exercises the same form submission.
  const logButton = page.getByRole("button", { name: "Log game" });
  await logButton.scrollIntoViewIfNeeded();
  await logButton.press("Enter");

  // 3. Lands on the game hub; the all-best defaults derive a weight of ~1.00.
  await expect(page.getByRole("heading", { name: new RegExp(`${deckName} vs`) })).toBeVisible();
  await expect(page.getByText("~1.00").first()).toBeVisible();

  // 4. The game appears in the team's list.
  await page.getByRole("link", { name: "Games", exact: true }).click();
  await expect(
    page.getByText(new RegExp(`${deckName} vs .*${E2E_REFERENCE.heroName}`)),
  ).toBeVisible();

  // 5. Switch to the other team: the game must not be visible (tenant isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page.getByText(deckName)).toHaveCount(0);
});
