import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// GOD++ Cashier Guardian (Nov 2026): uang diterima tidak terisi otomatis, tombol final menyebut
// metode & nominal, tunai kurang tidak bisa dikonfirmasi, Uang Pas memakai total terbaru,
// transaksi tersimpan sekali. Plus panel QC Kasir terbuka dengan status nyata.
test.describe.configure({ mode: "serial" });

test("Guardian: bayar tunai lewat dialog — tidak ada isi otomatis, kurang ditolak, uang pas tersimpan", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur kasir diuji di tablet/desktop");
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
  await expect(page.locator("section.cashier-pos-surface[data-pos-v6]")).toBeVisible({ timeout: 90_000 });

  // QC Kasir: status nyata tampil.
  await page.getByTestId("pos-qc-open").click();
  const qc = page.getByRole("dialog", { name: "QC Kasir" });
  await expect(qc.getByText("Shift kasir")).toBeVisible();
  await expect(qc.getByText(/Server terhubung/)).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");

  await page.locator('.pos-v6-card[data-sold-out="false"]').first().click();
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (1)");

  await page.keyboard.press("F9");
  const pay = page.getByRole("dialog", { name: "Pembayaran POS" });
  await expect(pay).toBeVisible();
  await pay.getByRole("button", { name: "Lanjut", exact: true }).click();
  await pay.getByText("Take away", { exact: true }).click();
  await pay.getByRole("button", { name: "Lanjut Pelanggan" }).click();
  await pay.getByRole("button", { name: "Lanjut Pembayaran" }).click();

  // Tidak ada isi otomatis: tombol final belum bisa ditekan.
  const input = pay.getByLabel("Uang diterima dari pelanggan (Rupiah)");
  await expect(input).toHaveValue("");
  await expect(pay.getByRole("button", { name: "Isi uang diterima" })).toBeDisabled();

  // Uang kurang ditolak.
  await input.fill("1000");
  await expect(pay.getByRole("button", { name: /^Uang kurang/ })).toBeDisabled();

  // Uang Pas memakai total saat ini → tombol menyebut nominal yang dicatat.
  await pay.getByRole("button", { name: /Uang Pas/ }).click();
  const confirm = pay.getByRole("button", { name: /^Terima uang pas Rp/ });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  // Setelah tersimpan, dialog berganti judul "Transaksi selesai" + kembalian Rp 0 (uang pas).
  const done = page.getByRole("dialog", { name: "Transaksi selesai" });
  await expect(done.getByText(/POS-\d+/).first()).toBeVisible({ timeout: 90_000 });
  await expect(done.getByText("Rp 0", { exact: true }).first()).toBeVisible();
  assertNoErrors();
});
