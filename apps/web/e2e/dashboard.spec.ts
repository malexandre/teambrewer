import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_DASHBOARD_EVENT_NAME,
  E2E_DASHBOARD_SETUP_TOKEN,
  E2E_PASSWORD,
  E2E_REFERENCE,
  E2E_TEAMS,
} from "./fixtures";

test("land on the dashboard, read personal + team overviews, then confirm isolation", async ({
  page,
}) => {
  // 1. Onboard the dashboard user (setup -> TOTP -> app); the landing screen is "/".
  await page.goto(`/setup/${E2E_DASHBOARD_SETUP_TOKEN}`);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // 2. The personal "For me" view (default) shows my open assignment + recent wins.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(`vs ${E2E_REFERENCE.heroName}`)).toBeVisible();
  await expect(page.getByText("Win").first()).toBeVisible();

  // 3. Switch to the team view and target our event (alpha has several upcoming
  //    events from other journeys, so pick ours explicitly): the ranked "what to
  //    test next" list and an under-covered gap with the assignee.
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByLabel("Target event").selectOption({ label: E2E_DASHBOARD_EVENT_NAME });
  await expect(page.getByText(/Preparing for/)).toContainText(E2E_DASHBOARD_EVENT_NAME);
  await expect(page.getByText(E2E_REFERENCE.heroName).first()).toBeVisible();
  await expect(page.getByText("Aggro Red").first()).toBeVisible();
  await expect(page.getByText(/Assigned: Dashboard User/)).toBeVisible();

  // 4. Switch to the other team: none of alpha's dashboard data is visible (isolation).
  await page
    .getByRole("combobox", { name: /active team/i })
    .selectOption({ label: E2E_TEAMS.bravo.name });
  await page.getByRole("button", { name: "For me", exact: true }).click();
  await expect(page.getByText("No matchups assigned to you right now.")).toBeVisible();
  await expect(page.getByText(`vs ${E2E_REFERENCE.heroName}`)).toHaveCount(0);
});
