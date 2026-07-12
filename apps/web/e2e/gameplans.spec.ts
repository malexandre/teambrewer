import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_GAMEPLAN_CARD_NAME,
  E2E_GAMEPLAN_DECK_NAME,
  E2E_GAMEPLAN_EVENT_NAME,
  E2E_GAMEPLAN_SETUP_TOKEN,
  E2E_PASSWORD,
} from "./fixtures";

test("write a game-plan, select + lock a deck for an event, and write the retrospective", async ({
  page,
}) => {
  // 1. Onboard the game-plans user (setup -> TOTP -> app), landing on alpha (team-admin).
  await page.goto(`/setup/${E2E_GAMEPLAN_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Open the seeded deck and write a game-plan vs an archetype, with a key card.
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(E2E_GAMEPLAN_DECK_NAME) }).click();
  await expect(page.getByRole("heading", { name: E2E_GAMEPLAN_DECK_NAME })).toBeVisible();

  await page.getByRole("button", { name: "Write a game-plan" }).click();
  await page.getByRole("button", { name: "Archetype label" }).click();
  await page.getByLabel("Archetype label").fill("Aggro Fai");
  await page.getByLabel("Plan", { exact: true }).fill("Race the clock and respect their on-hits.");

  // Add a key card via the shared autocomplete.
  await page.getByRole("combobox", { name: "Search cards" }).fill(E2E_GAMEPLAN_CARD_NAME);
  await page.getByRole("option", { name: new RegExp(E2E_GAMEPLAN_CARD_NAME) }).click();
  await page.getByRole("button", { name: "Create game-plan" }).click();

  // The plan renders with its matchup header and key card.
  await expect(page.getByRole("heading", { name: "vs Aggro Fai" })).toBeVisible();
  const gamePlan = page.locator("article").filter({ hasText: "vs Aggro Fai" });
  await expect(gamePlan.getByText(E2E_GAMEPLAN_CARD_NAME)).toBeVisible();

  // 3. Go to the seeded event and record my deck selection.
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(E2E_GAMEPLAN_EVENT_NAME) }).click();
  await expect(page.getByRole("heading", { name: E2E_GAMEPLAN_EVENT_NAME })).toBeVisible();

  await page.getByRole("button", { name: "Record my pick" }).click();
  await page.getByLabel("Deck", { exact: true }).selectOption({ label: E2E_GAMEPLAN_DECK_NAME });
  await page.getByLabel("Reasoning").fill("Best against the expected field.");
  await page.getByRole("button", { name: "Save my pick" }).click();

  // The roster shows my pick.
  await expect(
    page.getByText(new RegExp(`Gameplan User: ${E2E_GAMEPLAN_DECK_NAME}`)),
  ).toBeVisible();

  // 4. Lock the roster (team-admin); the pick shows the locked badge and can't be changed.
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(page.getByLabel("Locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change" })).toHaveCount(0);

  // 5. Write the retrospective (body + results + learnings).
  await page.getByLabel("Review").fill("We went 5-2; the aggro plan held up.");
  await page.getByLabel("Results summary").fill("3rd of 32");
  await page.getByLabel("Learnings").fill("Bring more interaction vs Briar.");
  await page.getByRole("button", { name: "Write retrospective" }).click();

  await expect(page.getByText("We went 5-2; the aggro plan held up.")).toBeVisible();
  await expect(page.getByText("3rd of 32")).toBeVisible();
  await expect(page.getByText("Bring more interaction vs Briar.")).toBeVisible();
});
