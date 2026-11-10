import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

import { failOnPageErrors } from "./helpers";

// Crystal V5 (Owner, Nov 2026): akun baru dari Google → lengkapi profil (WA + S&K wajib, promo opsional) → member aktif.
// Cookie "pending" dibuat di sini dengan kunci server uji (sama seperti setelah callback Google terverifikasi);
// tombol Google sendiri tidak tampil karena Client ID tidak diset di server uji.
function pendingCookie(secret: string, payload: Record<string, unknown>) {
  const key = createHmac("sha256", secret).update("google-oauth:pending").digest();
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

test("Member Google: lengkapi profil → membership aktif @mobile", async ({ page, context }, info) => {
  const assertNoErrors = failOnPageErrors(page);
  const suffix = info.project.name === "mobile-390" ? "2" : "1";
  await context.addCookies([
    {
      name: "garage_member_google_pending",
      value: pendingCookie(process.env.E2E_AUTH_SECRET!, {
        sub: `e2e-google-${suffix}`,
        email: `e2e.google${suffix}@example.com`,
        name: "Raka E2E",
        picture: null,
        next: "/member",
      }),
      url: test.info().project.use.baseURL ?? "http://127.0.0.1:3101",
    },
  ]);
  await page.goto("/member-login?mode=google-complete&next=%2Fmember");
  const form = page.getByTestId("member-google-complete");
  await expect(form).toBeVisible({ timeout: 90_000 });
  await expect(form.getByText(`e2e.google${suffix}@example.com`)).toBeVisible();
  await expect(form.getByRole("checkbox").nth(1)).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (process.env.CRYSTAL_SHOTS) await page.screenshot({ path: `${process.env.CRYSTAL_SHOTS}/google-complete-${info.project.name}.png`, fullPage: true });
  await form.getByLabel("Nomor WhatsApp").fill(`08129900000${suffix}`);
  await form.getByRole("checkbox").first().check();
  await form.getByRole("button", { name: /Aktifkan Membership/ }).click();
  await expect(page).toHaveURL(/\/member(\?|$)/, { timeout: 60_000 });
  await expect(page.getByText("Raka E2E").first()).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (process.env.CRYSTAL_SHOTS) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${process.env.CRYSTAL_SHOTS}/member-${info.project.name}.png` });
  }
  assertNoErrors();
});
