import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers";

// POS Fase 5 (owner 25 Nov 2026): "Sering dibeli bersama" & "Terlaris 7 hari" hanya muncul dari penjualan nyata.
// 3 penjualan berisi 2 item yang sama → setelah muat ulang, menambah item pertama menampilkan item kedua sebagai saran.
test.describe.configure({ mode: "serial" });

async function addCard(page: Page, index: number) {
  await page.locator('.pos-v6-card[data-sold-out="false"]').nth(index).click();
  const variant = page.getByRole("dialog").getByRole("button", { name: /Rp/ }).first();
  if (await variant.isVisible().catch(() => false)) await variant.click();
}

test("Insight: saran sering dibeli bersama & tile terlaris dari penjualan nyata", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur kasir laptop/desktop");
  test.setTimeout(240_000);
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

  const secondName = (await page.locator('.pos-v6-card[data-sold-out="false"]').nth(1).getAttribute("aria-label"))?.replace(/^Pesan /, "");

  for (let round = 0; round < 3; round += 1) {
    await addCard(page, 0);
    await addCard(page, 1);
    await page.getByTestId("pos-quick-cash").click();
    const done = page.getByRole("dialog", { name: "Transaksi selesai" });
    await expect(done).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(done).toBeHidden();
  }

  // Data terlaris & pasangan dimuat saat POS dibuka.
  await page.reload();
  await expect(surface).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: /Terlaris 7 hari/ })).toBeVisible({ timeout: 30_000 });

  await addCard(page, 0);
  const pairing = page.getByTestId("pos-pairing");
  await expect(pairing).toBeVisible({ timeout: 30_000 });
  await expect(pairing).toContainText("Sering dibeli bersama");
  if (secondName) await expect(pairing).toContainText(secondName);
  await expect(pairing.getByRole("button").first()).toContainText(/\d+×/);

  // Klik saran = item masuk keranjang, saran itu hilang (sudah di keranjang).
  await pairing.getByRole("button").first().click();
  const variant = page.getByRole("dialog").getByRole("button", { name: /Rp/ }).first();
  if (await variant.isVisible().catch(() => false)) await variant.click();
  await expect(page.locator(".pos-v6-bill-tab").first()).toContainText("Pesanan (2)");

  // Bersihkan keranjang untuk alur berikutnya.
  await page.getByRole("button", { name: "Hapus keranjang" }).click();
  const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await confirm.getByRole("button", { name: /Hapus|Kosongkan|Ya/ }).first().click();
  await expect(page.locator(".pos-v6-bill-tab").first()).not.toContainText("Pesanan (2)");
});
