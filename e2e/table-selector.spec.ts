import { expect, test } from "@playwright/test";

import { failOnPageErrors } from "./helpers";

// Crystal V5 (Owner, Nov 2026): pilih lantai (01–25 / 26–50), cari nomor, konfirmasi meja → meja dikunci server.
test("Smart Table Selector: lantai, cari, konfirmasi meja @mobile", async ({ page }, info) => {
  const assertNoErrors = failOnPageErrors(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("garage:menu-welcome:v1", "1");
    } catch {
      /* abaikan */
    }
  });
  await page.goto("/order");
  await page.getByTestId("order-type-dine-in").click({ timeout: 90_000 });
  const picker = page.getByTestId("table-picker");
  await expect(picker).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("table-card-01")).toBeVisible({ timeout: 60_000 });
  // Lantai 2 hanya berisi meja 26–50.
  await page.getByTestId("table-floor-2").click();
  await expect(page.getByTestId("table-card-26")).toBeVisible();
  await expect(page.getByTestId("table-card-01")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (process.env.CRYSTAL_SHOTS) await page.screenshot({ path: `${process.env.CRYSTAL_SHOTS}/table-${info.project.name}.png` });
  // Cari "8" di lantai 1 → Meja 08.
  await page.getByTestId("table-floor-1").click();
  await page.getByLabel("Cari nomor meja").fill("8");
  const target = page.getByTestId("table-card-08");
  await expect(target).toBeVisible();
  await target.click();
  const sheet = page.getByTestId("table-confirm-sheet");
  await expect(sheet.getByText(/Kamu di Meja 08, benar\?/)).toBeVisible();
  if (process.env.CRYSTAL_SHOTS) await page.screenshot({ path: `${process.env.CRYSTAL_SHOTS}/table-sheet-${info.project.name}.png` });
  await sheet.getByRole("button", { name: /Ya, pilih meja ini/ }).click();
  // Server penentu: meja terkunci (picker tertutup) atau ditolak dengan alasan yang jelas (mis. kasir belum buka shift).
  await expect(sheet).toBeHidden({ timeout: 30_000 });
  if (await picker.isVisible()) await expect(picker.getByRole("alert")).toBeVisible();
  assertNoErrors();
});
