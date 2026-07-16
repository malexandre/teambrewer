import { expect, type Page, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_COLLAB_AUTHOR_SETUP_TOKEN,
  E2E_COLLAB_MENTIONED_SETUP_TOKEN,
  E2E_PASSWORD,
  E2E_REFERENCE,
} from "./fixtures";

/** Run the setup -> TOTP -> app onboarding flow for a fresh user, landing in-app. */
async function onboard(page: Page, token: string): Promise<void> {
  await page.goto(`/setup/${token}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();
}

test("a comment mention notifies a teammate and deep-links to the thread", async ({ browser }) => {
  const deckName = "E2E Collaboration Deck";
  const commentBody = "Great start @collab_mentioned please review";

  // 1. The author onboards, creates a deck, and comments mentioning a teammate.
  const authorContext = await browser.newContext();
  const authorPage = await authorContext.newPage();
  await onboard(authorPage, E2E_COLLAB_AUTHOR_SETUP_TOKEN);

  await authorPage.getByRole("link", { name: "Decks", exact: true }).click();
  await authorPage.getByRole("button", { name: "New deck" }).click();
  await authorPage.locator("#deck-name").fill(deckName);
  await authorPage.locator("#deck-format").selectOption({ label: E2E_REFERENCE.formatName });
  await authorPage.locator("#deck-url").fill("https://fabrary.net/decks/e2e-collab");
  await authorPage.getByRole("button", { name: "Create deck" }).click();
  await expect(authorPage.getByRole("heading", { name: deckName })).toBeVisible();

  // Comments and the activity feed live under the deck's "Activity" tab.
  await authorPage.getByRole("tab", { name: "Activity" }).click();
  await authorPage.getByLabel("New comment").fill(commentBody);
  await authorPage.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(authorPage.getByText(commentBody)).toBeVisible();

  // 2. The deck's activity feed shows the create and comment events.
  await expect(authorPage.getByText(/created a deck/i)).toBeVisible();
  await expect(authorPage.getByText(/commented/i).first()).toBeVisible();

  // 3. The mentioned teammate onboards in a fresh session and sees the notification.
  const mentionedContext = await browser.newContext();
  const mentionedPage = await mentionedContext.newPage();
  await onboard(mentionedPage, E2E_COLLAB_MENTIONED_SETUP_TOKEN);

  await mentionedPage.getByRole("button", { name: /notifications/i }).click();
  await mentionedPage.getByRole("button", { name: /mentioned you/i }).click();

  // 4. Clicking it deep-links straight to the deck's Activity tab (no manual tab click)
  // and anchors the source comment, which is scrolled to and briefly highlighted.
  await expect(mentionedPage.getByRole("heading", { name: deckName })).toBeVisible();
  await expect(mentionedPage.getByRole("tab", { name: "Activity" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(mentionedPage).toHaveURL(/\/decks\/[^/]+\/activity#comment-/);
  await expect(mentionedPage.getByText(commentBody)).toBeVisible();
  // The comment carries the deep-link anchor id used for the highlight.
  await expect(
    mentionedPage.locator("[data-comment-id]").filter({ hasText: commentBody }),
  ).toBeVisible();

  await authorContext.close();
  await mentionedContext.close();
});
