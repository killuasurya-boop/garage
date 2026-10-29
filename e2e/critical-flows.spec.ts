import { expect, test } from "@playwright/test";

import { failOnPageErrors, login, todayJakarta } from "./helpers";

// =============================================================================
// 5 alur kritis Garage OS (audit 29 Okt 2026 #8). Berurutan pada satu DB baru:
//   1. login Owner   2. POS: buka shift → jual tunai (uang pas) + QRIS
//   3. tutup shift: hitung #1/#2, modal ditinggal, setor BNI → antrean Pengawasan Kas
//   4. Owner: PDF closing & Excel buku kas   5. Kelola Staff: dialog bisa digulir sampai Simpan
// =============================================================================

test.describe.configure({ mode: "serial" });

test("1. login Owner @mobile", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  await expect(page.getByText(/Garage/i).first()).toBeVisible();
  assertNoErrors();
});

test("2. POS: buka shift, jual tunai uang pas lalu QRIS", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur kasir diuji di tablet/desktop");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "kasir@garage.id");
  await expect(page).toHaveURL(/\/pos/);

  await page.getByRole("button", { name: "Mulai Shift Kasir" }).click();
  const openDialog = page.getByRole("dialog");
  await openDialog.getByRole("button", { name: "Rp 100.000" }).click();
  await openDialog.getByRole("button", { name: "Mulai Shift & Buka POS" }).click();
  await expect(page.getByRole("button", { name: "Penjualan Langsung" })).toBeVisible({ timeout: 60_000 });

  // Tunai — uang pas.
  await page.getByRole("button", { name: "Penjualan Langsung" }).click();
  const sale = page.getByRole("dialog");
  await sale.getByRole("button", { name: "Tambah Mineral" }).first().click();
  await sale.getByRole("button", { name: "Uang pas" }).click();
  await sale.getByRole("button", { name: /Terima uang pas/ }).click();
  await expect(sale.getByText("Kembalian untuk pelanggan", { exact: false })).toBeVisible();
  await expect(sale.getByText(/POS-\d+/).first()).toBeVisible();

  // Transaksi baru — QRIS.
  await sale.getByRole("button", { name: "Transaksi Baru" }).click();
  await sale.getByRole("button", { name: "Tambah Mineral" }).first().click();
  await sale.getByRole("radio", { name: "QRIS" }).click();
  await sale.getByLabel("Referensi QRIS").fill(`E2E${Date.now().toString().slice(-8)}`);
  await sale.getByRole("button", { name: /QRIS berhasil/ }).click();
  await expect(sale.getByText(/POS-\d+/).first()).toBeVisible();
  assertNoErrors();
});

test("3. tutup shift: hitung #1/#2, modal ditinggal, setoran BNI masuk antrean", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur kasir diuji di tablet/desktop");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "kasir@garage.id");
  await page.getByRole("button", { name: "Shift Aktif" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Tutup \/ Ganti Shift Kasir/ });
  await expect(dialog).toBeVisible();

  // Laci = modal 100.000 + tunai 5.000 (QRIS tidak masuk laci).
  await dialog.getByTestId("close-denom-100000").fill("1");
  await dialog.getByTestId("close-denom-5000").fill("1");
  await dialog.getByRole("button", { name: /^Rp\s?100\.000$/ }).click();
  await dialog.getByRole("radio", { name: "Rekening BNI" }).click();
  // Checklist wajib: tanpa centang, form menolak lanjut.
  await dialog.getByRole("button", { name: /Periksa & tutup shift/ }).click();
  await expect(dialog.getByText("Centang semua checklist tutup shift.")).toBeVisible();
  const boxes = dialog.getByRole("checkbox");
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check();
  await dialog.getByRole("button", { name: /Periksa & tutup shift/ }).click();

  // Hitungan #2 (blind, form kosong).
  await expect(dialog.getByText(/Hitung ulang #2/)).toBeVisible();
  await expect(dialog.getByTestId("close-denom-2-100000")).toHaveValue("");
  await dialog.getByTestId("close-denom-2-100000").fill("1");
  await dialog.getByTestId("close-denom-2-5000").fill("1");
  await dialog.getByRole("button", { name: "Lanjut" }).click();
  await dialog.getByRole("button", { name: /Ya, tutup shift|Sign-off & Tutup Shift/ }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  assertNoErrors();

  // Owner melihat setoran di antrean Pengawasan Kas.
  await page.context().clearCookies();
  await login(page, "owner@garage.id");
  await page.goto("/control/cash-closing");
  // Peta penguasaan uang (Owner 360): modal ditinggal 100.000, setoran 5.000 menunggu konfirmasi bank.
  await expect(page.getByRole("row", { name: /Modal ditinggal untuk shift berikutnya\s+Rp\s?100\.000/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row", { name: /Setoran dalam perjalanan.*Rp\s?5\.000/ })).toBeVisible();
  // Antrean tindakan Pengawasan Kas: setoran ke BNI belum dikonfirmasi.
  const queue = page.getByRole("button", { name: /Setoran belum dikonfirmasi masuk rekening.*\b1$/ });
  await expect(queue).toBeVisible();
  await queue.click();
  await expect(page.getByText(/Ke Rekening BNI/).first()).toBeVisible();
});

test("4. Owner: unduh PDF closing & Excel buku kas", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "unduhan sama untuk semua ukuran layar");
  await login(page, "owner@garage.id");
  const day = todayJakarta();

  const pdf = await page.request.get(`/api/reports/owner-official?type=closing&date=${day}&format=pdf`);
  expect(pdf.status(), await pdf.text().catch(() => "")).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  const xlsx = await page.request.get(`/api/reports/owner-official?type=ledger&month=${day.slice(0, 7)}&format=xlsx`);
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

  // Tanpa sesi: ditolak.
  const anon = await page.context().browser()!.newContext({ baseURL: info.project.use.baseURL });
  expect((await anon.request.get(`/api/reports/owner-official?type=closing&date=${day}`)).status()).toBe(401);
  await anon.close();
});

test("5. Kelola Staff: dialog Tambah Staff bisa digulir sampai Simpan @mobile", async ({ page }) => {
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  await page.goto("/control/users");
  // Layar pendek (= HP dengan keyboard terbuka): form lebih tinggi dari layar, jadi harus bisa digulir.
  await page.setViewportSize({ width: 390, height: 560 });
  await page.getByRole("button", { name: /Tambah Staff/ }).first().click();
  const dialog = page.getByRole("dialog", { name: /Tambah Staff Baru/ });
  await expect(dialog).toBeVisible();
  // Isian paling bawah harus bisa dicapai dengan menggulir (tombol Simpan sendiri menempel di bawah).
  // Gulir seperti pengguna (roda/usap), bukan scrollIntoView — kode bisa menggulir kotak overflow-hidden, jari tidak.
  const lastField = dialog.locator("input, textarea, [role='combobox']").last();
  await expect(lastField).not.toBeInViewport({ ratio: 1 });
  const box = (await dialog.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height, 560) / 2);
  for (let i = 0; i < 6; i += 1) await page.mouse.wheel(0, 400);
  await expect(lastField).toBeInViewport({ ratio: 1 });
  const save = dialog.getByRole("button", { name: /^Simpan$/ });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport({ ratio: 1 });
  // Benar-benar bisa ditekan: form kosong → server menolak (tidak ada akun dibuat).
  const response = page.waitForResponse((r) => r.url().endsWith("/api/admin/users") && r.request().method() === "POST");
  await save.click();
  expect((await response).status()).toBe(400);
  assertNoErrors();
});
