import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// Owner Decision Center (Smart Approval V3): pengajuan nyata dari kasir → Owner melihat masalah,
// rekomendasi AYA & konsekuensi → Tolak wajib alasan → tercatat di tab Ditolak. R3 meminta kode 2FA.
test("Decision Center: tolak pengajuan diskon dengan alasan; R3 meminta 2FA", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Owner diuji di desktop");
  const ctx = await browser.newContext();
  const kasir = await ctx.newPage();
  await login(kasir, "kasir2@garage.id");
  const start = kasir.getByRole("button", { name: "Mulai Shift Kasir" });
  await expect(start.or(kasir.locator("section.cashier-pos-surface[data-pos-v6]"))).toBeVisible({ timeout: 90_000 });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    const dialog = kasir.getByRole("dialog");
    await dialog.getByRole("button", { name: "Rp 100.000" }).click();
    await dialog.getByRole("button", { name: "Mulai Shift & Buka POS" }).click();
    await expect(kasir.locator("section.cashier-pos-surface[data-pos-v6]")).toBeVisible({ timeout: 90_000 });
  }
  for (const rawValue of [40_000, 150_000]) {
    const res = await kasir.request.post("/api/approvals/discount-request", {
      data: { type: "amount", rawValue, baseAfterVoucher: 300_000, reason: "Kompensasi pesanan terlambat" },
    });
    expect(res.status()).toBe(201);
  }
  await ctx.close();

  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  await page.goto("/control/decision");
  const center = page.getByTestId("decision-center");
  await expect(center).toBeVisible({ timeout: 90_000 });

  // R3 (diskon Rp150.000): dialog setuju meminta kode 2FA; tombol mati tanpa kode.
  await center.getByTestId("dc-row").filter({ hasText: "Rp150.000" }).first().click();
  // Keputusan hanya setelah detail pengajuan YANG DIPILIH termuat (bukan detail sebelumnya).
  await expect(page.getByTestId("dc-detail")).toContainText("Rp150.000");
  await expect(page.getByTestId("dc-detail")).toContainText("Rekomendasi AYA");
  await page.getByTestId("dc-action-approve").click();
  await expect(page.getByLabel("Kode 2FA")).toBeVisible();
  await expect(page.getByTestId("dc-confirm")).toBeDisabled();
  await page.keyboard.press("Escape");

  // R2 (Rp40.000): tolak wajib alasan.
  await center.getByTestId("dc-row").filter({ hasText: "Rp40.000" }).first().click();
  // Detail Rp150.000 sebelumnya tidak boleh tetap tampil (bug lama: Tolak jatuh ke pengajuan yang salah).
  await expect(page.getByTestId("dc-detail")).toContainText("Rp40.000");
  await expect(page.getByTestId("dc-detail")).not.toContainText("Rp150.000");
  await expect(page.getByTestId("dc-detail")).toContainText("Konsekuensi keputusan");
  await page.getByTestId("dc-action-reject").click();
  await expect(page.getByTestId("dc-confirm")).toBeDisabled();
  await page.getByPlaceholder("Tulis catatan…").fill("Diskon melebihi kebijakan kompensasi");
  await page.getByTestId("dc-confirm").click();
  await expect(page.getByText("Pengajuan ditolak.")).toBeVisible({ timeout: 30_000 });
  await center.getByRole("tab", { name: "Ditolak" }).click();
  await expect(center.getByTestId("dc-row").filter({ hasText: "Rp40.000" })).toBeVisible();
  // Yang R3 (Rp150.000) tetap menunggu, tidak ikut tertolak.
  await center.getByRole("tab", { name: "Menunggu" }).click();
  await expect(center.getByTestId("dc-row").filter({ hasText: "Rp150.000" }).first()).toBeVisible();
  assertNoErrors();
});
