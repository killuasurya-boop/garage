import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// Fase 2 "Kasir Lancar" (25 Nov 2026): kasir laptop bisa bekerja dengan keyboard —
// kolom cari + `2*nama` + Enter, kode scanner tak dikenal tidak menambah item salah,
// Esc mengosongkan, `?` lembar pintasan, F8 Bayar nanti, Riwayat struk bisa dicari.
test.describe.configure({ mode: "serial" });

test("Kasir Lancar: cari + qty + Enter, barcode tak dikenal, Esc, ?, F8", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur keyboard diuji di laptop/desktop");
  const assertNoErrors = failOnPageErrors(page);
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

  // Nama menu nyata dari kartu pertama yang tersedia.
  const label = await page.locator('.pos-v6-card[data-sold-out="false"]').first().getAttribute("aria-label");
  const name = (label ?? "").replace(/^Pesan /, "");
  expect(name.length).toBeGreaterThan(0);

  const search = page.getByTestId("pos-menu-search");
  await page.keyboard.press("F1");
  await expect(search).toBeFocused();

  // Kode scanner yang tidak ada: pesan jelas, keranjang tetap kosong.
  await search.fill("8999999999999");
  await search.press("Enter");
  await expect(page.getByTestId("pos-toast")).toContainText("tidak dikenal");
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (0)");

  // Esc mengosongkan kolom cari.
  await search.fill(name);
  await search.press("Escape");
  await expect(search).toHaveValue("");

  // 2*nama + Enter → 2 item (varian dipilih bila menu punya beberapa varian).
  await search.fill(`2*${name}`);
  await search.press("Enter");
  const variantDialog = page.getByRole("dialog", { name });
  const hasVariants = await variantDialog
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (hasVariants) {
    await variantDialog.getByRole("button", { name: /Rp/ }).first().click();
  }
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (2)");
  await expect(search).toBeFocused();

  // ? = lembar pintasan (fokus di luar kolom ketik).
  await search.blur();
  await page.keyboard.press("?");
  const sheet = page.getByTestId("pos-shortcut-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Bayar nanti (keranjang terisi)")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // F8 = Bayar nanti: dialog bayar terbuka di langkah pembayaran, tombol Bayar nanti terfokus.
  await page.keyboard.press("F8");
  const openBill = page.getByTestId("pos-open-bill");
  await expect(openBill).toBeVisible();
  await expect(openBill).toBeFocused();
  await page.keyboard.press("Escape");
  assertNoErrors();
});
