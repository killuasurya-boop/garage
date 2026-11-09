import { expect, test } from "@playwright/test";

import { failOnPageErrors, login } from "./helpers";

// Crystal V5 (Owner, Nov 2026): sidebar Garage OS — cari modul (Ctrl+K), grup accordion, izin modul tetap.
test("Sidebar crystal: Ctrl+K cari modul, accordion grup", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1366", "sidebar desktop");
  const assertNoErrors = failOnPageErrors(page);
  await login(page, "owner@garage.id");
  await page.goto("/os?module=dashboard");
  const expand = page.getByRole("button", { name: "Perluas navigasi" });
  await expect(expand).toBeVisible({ timeout: 90_000 });
  await expand.click();
  const search = page.getByTestId("module-nav-search").first();
  await expect(search).toBeVisible();
  if (process.env.CRYSTAL_SHOTS) await page.screenshot({ path: `${process.env.CRYSTAL_SHOTS}/sidebar.png` });
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await search.fill("approv");
  await expect(page.getByTestId("module-nav-search-results").first().locator('[data-module-nav-item="approvals"]')).toBeVisible();
  await search.press("Enter");
  await expect(page.locator('[data-module-nav-item="approvals"][aria-current="page"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(search).toHaveValue("");
  // Grup bisa dilipat (yang berisi modul aktif tetap terbuka).
  const head = page.getByRole("button", { name: /Pelanggan & Penjualan/ }).first();
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  assertNoErrors();
});
