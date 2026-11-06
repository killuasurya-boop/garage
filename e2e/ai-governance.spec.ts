import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// AI Governance (Batch 7): Owner melihat mode AYA dari saklar nyata, mengubah ke "Baca saja",
// membuka "Eksekusi terkendali" hanya lewat konfirmasi; batas risiko & aturan tetap tampil;
// PDF keputusan tersedia dari Decision Center.
test("AI Governance: mode AYA berubah lewat konfirmasi; aturan tetap tampil", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "alur Owner diuji di desktop");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  await page.goto("/control/ai-governance");
  const panel = page.getByTestId("ai-governance");
  await expect(panel.getByRole("heading", { name: "AI Governance" })).toBeVisible({ timeout: 90_000 });
  await expect(panel.getByText("Dilarang total (R4)")).toBeVisible();
  await expect(panel.getByText(/Batas risiko tool \(\d+\)/)).toBeVisible();

  await panel.getByTestId("gov-mode-read_only").click();
  await expect(panel.getByTestId("gov-mode-read_only")).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });

  // Membuka tulis butuh konfirmasi kedua.
  await panel.getByTestId("gov-mode-controlled").click();
  await expect(panel.getByTestId("gov-confirm-controlled")).toBeVisible();
  await expect(panel.getByTestId("gov-mode-read_only")).toHaveAttribute("aria-checked", "true");
  await panel.getByTestId("gov-confirm-controlled").click();
  await expect(panel.getByTestId("gov-mode-controlled")).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });

  // PDF keputusan: Owner saja, berkas PDF sungguhan.
  const approvals = await page.request.get("/api/approvals");
  const list = ((await approvals.json()) as { data: Array<{ id: string }> }).data;
  if (list.length) {
    const pdf = await page.request.get(`/api/control/decision-center/${encodeURIComponent(list[0].id)}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
  }
  assertNoErrors();
});
