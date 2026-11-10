import { expect, test } from "@playwright/test";

import { startFakeGoogle } from "./fake-google";
import { failOnPageErrors } from "./helpers";

// Login member Google end-to-end (V6+, Owner Nov 2026) terhadap Google palsu lokal: tombol → authorize (PKCE) → callback
// (ID token RS256 diverifikasi) → lengkapi profil → /member → buat PIN pertama → keluar → masuk dengan HP + PIN →
// masuk Google lagi langsung tanpa lengkapi profil (tanpa akun ganda).
test.describe.configure({ mode: "serial" });

test("Google OAuth penuh: daftar, buat PIN, login PIN, login Google ulang", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "server Google palsu satu port");
  test.setTimeout(240_000);
  const fake = startFakeGoogle();
  await fake.listen();
  try {
    const assertNoErrors = failOnPageErrors(page);
    fake.setNextIdentity({ sub: "e2e-oauth-1", email: "oauth.one@example.com", name: "Oauth Satu" });

    await page.goto("/member-login");
    const google = page.getByTestId("member-google-button");
    await expect(google).toBeVisible({ timeout: 90_000 });
    await google.click();
    await expect(page).toHaveURL(/mode=google-complete/, { timeout: 60_000 });
    expect(fake.calls).toEqual(expect.arrayContaining(["/authorize", "/token", "/jwks"]));

    const form = page.getByTestId("member-google-complete");
    await expect(form.getByText("oauth.one@example.com")).toBeVisible({ timeout: 30_000 });
    await form.getByLabel("Nomor WhatsApp").fill("081277700321");
    await form.getByRole("checkbox").first().check();
    await form.getByRole("button", { name: /Aktifkan Membership/ }).click();
    await expect(page).toHaveURL(/\/member(\?|$)/, { timeout: 60_000 });

    // Akun dari Google → buat PIN pertama tanpa PIN lama.
    await expect(page.getByTestId("member-needs-pin")).toBeVisible({ timeout: 60_000 });
    await page.getByLabel("Password baru", { exact: true }).fill("246810");
    await page.getByLabel("Konfirmasi password baru", { exact: true }).fill("246810");
    await page.getByRole("button", { name: "Buat PIN" }).click();
    await expect(page.getByTestId("member-needs-pin")).toBeHidden({ timeout: 30_000 });

    // Keluar → masuk dengan nomor HP + PIN baru.
    await page.getByRole("button", { name: /Logout/ }).click();
    await expect(page).toHaveURL(/\/member-login/, { timeout: 60_000 });
    await page.getByLabel("Email atau Nomor HP").fill("081277700321");
    await page.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await page.getByLabel("PIN / Password").fill("246810");
    await page.getByRole("button", { name: /^Masuk/ }).click();
    await expect(page).toHaveURL(/\/member(\?|$)/, { timeout: 60_000 });

    // Login Google lagi (identitas sama) → langsung masuk, tidak ada form lengkapi profil.
    await page.context().clearCookies();
    await page.goto("/member-login");
    await page.getByTestId("member-google-button").click();
    await expect(page).toHaveURL(/\/member(\?|$)/, { timeout: 60_000 });
    await expect(page.getByTestId("member-needs-pin")).toHaveCount(0);
    assertNoErrors();
  } finally {
    await fake.close();
  }
});
