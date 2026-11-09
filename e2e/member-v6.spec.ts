import { expect, test } from "@playwright/test";

import { failOnPageErrors } from "./helpers";

// Member V6 (Owner, 9 Nov 2026): login/daftar sinematik dengan kartu 3D Three.js. Kartu 3D wajib siap (atau fallback
// tanpa WebGL), tanpa overflow di semua lebar, validasi HP inline, daftar → layar sukses dengan tier dari backend.
const SHOTS = process.env.CRYSTAL_SHOTS;

test("Member V6: login & daftar sinematik, responsif, validasi, sukses", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "satu proyek cukup; lebar diatur manual");
  test.setTimeout(240_000);
  const assertNoErrors = failOnPageErrors(page);
  for (const [w, h] of [[1440, 900], [1920, 1080], [1024, 768], [768, 1024], [390, 844], [360, 780]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/member-login");
    await expect(page.getByTestId("member-card-stage")).toHaveAttribute("data-state", /ready|fallback/, { timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /Selamat Datang Kembali/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow ${w}`).toBeLessThanOrEqual(1);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/member-v6-login-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Validasi inline (nomor HP terlalu pendek) tanpa memanggil server.
  await page.getByLabel("Email atau Nomor HP").fill("0813 123");
  await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(page.getByText("Nomor HP tidak valid. Gunakan minimal 10 digit.")).toBeVisible();

  // Daftar: S&K wajib; sukses menampilkan tier dari backend + kartu 3D.
  await page.getByRole("button", { name: /Daftar Sekarang/ }).click();
  await expect(page.getByRole("heading", { name: /Daftar Member/ })).toBeVisible();
  await page.getByLabel("Nama Lengkap").fill("Raka V6");
  await page.getByLabel("Nomor HP").fill("081277700099");
  await page.getByLabel("PIN Member").fill("123456");
  await page.getByRole("button", { name: "Tampilkan PIN" }).click();
  await expect(page.getByLabel("PIN Member")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: /^Daftar Sekarang/ }).click();
  await expect(page.getByText(/Setujui Kebijakan Privasi/)).toBeVisible();
  await page.getByTestId("member-register-terms").check();
  await page.getByRole("button", { name: /^Daftar Sekarang/ }).click();
  const success = page.getByTestId("member-register-success");
  await expect(success).toBeVisible({ timeout: 30_000 });
  await expect(success.getByText("Silver Member")).toBeVisible();
  await expect(page.getByTestId("member-success-stage")).toHaveAttribute("data-state", /ready|fallback/, { timeout: 60_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/member-v6-success.png` });
  await success.getByRole("button", { name: /Lanjut ke Akun Member/ }).click();
  await expect(page).toHaveURL(/\/member(\?|$)/, { timeout: 60_000 });
  assertNoErrors();
});
