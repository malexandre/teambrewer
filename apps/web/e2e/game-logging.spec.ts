import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_CARD_NAME,
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
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Log a game from the Games page (navigate by URL — on a phone the sidebar is a
  //    drawer). Drive the mobile wizard: step 1 (matchup), Next to step 2 (result —
  //    defaults are fine), Next to step 3 (confidence), then the optional step 4 to
  //    capture a card before saving. There is no event picker (meta-pivot).
  await page.goto("/games");
  await page.getByRole("button", { name: "Log a game" }).click();

  // Step 1 — Matchup.
  await page.locator("#game-format").selectOption({ label: E2E_REFERENCE.formatName });
  // The self-side subject is now an Ariakit combobox: open it, then pick the team deck.
  await page.locator("#game-deck").click();
  await page.getByRole("option", { name: deckName }).click();
  await page
    .getByRole("combobox", { name: "Hero", exact: true })
    .selectOption({ label: E2E_REFERENCE.heroName });
  await page.getByRole("button", { name: /next/i }).click();

  // Step 2 — Result (the all-best defaults are fine).
  await page.getByRole("button", { name: /next/i }).click();

  // Step 3 — Confidence. The all-best defaults derive a weight of ~1.00.
  await expect(page.getByText("~1.00").first()).toBeVisible();

  // Step 3 -> Step 4: open the optional notes-and-cards step to capture a card.
  await page.getByRole("button", { name: /add notes & cards/i }).click();

  // Step 4 — search for the seeded card in the "Impressive cards" section and pick
  // it. Both card-capture sections render an identically-labelled search combobox
  // ("Search cards"), so scope to the impressive-cards group to disambiguate.
  const impressiveCardsSection = page.getByRole("group", { name: /impressive cards/i });
  await impressiveCardsSection.getByRole("combobox", { name: /search cards/i }).fill("Command");
  await impressiveCardsSection
    .getByRole("option", { name: new RegExp(E2E_CARD_NAME, "i") })
    .click();

  // Submit via the keyboard: on the narrow phone viewport the wrapped segmented
  // controls make a pointer click flaky (scroll-bounce hit-testing), and pressing
  // Enter on the focused submit button exercises the same form submission.
  const saveButton = page.getByRole("button", { name: /^save$/i });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.press("Enter");

  // 3. Lands on the game hub; the weight and the captured card are both shown.
  await expect(page.getByRole("heading", { name: new RegExp(`${deckName} vs`) })).toBeVisible();
  await expect(page.getByText("~1.00").first()).toBeVisible();
  await expect(page.getByText(E2E_CARD_NAME)).toBeVisible();

  // 4. The game appears in the team's list.
  await page.goto("/games");
  await expect(
    page.getByText(new RegExp(`${deckName} vs .*${E2E_REFERENCE.heroName}`)),
  ).toBeVisible();

  // 5. Switch to the other team: the game must not be visible (tenant isolation).
  //    On the phone viewport the team switcher lives in the drawer (the sidebar is
  //    hidden), so open the menu first.
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.goto("/games");
  await expect(page.getByText(deckName)).toHaveCount(0);
});
