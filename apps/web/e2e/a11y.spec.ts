import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { E2E_A11Y_SETUP_TOKEN } from "./fixtures";
import { completeOnboarding } from "./helpers";

/**
 * Automated accessibility scan (phase-13). Onboards once (single-use token), then
 * runs axe against the key read-only screens in sequence, failing on any
 * serious/critical WCAG 2 A/AA violation. This is the regression net for the a11y
 * pass; keyboard/focus specifics are covered by component tests.
 */
const SCREENS: ReadonlyArray<{ name: string; path: string; ready: RegExp }> = [
  { name: "decks", path: "/", ready: /decks/i },
  { name: "metas", path: "/metas", ready: /metas/i },
  { name: "events", path: "/events", ready: /events/i },
  { name: "games", path: "/games", ready: /games/i },
  { name: "tasks", path: "/tasks", ready: /tasks/i },
];

test("key screens have no serious/critical a11y violations", async ({ page }) => {
  await completeOnboarding(page, { setupToken: E2E_A11Y_SETUP_TOKEN });

  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await expect(page.getByRole("heading", { name: screen.ready }).first()).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const seriousViolations = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    const summary = seriousViolations.map((violation) => ({
      screen: screen.name,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    }));
    expect(seriousViolations, JSON.stringify(summary, null, 2)).toEqual([]);
  }
});
