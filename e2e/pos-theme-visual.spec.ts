import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers";

// Harness piksel tema POS (U9, owner 25 Nov 2026): memotret 6 layar POS di 5 tema kasir supaya perubahan warna/kelas
// bisa dibuktikan TIDAK mengubah tampilan (lihat docs/pos-v6/WARNA-TEMA-3-LAPIS.md). Hanya jalan bila POS_VISUAL_DIR
// diisi — folder di LUAR .e2e-data (server E2E menghapus .e2e-data tiap start):
//   POS_VISUAL_DIR=/tmp/pos-visual/before npx playwright test e2e/pos-theme-visual.spec.ts --project=desktop-1366 --trace off
// ubah kode, ulangi ke /tmp/pos-visual/after, lalu `node scripts/pos-visual-diff.mjs /tmp/pos-visual/before /tmp/pos-visual/after`.
// Jam dibekukan; maskot AYA & indikator dev disembunyikan → dua run tanpa perubahan = 0 piksel beda. Snapshot tidak di-commit.
const OUT = process.env.POS_VISUAL_DIR;
const THEMES = ["garage-signature", "garage-clear", "warm-light", "focus-blue", "garage-default"] as const;
const FIXED_TIME = new Date("2026-11-25T13:00:00+07:00");

test.describe.configure({ mode: "serial" });

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(700);
}

async function shot(page: Page, name: string) {
  await settle(page);
  // Maskot AYA & indikator dev Next.js bergerak sendiri (bukan bagian tema) → disembunyikan supaya tidak jadi noise.
  await page.addStyleTag({ content: ".aya-pet,nextjs-portal{visibility:hidden!important}" });
  await page.evaluate(() => document.fonts.ready);
  // Tunggu layout stabil: potret ulang sampai dua potretan berturut-turut identik (maks 8×) — mesin sibuk bisa
  // memotret sebelum data/kartu selesai bergeser.
  let previous = await page.screenshot({ animations: "disabled", caret: "hide" });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.waitForTimeout(400);
    const current = await page.screenshot({ animations: "disabled", caret: "hide" });
    if (current.equals(previous)) break;
    previous = current;
  }
  fs.writeFileSync(path.join(OUT!, `${name}.png`), previous);
}

async function addCards(page: Page) {
  for (const index of [0, 1]) {
    await page.locator('.pos-v6-card[data-sold-out="false"]').nth(index).click();
    const variant = page.getByRole("dialog").getByRole("button", { name: /Rp/ }).first();
    if (await variant.isVisible().catch(() => false)) await variant.click();
  }
}

test("tema POS: potret layar utama di 5 tema", async ({ page }, info) => {
  test.skip(!OUT || info.project.name !== "desktop-1366", "harness visual: set POS_VISUAL_DIR");
  test.setTimeout(600_000);
  fs.mkdirSync(OUT!, { recursive: true });
  await page.clock.setFixedTime(FIXED_TIME);
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page, "kasir2@garage.id");
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

  for (const theme of THEMES) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate((value) => window.localStorage.setItem("garage-cashier-theme", value), theme);
    await page.reload();
    await expect(surface).toBeVisible({ timeout: 90_000 });
    await expect(surface).toHaveAttribute("data-cashier-theme", theme);
    await addCards(page);
    await shot(page, `${theme}-01-katalog`);

    await page.keyboard.press("F9");
    await expect(page.getByRole("dialog", { name: "Pembayaran POS" })).toBeVisible();
    await shot(page, `${theme}-02-bayar`);
    await page.keyboard.press("Escape");

    await page.keyboard.press("F6");
    await settle(page);
    await shot(page, `${theme}-03-belum-bayar`);
    await page.keyboard.press("Escape");

    await page.keyboard.press("F3");
    await shot(page, `${theme}-04-meja`);
    await page.keyboard.press("Escape");

    await page.keyboard.press("F4");
    await shot(page, `${theme}-05-riwayat`);
    await page.keyboard.press("Escape");

    await page.keyboard.press("F1");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, `${theme}-06-mobile`);

    // Keranjang hanya di memori → kosong lagi setelah reload tema berikutnya.
  }
});
