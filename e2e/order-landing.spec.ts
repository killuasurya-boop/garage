import { expect, test } from "@playwright/test";

import { failOnPageErrors } from "./helpers";

// Crystal V5 (Owner, Nov 2026): landing /order — pilih cara pesan; alur self-order tetap.
test("Order landing Crystal: pilih layanan, tanpa overflow @mobile", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("garage:menu-welcome:v1", "1");
    } catch {
      /* abaikan */
    }
  });
  await page.goto("/order");
  const landing = page.getByTestId("order-landing");
  await expect(landing).toBeVisible({ timeout: 90_000 });
  await expect(landing.getByRole("heading", { name: /Mau pesan untuk apa/i })).toBeVisible();
  await expect(page.getByTestId("order-type-dine-in")).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByTestId("order-type-takeaway").click();
  await expect(landing).toBeHidden();
  assertNoErrors();
});
