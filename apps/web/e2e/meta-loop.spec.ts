import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_CARD_NAME, E2E_METALOOP_SETUP_TOKEN, E2E_PASSWORD, E2E_REFERENCE } from "./fixtures";

/**
 * The signature meta-pivot loop, end to end through the UI:
 *   create a meta for a format (with a tiered deck entry) → create a deck of that
 *   format auto-linked to the format's most recent meta → see per-deck readiness →
 *   "add a card idea" (a +card task) → advance the task and record its report →
 *   create an event linked to the meta, then RSVP.
 */
test("meta -> deck readiness -> card-idea task -> event RSVP", async ({ page }) => {
  const metaName = "E2E Summer Meta";
  const deckName = "E2E Loop Deck";
  const eventName = "E2E Loop Cup";

  // 1. Onboard the core-loop user (setup -> TOTP -> app), landing on alpha.
  await page.goto(`/setup/${E2E_METALOOP_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Create a meta for the Classic Constructed format, then land on its hub and add a
  //    Tier-1 (meta-defining) hero deck entry.
  await page.getByRole("link", { name: "Metas", exact: true }).click();
  await page.getByRole("button", { name: "New meta" }).click();
  await page.locator("#meta-name").fill(metaName);
  await page.locator("#meta-format").selectOption({ label: E2E_REFERENCE.formatName });
  await page.locator("#meta-start").fill("2020-01-01");
  await page.locator("#meta-end").fill("2035-12-31");
  await page.getByRole("button", { name: "Create meta" }).click();

  await expect(page.getByRole("heading", { name: metaName })).toBeVisible();
  // A meta deck entry needs a free-text archetype label; the hero is an optional qualifier.
  await page.locator("#meta-entry-archetype").fill(`${E2E_REFERENCE.heroName} Aggro`);
  await page.locator("#meta-entry-hero").selectOption({ label: E2E_REFERENCE.heroName });
  await page.locator("#meta-entry-tier").selectOption({ label: "Meta-defining" });
  await page.getByRole("button", { name: "Add deck" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: E2E_REFERENCE.heroName }).first(),
  ).toBeVisible();

  // 3. Create a deck of the same format — the format's most recent meta is pre-linked on
  //    the form — and open it.
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await page.getByRole("button", { name: "New deck" }).click();
  await page.locator("#deck-name").fill(deckName);
  await page.locator("#deck-format").selectOption({ label: E2E_REFERENCE.formatName });
  await page.locator("#deck-url").fill("https://fabrary.net/decks/e2e-loop");
  await page.getByRole("button", { name: "Create deck" }).click();
  await expect(page.getByRole("heading", { name: deckName })).toBeVisible();

  // 4. Readiness lists the meta's decks; the untested Tier-1 hero has no plan yet. It
  //    lives under the deck's "Matchup Matrix" tab.
  await page.getByRole("tab", { name: "Matchup Matrix" }).click();
  const readiness = page.getByRole("region", { name: "Meta readiness" });
  await expect(readiness.getByText(E2E_REFERENCE.heroName)).toBeVisible();
  // A Tier-1 (meta-defining) matchup with no game-plan flags "Needs a plan" (a ✗ glyph).
  await expect(readiness.getByRole("img", { name: "Needs a plan" })).toBeVisible();

  // 5. "Add card idea" (under the "Card ideas & Tasks" tab) opens a task pre-linked to
  //    this deck; add an inline +card and create it.
  await page.getByRole("tab", { name: "Card ideas & Tasks" }).click();
  await page.getByRole("button", { name: "Add card idea" }).click();
  const description = page.getByRole("textbox", { name: "Task description" });
  await description.click();
  await description.press("ControlOrMeta+End");
  await description.pressSequentially(" +Command");
  await page
    .getByRole("list", { name: /card suggestions/i })
    .getByRole("button", { name: new RegExp(E2E_CARD_NAME, "i") })
    .click();
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText(new RegExp(`Card idea: ${deckName}`))).toBeVisible();

  // 6. On the Tasks board the task appears as a card in its status column. Open its
  //    detail dialog (which holds the +card chip and the controls) and advance it
  //    proposed -> assigned -> finished; finishing demands a report, then the report
  //    is revealed behind the Report button.
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`Open task: Card idea: ${deckName}`) }).click();

  const taskDialog = page.getByRole("dialog");
  await expect(taskDialog.getByText(E2E_CARD_NAME)).toBeVisible();
  await taskDialog.getByRole("button", { name: "Upvote" }).click();
  await taskDialog
    .getByRole("combobox", { name: "Change status" })
    .selectOption({ label: "Assigned" });
  await taskDialog
    .getByRole("combobox", { name: "Change status" })
    .selectOption({ label: "Finished" });
  await taskDialog
    .getByLabel(/required to finish/i)
    .fill("Command and Conquer over-performed; keeping it.");
  await taskDialog.getByRole("button", { name: "Finish task" }).click();

  await taskDialog.getByRole("button", { name: "Report", exact: true }).click();
  await expect(
    taskDialog.getByText("Command and Conquer over-performed; keeping it."),
  ).toBeVisible();
  // Close the detail dialog before navigating (its modal backdrop blocks the sidebar).
  await taskDialog.getByRole("button", { name: "Close" }).click();

  // 7. Create an event linked to the meta and RSVP going.
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("button", { name: "New event" }).click();
  await page.locator("#event-name").fill(eventName);
  await page.locator("#event-date").fill("2026-10-03");
  await page.locator("#event-meta").selectOption({ label: metaName });
  await page.getByRole("button", { name: "Create event" }).click();

  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByText(metaName)).toBeVisible();
  await page.getByRole("button", { name: "Going", exact: true }).click();
  await expect(page.getByRole("button", { name: "Going", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
