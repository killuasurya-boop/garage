import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// Tagihan Belum Bayar (Owner, Nov 2026): Bayar nanti → muncul di panel Belum Bayar (metode belum
// dipilih, nama + WA + isi pesanan) → popup detail → Final Bayar tunai WAJIB isi uang → lunas & hilang.
// Plus modul jadi popup (tanpa tab baru) dan sidebar ciut/lebar bertahan setelah refresh.
test.describe.configure({ mode: "serial" });

test("Belum Bayar: tagih tunai dari popup detail, modul popup tanpa tab baru, sidebar ciut", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur kasir diuji di tablet/desktop");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "kasir2@garage.id");
  await expect(page).toHaveURL(/\/pos/);
  const start = page.getByRole("button", { name: "Mulai Shift Kasir" });
  // Tunggu POS atau layar "Shift Belum Dibuka" tampil dulu (tanpa ini cek bisa terlalu cepat).
  await expect(start.or(page.locator("section.cashier-pos-surface[data-pos-v6]"))).toBeVisible({ timeout: 90_000 });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Rp 100.000" }).click();
    await dialog.getByRole("button", { name: "Mulai Shift & Buka POS" }).click();
  }
  await expect(page.locator("section.cashier-pos-surface[data-pos-v6]")).toBeVisible({ timeout: 90_000 });

  // 1. Bayar nanti (take away) dengan nama + WA.
  await page.locator('.pos-v6-card[data-sold-out="false"]').first().click();
  await page.keyboard.press("F9");
  const pay = page.getByRole("dialog", { name: "Pembayaran POS" });
  await pay.getByRole("button", { name: "Lanjut", exact: true }).click();
  await pay.getByText("Take away", { exact: true }).click();
  await pay.getByRole("button", { name: "Lanjut Pelanggan" }).click();
  await pay.getByPlaceholder("Nama pelanggan").fill("Tamu Tagih E2E");
  await pay.getByPlaceholder("08xxxxxxxxxx").fill("081234567890");
  await pay.getByRole("button", { name: "Lanjut Pembayaran" }).click();
  await pay.getByTestId("pos-open-bill").click();
  await expect(page.getByTestId("pos-open-bill-saved")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  // 2. Panel Belum Bayar: kartu ringkas berisi nama, WA, metode belum dipilih.
  await page.getByTestId("pos-pending-open").click();
  const sheet = page.getByTestId("pos-pending-sheet");
  const row = sheet.getByTestId("pos-pending-row").filter({ hasText: "Tamu Tagih E2E" });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("081234567890");
  await expect(row).toContainText("Belum dipilih");

  // 3. Popup detail: isi pesanan lengkap + total.
  await row.getByRole("button", { name: /Detail tagihan/ }).click();
  const detail = page.getByTestId("pos-pending-detail");
  await expect(detail.getByText(/Pesanan · 1 item/)).toBeVisible();
  await expect(detail.getByText("Total tagihan")).toBeVisible();
  await detail.getByTestId("pos-pending-detail-primary").click();

  // 4. Final Bayar tunai: kosong ditolak, Uang Pas → lunas.
  const finalize = page.getByTestId("pos-finalize-dialog");
  await expect(finalize).toBeVisible();
  const confirm = finalize.getByTestId("pos-finalize-confirm");
  await expect(confirm).toHaveText(/Isi uang diterima/);
  await expect(confirm).toBeDisabled();
  await finalize.getByRole("button", { name: /Uang Pas/ }).click();
  await expect(confirm).toHaveText(/Terima uang pas Rp/);
  await confirm.click();
  await expect(finalize).toBeHidden();
  await expect(sheet.getByTestId("pos-pending-row").filter({ hasText: "Tamu Tagih E2E" })).toHaveCount(0, { timeout: 60_000 });
  await page.keyboard.press("Escape");

  // 5. Modul jadi popup: Riwayat Penjualan terbuka di dalam POS, tab tetap satu.
  await page.getByTestId("pos-more-open").click();
  await page.getByRole("button", { name: "Riwayat penjualan" }).click();
  const moduleSheet = page.getByTestId("pos-module-sheet");
  await expect(moduleSheet).toBeVisible();
  expect(page.context().pages()).toHaveLength(1);
  await moduleSheet.getByTestId("pos-module-close").click();
  await expect(moduleSheet).toBeHidden();

  // 6. Sidebar ciut ↔ lebar, bertahan setelah refresh.
  const sidebar = page.locator("aside.pos-v6-sidebar");
  await page.getByTestId("pos-sidebar-toggle").click();
  await expect(sidebar).toHaveAttribute("data-mode", "compact");
  await page.reload();
  await expect(page.locator("aside.pos-v6-sidebar")).toHaveAttribute("data-mode", "compact", { timeout: 90_000 });
  await page.getByTestId("pos-sidebar-toggle").click();
  await expect(page.locator("aside.pos-v6-sidebar")).toHaveAttribute("data-mode", "full");
  assertNoErrors();
});
