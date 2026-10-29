import { expect, type Page } from "@playwright/test";

/** Password akun seed — dibuat acak per run oleh playwright.config.ts, tidak pernah disimpan. */
export function seedPassword() {
  const value = process.env.GARAGE_SEED_PASSWORD;
  if (!value) throw new Error("GARAGE_SEED_PASSWORD tidak ada — jalankan lewat `npm run test:e2e`.");
  return value;
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  // Mode pengembangan mengisi akun demo; fill() menimpa.
  await page.getByPlaceholder("nama@garage.id").fill(email);
  await page.getByPlaceholder("Masukkan password").fill(seedPassword());
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 90_000 });
}

/** Gagalkan tes bila halaman melempar error JavaScript yang tidak tertangani. */
export function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return () => expect(errors, `error JS di halaman:\n${errors.join("\n")}`).toEqual([]);
}

export function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}
