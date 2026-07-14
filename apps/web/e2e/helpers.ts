import { expect, type Locator, type Page } from "@playwright/test";
import { authenticator } from "otplib";

import { E2E_PASSWORD } from "./fixtures";

/**
 * Drag a dnd-kit draggable (its handle) onto a droppable target. dnd-kit's pointer
 * sensor needs a real move past its activation distance before it starts dragging, then
 * a move over the target, so this dispatches stepped mouse moves rather than a single
 * jump (a plain dragTo often doesn't trigger it).
 */
export async function dragCardOnto(page: Page, handle: Locator, target: Locator): Promise<void> {
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("dragCardOnto: missing bounding box");
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(startX + 10, startY + 10, { steps: 6 }); // clear the activation distance
  await page.waitForTimeout(60);
  await page.mouse.move(endX, endY, { steps: 20 }); // travel to the target droppable
  await page.waitForTimeout(60);
  await page.mouse.move(endX, endY + 2, { steps: 3 }); // settle so collision resolves
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(60);
}

/**
 * Drive the real onboarding flow (setup link → password → TOTP → backup codes)
 * and land in the app. Shared by specs so the critical auth path is exercised
 * once, in one place. Each caller passes its own single-use setup token.
 */
export async function completeOnboarding(
  page: Page,
  options: { setupToken: string; password?: string },
): Promise<void> {
  const password = options.password ?? E2E_PASSWORD;

  await page.goto(`/setup/${options.setupToken}`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  await page.getByLabel("Authenticator code").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByTestId("backup-codes")).toBeVisible();
  await page.getByRole("button", { name: "Continue to app" }).click();

  // Landed in the app: the floating notification bell is present on every
  // viewport, unlike the sidebar nav (which collapses to a drawer on mobile) and
  // the sidebar-footer Sign out (hidden on mobile).
  await expect(page.getByRole("button", { name: /Notifications/ })).toBeVisible();
}
