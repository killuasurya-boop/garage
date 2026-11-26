import { expect, test, type Page } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// Menu POS ringkas (Nov 2026): sidebar 9 menu kerja + "Lainnya", topbar satu baris, lembar Menu <1280.
test.describe.configure({ mode: "serial" });

async function openPos(page: Page) {
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
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("POS nav 1366: sidebar tanpa scroll, 9 menu + Lainnya, grup Lainnya, topbar satu baris", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "sidebar hanya ≥1280");
  const assertNoErrors = failOnPageErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openPos(page);

  const sidebar = page.locator(".pos-v6-sidebar").first();
  await expect(sidebar).toBeVisible();
  const fits = await sidebar.evaluate((el) => el.scrollHeight <= el.clientHeight);
  expect(fits, "sidebar tidak boleh scroll di 1366x768").toBe(true);

  for (const name of ["Kasir", "Pesanan QR", "Meja", "Belum Bayar", "Riwayat Struk", "Produksi Bar & Dapur", "Atur Stok Habis", "Kas Keluar / Masuk"]) {
    await expect(sidebar.getByRole("button", { name: new RegExp(name.replace(/[/&]/g, ".")) }).first()).toBeVisible();
  }
  await expect(sidebar.getByRole("button", { name: /Shift aktif|Mulai shift/ }).first()).toBeVisible();
  await expect(page.getByTestId("pos-more-open")).toBeVisible();

  await page.getByTestId("pos-more-open").click();
  const sheet = page.getByRole("dialog", { name: "Lainnya" });
  for (const g of ["Laporan & riwayat", "Pelanggan", "Gudang & cek", "Perangkat"]) {
    await expect(sheet.getByRole("heading", { name: g })).toBeVisible();
  }
  // Grup Mitra hanya muncul bila Partner Hub aktif (mati di seed E2E).
  await expect(sheet.getByRole("heading", { name: "Mitra" })).toHaveCount(0);
  await sheet.getByRole("button", { name: /Petty cash/ }).click();
  await expect(page.getByRole("dialog").filter({ hasText: /Petty cash/i }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  const tb = await page.locator(".pos-v6-topbar").first().boundingBox();
  expect(tb && tb.height).toBeLessThanOrEqual(64);
  expect(await noHScroll(page)).toBe(true);

  // Tombol F tetap membuka panelnya.
  await page.locator("body").click({ position: { x: 700, y: 400 } });
  for (const key of ["F2", "F3", "F4", "F6"]) {
    await page.keyboard.press(key);
    await expect(page.locator('[role="dialog"][data-state="open"]').first(), `${key} membuka panel`).toBeVisible();
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0, { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
  }
  assertNoErrors();
});

test("POS nav 1024: tanpa overflow horizontal, tombol Menu membuka lembar lengkap", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "satu proyek cukup; viewport diatur manual");
  const assertNoErrors = failOnPageErrors(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await openPos(page);
  expect(await noHScroll(page)).toBe(true);
  const tb = await page.locator(".pos-v6-topbar").first().boundingBox();
  expect(tb && tb.height).toBeLessThanOrEqual(64);

  await page.getByTestId("pos-menu-open").click();
  const sheet = page.getByRole("dialog").filter({ hasText: "Laporan & riwayat" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Belum Bayar").filter({ visible: true }).first()).toBeVisible();
  await expect(sheet.getByText("Laporan & riwayat").filter({ visible: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  assertNoErrors();
});
