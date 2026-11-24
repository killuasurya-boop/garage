import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// Audit POS Nov 2026: keranjang tidak hilang saat kasir pindah halaman (Absen/Opname) atau
// tablet refresh. Draf per perangkat dipulihkan saat POS dibuka lagi, lalu hilang setelah dikosongkan.
test.describe.configure({ mode: "serial" });

test("Draf keranjang pulih setelah halaman dimuat ulang", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur kasir diuji di tablet/desktop");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "kasir2@garage.id");
  await expect(page).toHaveURL(/\/pos/);
  const surface = page.locator("section.cashier-pos-surface[data-pos-v6]");
  const start = page.getByRole("button", { name: "Mulai Shift Kasir" });
  await expect(start.or(surface)).toBeVisible({ timeout: 90_000 });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Rp 100.000" }).click();
    await dialog.getByRole("button", { name: "Mulai Shift & Buka POS" }).click();
  }
  await expect(surface).toBeVisible({ timeout: 90_000 });

  const cards = page.locator('.pos-v6-card[data-sold-out="false"]');
  await cards.first().click();
  await cards.nth(1).click();
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (2)");

  await page.reload();
  await expect(surface).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("pos-notice")).toContainText("Keranjang sebelumnya dipulihkan (2 item)", { timeout: 30_000 });
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (2)");
  if (process.env.E2E_SHOTS_DIR) {
    await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/pos-cart-draft-desktop.png` });
  }

  // Kosongkan keranjang → draf ikut hilang; reload berikutnya mulai kosong.
  await page.getByRole("button", { name: "Hapus keranjang" }).click();
  const confirm = page.getByRole("dialog", { name: "Hapus keranjang?" });
  await confirm.getByRole("button", { name: "Hapus keranjang" }).click();
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (0)");
  await page.reload();
  await expect(surface).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (0)");
  await expect(page.getByTestId("pos-notice")).toHaveCount(0);
  assertNoErrors();
});
