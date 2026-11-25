import { expect, test } from "@playwright/test";

import { login } from "./helpers";

// POS Fase 4 — mode jual offline (owner 25 Nov 2026): koneksi putus → kasir tetap jual tunai dengan struk
// sementara OFF-…; koneksi kembali → penjualan terkirim otomatis sekali, banner hilang.
test.describe.configure({ mode: "serial" });

test("Offline: jual tunai saat koneksi putus, struk OFF, terkirim otomatis saat online", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur kasir laptop/desktop");
  await login(page, "kasir2@garage.id");
  await expect(page).toHaveURL(/\/pos/);
  const start = page.getByRole("button", { name: "Mulai Shift Kasir" });
  await expect(start.or(page.locator("section.cashier-pos-surface[data-pos-v6]"))).toBeVisible({ timeout: 90_000 });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Rp 100.000" }).click();
    await dialog.getByRole("button", { name: "Mulai Shift & Buka POS" }).click();
  }
  await expect(page.locator("section.cashier-pos-surface[data-pos-v6]")).toBeVisible({ timeout: 90_000 });

  // Item satu varian (atau pilih varian pertama).
  await page.locator('.pos-v6-card[data-sold-out="false"]').first().click();
  const variant = page.getByRole("dialog").getByRole("button", { name: /Rp/ }).first();
  if (await variant.isVisible().catch(() => false)) await variant.click();
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (1)");

  // Koneksi putus.
  await context.setOffline(true);
  const banner = page.getByTestId("pos-offline-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-state", "offline");

  // Bayar 1-tap uang pas (tunai) → disimpan di perangkat, struk sementara OFF-….
  await page.getByTestId("pos-quick-cash").click();
  const done = page.getByRole("dialog", { name: "Transaksi selesai" });
  await expect(done.getByText(/OFF-[A-Z0-9]+-\d{4}/).first()).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText("1 penjualan tersimpan di perangkat", { timeout: 15_000 });
  await page.keyboard.press("Escape");

  // Koneksi kembali → terkirim otomatis, banner hilang.
  await context.setOffline(false);
  await expect(page.getByTestId("pos-toast")).toContainText("penjualan offline terkirim", { timeout: 60_000 });
  await expect(banner).toBeHidden({ timeout: 30_000 });
});
