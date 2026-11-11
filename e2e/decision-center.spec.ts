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
  // Tutup lagi shift Kasir 2: satu outlet hanya boleh satu shift terbuka, jadi shift yang ditinggal terbuka
  // membuat spec berikutnya (mis. partner-hub-uat UAT-B) gagal membuka shift. Pengajuan diskon tidak
  // memindahkan uang → laci tetap Rp100.000.
  const history = await kasir.request.get("/api/finance/cash-sessions/me?limit=8");
  const open = ((await history.json()) as { data?: { rows?: Array<{ id: string; closedAt: string | null }> } }).data?.rows?.find((row) => !row.closedAt);
  if (open) {
    const closeRes = await kasir.request.patch(`/api/finance/cash-sessions/${open.id}/close`, {
      data: { actualCash: 100_000, denominations: { "100000": 1 } },
    });
    expect(closeRes.status(), await closeRes.text()).toBeLessThan(300);
  }
  await ctx.close();

  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  await page.goto("/control/decision");
  const center = page.getByTestId("decision-center");
  await expect(center).toBeVisible({ timeout: 90_000 });

  // R3 (diskon Rp150.000): dialog setuju meminta kode 2FA; tombol mati tanpa kode.
  await center.getByTestId("dc-row").filter({ hasText: "Rp150.000" }).first().click();
  await expect(page.getByTestId("dc-detail")).toContainText("Rekomendasi AYA");
  await page.getByTestId("dc-action-approve").click();
  await expect(page.getByLabel("Kode 2FA")).toBeVisible();
  await expect(page.getByTestId("dc-confirm")).toBeDisabled();
  await page.keyboard.press("Escape");

  // R2 (Rp40.000): tolak wajib alasan.
  await center.getByTestId("dc-row").filter({ hasText: "Rp40.000" }).first().click();
  await expect(page.getByTestId("dc-detail")).toContainText("Konsekuensi keputusan");
  await page.getByTestId("dc-action-reject").click();
  await expect(page.getByTestId("dc-confirm")).toBeDisabled();
  await page.getByPlaceholder("Tulis catatan…").fill("Diskon melebihi kebijakan kompensasi");
  await page.getByTestId("dc-confirm").click();
  await expect(page.getByText("Pengajuan ditolak.")).toBeVisible({ timeout: 30_000 });
  await center.getByRole("tab", { name: "Ditolak" }).click();
  await expect(center.getByTestId("dc-row").filter({ hasText: "Rp40.000" })).toBeVisible();
  assertNoErrors();
});
