import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_EVENTS_SETUP_TOKEN, E2E_PASSWORD, E2E_REFERENCE, E2E_TEAMS } from "./fixtures";

test("create an event, build a gauntlet, RSVP, and confirm team isolation", async ({ page }) => {
  const eventName = "E2E Calling Sydney";
  const referenceDeckName = "E2E Reference Oldhim";

  // 1. Onboard the events user (setup -> TOTP -> app), landing on alpha (default).
  await page.goto(`/setup/${E2E_EVENTS_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Create a reference deck so the gauntlet can target it (a reference deck must exist).
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await page.getByRole("button", { name: "New deck" }).click();
  await page.locator("#deck-name").fill(referenceDeckName);
  await page.locator("#deck-format").selectOption({ label: E2E_REFERENCE.formatName });
  await page.locator("#deck-url").fill("https://fabrary.net/decks/e2e-ref");
  await page.getByLabel(/reference deck/i).check();
  await page.getByRole("button", { name: "Create deck" }).click();
  await expect(page.getByRole("heading", { name: referenceDeckName })).toBeVisible();

  // 3. Create an event from the Events page.
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("button", { name: "New event" }).click();
  await page.locator("#event-name").fill(eventName);
  await page.locator("#event-format").selectOption({ label: E2E_REFERENCE.formatName });
  await page.locator("#event-date").fill("2026-09-12");
  await page.locator("#event-importance").selectOption("national");
  await page.getByRole("button", { name: "Create event" }).click();

  // 4. Lands on the event hub.
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();

  // 5. Add three gauntlet entries: a reference deck, a hero, and an archetype label.
  // Assert the (unique) running total after each add — the field share bar sum.
  await page.locator("#gauntlet-kind").selectOption("deck");
  await page.locator("#gauntlet-deck").selectOption({ label: referenceDeckName });
  await page.locator("#gauntlet-share").fill("30");
  await page.getByRole("button", { name: "Add to gauntlet" }).click();
  await expect(page.getByText(/total expected share: 30%/i)).toBeVisible();

  await page.locator("#gauntlet-kind").selectOption("hero");
  await page.locator("#gauntlet-hero").selectOption({ label: E2E_REFERENCE.heroName });
  await page.locator("#gauntlet-share").fill("20");
  await page.getByRole("button", { name: "Add to gauntlet" }).click();
  await expect(page.getByText(/total expected share: 50%/i)).toBeVisible();

  await page.locator("#gauntlet-kind").selectOption("archetype");
  await page.locator("#gauntlet-archetype").fill("Aggro Red");
  await page.locator("#gauntlet-share").fill("10");
  await page.getByRole("button", { name: "Add to gauntlet" }).click();
  await expect(page.getByText(/total expected share: 60%/i)).toBeVisible();

  // 6. RSVP going; the roster shows the current user.
  await page.getByRole("button", { name: "Going", exact: true }).click();
  await expect(page.getByRole("button", { name: "Going", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Scope to the attendance section — the activity feed also shows the actor's name.
  const attendanceSection = page.locator("section").filter({ hasText: "Attendance" });
  await expect(attendanceSection.getByText("Events User")).toBeVisible();

  // 7. Comment on the event hub; the event activity feed shows create + comment.
  const commentBody = "Locking in the gauntlet, let's split the testing.";
  await page.getByLabel("New comment").fill(commentBody);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByText(commentBody)).toBeVisible();
  await expect(page.getByText(/created an event/i)).toBeVisible();

  // 8. Switch to the other team: the event must not be visible (tenant isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page.getByText(eventName)).toHaveCount(0);
});
