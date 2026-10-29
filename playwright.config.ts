import crypto from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

// =============================================================================
// E2E 5 alur kritis (audit #8). Jalankan: npm run test:e2e
// - DB PGlite baru per run (e2e/start-server.mjs); password akun seed acak per run, hanya di memori.
// - Lokal memakai Chrome terpasang (tanpa unduh browser); CI: E2E_BROWSER_CHANNEL="" + `npx playwright install chromium`.
// =============================================================================
const port = process.env.E2E_PORT ?? "3101";
process.env.GARAGE_SEED_PASSWORD ??= `e2e-${crypto.randomBytes(9).toString("base64url")}`;
process.env.E2E_AUTH_SECRET ??= crypto.randomBytes(32).toString("hex");
const channel = process.env.E2E_BROWSER_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  // Satu DB untuk semua alur, berurutan (shift kasir dipakai alur berikutnya).
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: ".e2e-data/report" }]],
  outputDir: ".e2e-data/results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: channel || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
  },
  projects: [
    { name: "desktop-1366", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "mobile-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, grep: /@mobile/ },
  ],
  webServer: {
    command: "node e2e/start-server.mjs",
    url: `http://127.0.0.1:${port}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
