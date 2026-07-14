import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_DECKS_SETUP_TOKEN, E2E_PASSWORD, E2E_REFERENCE, E2E_TEAMS } from "./fixtures";

test("create a deck, set its status, log an iteration, and confirm team isolation", async ({
  page,
}) => {
  const deckName = "E2E Aggro Dorinthea";
  const deckUrl = "https://fabrary.net/decks/e2e-abc";

  // 1. Onboard the decks user (setup -> TOTP -> app), landing on alpha (default).
  await page.goto(`/setup/${E2E_DECKS_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Create a deck (link + format, no hero) from the Decks page.
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await page.getByRole("button", { name: "New deck" }).click();

  await page.locator("#deck-name").fill(deckName);
  await page.locator("#deck-format").selectOption({ label: E2E_REFERENCE.formatName });
  await page.locator("#deck-url").fill(deckUrl);
  await page.getByRole("button", { name: "Create deck" }).click();

  // 3. Lands on the deck detail with the recognized link.
  await expect(page.getByRole("heading", { name: deckName })).toBeVisible();
  await expect(page.getByRole("link", { name: /open deck list/i })).toBeVisible();

  // 4. Move it through the status lifecycle: exploratory -> testing. The status label
  //    appears both in the page header and the Overview section, so scope the check to
  //    the Overview status chip.
  await page.getByRole("combobox", { name: /change status/i }).selectOption("testing");
  await expect(
    page.getByRole("region", { name: "Overview" }).getByText("Testing", { exact: true }),
  ).toBeVisible();

  // 5. Add an iteration-log entry and see it appear.
  const iteration = "Splashed extra reds after the last event.";
  await page.getByLabel("New iteration entry").fill(iteration);
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText(iteration)).toBeVisible();

  // 6. Switch to the other team: the deck must not be visible (tenant isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await expect(page.getByText(deckName)).toHaveCount(0);
});
