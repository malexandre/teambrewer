import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_KNOWLEDGE_SETUP_TOKEN, E2E_PASSWORD, E2E_TEAMS } from "./fixtures";

test("write a primer + comment, record a decision, run a poll, and confirm team isolation", async ({
  page,
}) => {
  const primerTitle = "E2E Beating Aggro Fai";
  const decisionTitle = "E2E Register Fai for Nationals";
  const pollQuestion = "E2E Which deck for Nationals?";

  // 1. Onboard the knowledge user (setup -> TOTP -> app), landing on alpha (default).
  await page.goto(`/setup/${E2E_KNOWLEDGE_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. Knowledge -> Primers: write a primer, open it, and comment mentioning a teammate.
  await page.getByRole("link", { name: "Knowledge", exact: true }).click();
  await page.getByRole("button", { name: "Write a primer" }).click();
  await page.getByLabel("Title").fill(primerTitle);
  await page.getByLabel("Body").fill("Keep two blues; block the on-hit triggers.");
  await page.getByRole("button", { name: "Create primer" }).click();

  await page.getByRole("link", { name: primerTitle }).click();
  await expect(page.getByRole("heading", { name: primerTitle })).toBeVisible();
  await expect(page.getByText("Keep two blues; block the on-hit triggers.")).toBeVisible();

  const commentBody = "Great write-up @alpha_two thanks";
  await page.getByLabel("New comment").fill(commentBody);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByText(commentBody)).toBeVisible();

  // 3. Decisions: record a decision and expand it.
  await page.getByRole("link", { name: "Knowledge", exact: true }).click();
  await page.getByRole("tab", { name: "Decisions" }).click();
  await page.getByRole("button", { name: "Record a decision" }).click();
  await page.getByLabel("Title").fill(decisionTitle);
  await page.getByLabel("Context").fill("We tested five decks over three weeks.");
  await page.getByLabel("Decision", { exact: true }).fill("Bring Fai as the main.");
  await page.getByLabel("Rationale").fill("Best coverage against the expected field.");
  await page.getByRole("button", { name: "Record decision" }).click();

  await page.getByRole("button", { name: decisionTitle }).click();
  await expect(page.getByText("We tested five decks over three weeks.")).toBeVisible();

  // 4. Polls: create a poll, vote, see the tally, then close it.
  await page.getByRole("tab", { name: "Polls" }).click();
  await page.getByRole("button", { name: "Create a poll" }).click();
  await page.getByLabel("Question").fill(pollQuestion);
  await page.getByLabel("Option 1").fill("Fai");
  await page.getByLabel("Option 2").fill("Kano");
  await page.getByRole("button", { name: "Create poll", exact: true }).click();

  await expect(page.getByText(pollQuestion)).toBeVisible();
  await page.getByRole("button", { name: /^Fai/ }).click();
  await expect(page.getByText(/1 vote/)).toBeVisible();
  await page.getByRole("button", { name: "Close poll" }).click();
  // Once closed, the manage control flips to "Reopen" (unambiguous vs the status filter).
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  // 5. Switch to Bravo: none of alpha's knowledge is visible (tenant isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("link", { name: "Knowledge", exact: true }).click();
  await expect(page.getByText(primerTitle)).toHaveCount(0);

  await page.getByRole("tab", { name: "Decisions" }).click();
  await expect(page.getByText(decisionTitle)).toHaveCount(0);

  await page.getByRole("tab", { name: "Polls" }).click();
  await expect(page.getByText(pollQuestion)).toHaveCount(0);
});
