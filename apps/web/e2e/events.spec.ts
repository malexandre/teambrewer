import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_EVENTS_SETUP_TOKEN, E2E_EVENTS_USER, E2E_PASSWORD, E2E_TEAMS } from "./fixtures";

test("create a lightweight event, RSVP, and confirm team isolation", async ({ page }) => {
  const eventName = "E2E Calling Sydney";

  // 1. Onboard the events user (setup -> TOTP -> app), landing on alpha (default).
  await page.goto(`/setup/${E2E_EVENTS_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Create an event from the Events page (name + date + location).
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("button", { name: "New event" }).click();
  await page.locator("#event-name").fill(eventName);
  await page.locator("#event-date").fill("2026-09-12");
  await page.locator("#event-location").fill("Sydney");
  await page.getByRole("button", { name: "Create event" }).click();

  // 3. Lands on the event detail.
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();
  await expect(page.getByText("Sydney", { exact: true })).toBeVisible();

  // 4. RSVP going; the button is pressed and the roster shows the current user.
  await page.getByRole("button", { name: "Going", exact: true }).click();
  await expect(page.getByRole("button", { name: "Going", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText(E2E_EVENTS_USER.displayName)).toBeVisible();

  // 5. Switch to the other team: the event must not be visible (tenant isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page.getByText(eventName)).toHaveCount(0);
});
