import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// POS V6 Theme Studio (owner, Nov 2026): ganti tema hanya visual — keranjang tetap, pilihan bertahan
// setelah refresh, F9 hanya membuka dialog bayar. Berjalan setelah critical-flows (shift kasir 1 sudah ditutup).
test.describe.configure({ mode: "serial" });

test("POS V6: ganti tema tanpa mengubah keranjang, tema bertahan setelah refresh", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "sidebar & Mode Tampilan tampil di layar lebar");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "kasir2@garage.id");
  await expect(page).toHaveURL(/\/pos/);

  const start = page.getByRole("button", { name: "Mulai Shift Kasir" });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Rp 100.000" }).click();
    await dialog.getByRole("button", { name: "Mulai Shift & Buka POS" }).click();
  }
  const surface = page.locator("section.cashier-pos-surface[data-pos-v6]");
  await expect(surface).toBeVisible({ timeout: 90_000 });
  // Perangkat baru = Garage Signature.
  await expect(surface).toHaveAttribute("data-cashier-theme", "garage-signature");

  // Tambah satu produk varian tunggal.
  await page.locator('.pos-v6-card[data-sold-out="false"]').first().click();
  const orderTab = page.locator(".pos-v6-bill-tab").first();
  await expect(orderTab).toContainText("Pesanan (1)");
  const totalBefore = await page.locator(".pos-total-box").innerText();

  // Ganti tema lewat Mode Tampilan di lembar "Lainnya" → hanya visual.
  await page.getByTestId("pos-more-open").click();
  await page.getByRole("radio", { name: "Tema Warm Coffee" }).click();
  await page.keyboard.press("Escape");
  await expect(surface).toHaveAttribute("data-cashier-theme", "warm-light");
  await expect(orderTab).toContainText("Pesanan (1)");
  expect(await page.locator(".pos-total-box").innerText()).toBe(totalBefore);

  // Theme Studio: pilih Focus Blue + katalog Daftar.
  await page.getByTestId("pos-more-open").click();
  await page.getByRole("button", { name: "Theme Studio" }).first().click();
  const studio = page.getByRole("dialog", { name: "Garage POS Theme Studio" });
  await studio.getByRole("radio", { name: /Focus Blue/ }).click();
  await studio.getByRole("radio", { name: "Daftar" }).click();
  await studio.getByRole("button", { name: "Selesai" }).click();
  await expect(surface).toHaveAttribute("data-cashier-theme", "focus-blue");
  await expect(surface).toHaveAttribute("data-pos-product-view", "list");

  // Refresh: preferensi tampilan bertahan.
  await page.reload();
  await expect(surface).toBeVisible({ timeout: 90_000 });
  await expect(surface).toHaveAttribute("data-cashier-theme", "focus-blue");
  await expect(surface).toHaveAttribute("data-pos-product-view", "list");

  // F9 hanya membuka dialog pembayaran (tidak menyelesaikan transaksi).
  if (!(await orderTab.innerText()).includes("(0)")) {
    await page.keyboard.press("F9");
    await expect(page.getByRole("dialog", { name: "Pembayaran POS" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  assertNoErrors();
});
