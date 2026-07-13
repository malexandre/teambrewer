import { expect, test } from "@playwright/test";

import { E2E_REFERENCE, E2E_SMOKE_DECK_NAME, E2E_SMOKE_SETUP_TOKEN, E2E_TEAMS } from "./fixtures";
import { completeOnboarding } from "./helpers";

/**
 * Critical-path smoke suite (phase-13). Beyond the per-feature specs, this proves
 * the end-to-end happy path holds AND that the new offline persistence stays
 * tenancy-safe: after switching teams and RELOADING (which rehydrates the
 * persisted IndexedDB query cache), the previous team's data must not reappear.
 */
test("onboard, create a deck, and stay tenant-isolated across a reload", async ({ page }) => {
  // 1. Onboard (setup -> TOTP -> app), landing on alpha (default active team).
  await completeOnboarding(page, { setupToken: E2E_SMOKE_SETUP_TOKEN });

  // 2. Create a deck on alpha.
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await page.getByRole("button", { name: "New deck" }).click();
  await page.locator("#deck-name").fill(E2E_SMOKE_DECK_NAME);
  await page.locator("#deck-format").selectOption({ label: E2E_REFERENCE.formatName });
  await page.locator("#deck-url").fill("https://fabrary.net/decks/e2e-smoke");
  await page.getByRole("button", { name: "Create deck" }).click();
  await expect(page.getByRole("heading", { name: E2E_SMOKE_DECK_NAME })).toBeVisible();

  // 3. It shows on alpha's deck list.
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await expect(page.getByText(E2E_SMOKE_DECK_NAME)).toBeVisible();

  // 4. Switch to bravo: the deck is gone (tenant isolation on a live switch).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await expect(page.getByText(E2E_SMOKE_DECK_NAME)).toHaveCount(0);

  // 5. Reload while on bravo — rehydrating the persisted cache must NOT surface
  //    alpha's deck (no cross-team leak from the offline cache).
  await page.reload();
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await expect(page.getByText(E2E_SMOKE_DECK_NAME)).toHaveCount(0);

  // 6. Switch back to alpha and reload: the deck is still there (cache is scoped,
  //    not lost).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.alpha.name });
  await page.reload();
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await expect(page.getByText(E2E_SMOKE_DECK_NAME)).toBeVisible();
});
