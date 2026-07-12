import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_PASSWORD,
  E2E_REFERENCE,
  E2E_TEAMS,
  E2E_TESTQUEUE_DECK_NAME,
  E2E_TESTQUEUE_SETUP_TOKEN,
  E2E_TESTQUEUE_USER,
} from "./fixtures";

test("propose a card test, vote, resolve it, assign a matchup, and confirm isolation", async ({
  page,
}) => {
  const deckName = E2E_TESTQUEUE_DECK_NAME;

  // 1. Onboard the testing-queue user (setup -> TOTP -> app), landing on alpha.
  await page.goto(`/setup/${E2E_TESTQUEUE_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Open the seeded deck; the card-test suggestion board lives on its detail page.
  await page.getByRole("link", { name: "Decks", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(deckName) }).click();
  await expect(page.getByRole("heading", { name: deckName })).toBeVisible();

  const board = page.getByRole("region", { name: "Card-test suggestions" });

  // 3. Propose a card test: pick the card to test via autocomplete, add reasoning.
  await board.getByRole("button", { name: "Propose a card test" }).click();
  await board.getByPlaceholder(/search a card to test/i).fill("Command");
  await board.getByRole("button", { name: /command and conquer/i }).click();
  await board.getByLabel("Reasoning").fill("Improves the go-wide matchup.");
  await board.getByRole("button", { name: "Propose", exact: true }).click();

  await expect(board.getByText("Proposed (1)")).toBeVisible();
  const suggestion = board.locator("article").filter({ hasText: "Command and Conquer" });
  await expect(suggestion).toBeVisible();

  // 4. A vote (the author's own vote counts as a signal): the control flips to voted.
  await suggestion.getByRole("button", { name: "Upvote" }).click();
  await expect(suggestion.getByRole("button", { name: "Retract upvote" })).toBeVisible();

  // 5. Move it through the lifecycle: proposed -> testing -> adopted (with a note).
  await suggestion.getByLabel("Change status").selectOption({ label: "Testing" });
  await expect(board.getByText("Testing (1)")).toBeVisible();

  await suggestion.getByLabel("Change status").selectOption({ label: "Adopted" });
  await suggestion.getByLabel(/why adopted/i).fill("Won the close games; keeping it.");
  await suggestion.getByRole("button", { name: /confirm adopted/i }).click();

  await expect(board.getByText("Adopted (1)")).toBeVisible();
  await expect(suggestion.getByText(/Won the close games/)).toBeVisible();

  // 6. Discussion is attached: post a comment on the suggestion and see it appear.
  await suggestion.getByRole("button", { name: "Discussion" }).click();
  await suggestion.getByLabel("New comment").fill("Bringing this to the event.");
  await suggestion.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(suggestion.getByText("Bringing this to the event.")).toBeVisible();

  // 7. Assign the matchup (our deck vs the bogeyman hero) to a teammate.
  await page.getByRole("link", { name: "Assignments", exact: true }).click();
  await page.getByRole("button", { name: "Assign a matchup" }).click();
  await page.getByLabel("Assignee").selectOption({ label: E2E_TESTQUEUE_USER.displayName });
  await page.getByLabel("Our deck").selectOption({ label: deckName });
  await page
    .getByRole("combobox", { name: "Hero", exact: true })
    .selectOption({ label: E2E_REFERENCE.heroName });
  await page.getByRole("button", { name: "Assign", exact: true }).click();

  const assignment = page.locator("article").filter({ hasText: E2E_REFERENCE.heroName });
  await expect(assignment).toBeVisible();
  await expect(assignment.getByText(deckName)).toBeVisible();

  // 8. Advance the assignment: open -> in progress -> done.
  await assignment.getByLabel("Change status").selectOption({ label: "In progress" });
  await expect(assignment.getByText("In progress").first()).toBeVisible();
  await assignment.getByLabel("Change status").selectOption({ label: "Done" });
  await expect(assignment.getByText("Done").first()).toBeVisible();

  // 9. Switch to the other team: the assignment must not be visible (tenant isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Assignments", exact: true }).click();
  await expect(page.getByText(E2E_REFERENCE.heroName)).toHaveCount(0);
});
