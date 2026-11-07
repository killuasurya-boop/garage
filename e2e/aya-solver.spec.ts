import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// AYA Problem Solver V4: Owner menulis masalah → laporan bukti (baca-saja) → kasus tersimpan →
// pilih opsi tercatat sebagai keputusan (tanpa eksekusi).
test("AYA Problem Solver: investigasi baca-saja tersimpan sebagai kasus dan keputusan tercatat", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Owner diuji di desktop");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  await page.goto("/control/aya-solver");
  const root = page.getByTestId("aya-solver");
  await expect(root).toBeVisible({ timeout: 90_000 });
  await root.getByLabel("Masalah / pertanyaan").fill("Kenapa kas shift selisih dan QRIS belum cocok?");
  await root.getByLabel("Penjelasan AI (data tersensor)").uncheck();
  await root.getByTestId("aya-submit").click();
  const report = page.getByTestId("aya-report");
  await expect(report).toBeVisible({ timeout: 90_000 });
  await expect(report).toContainText("Fakta terverifikasi");
  await expect(report).toContainText("pengawasan_kas");
  await expect(report).toContainText("Eksekusi: belum dilakukan");
  await expect(root.getByText(/^AYA-\d{6}-/).first()).toBeVisible();
  await report.getByRole("button", { name: "Pilih opsi ini" }).first().click();
  await expect(report).toContainText("Keputusan Owner", { timeout: 30_000 });
  assertNoErrors();
});
