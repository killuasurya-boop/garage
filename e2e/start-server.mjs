// =============================================================================
// Server khusus E2E (audit #8): PGlite BARU per run → migrasi → seed → next dev :3101.
// Tidak pernah menyentuh DB lokal (.pglite-data) atau produksi. Dipanggil oleh
// playwright.config.ts (webServer); env (password seed acak, URL) diwariskan dari sana.
// =============================================================================
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath: path repo boleh mengandung spasi (mis. "G A R A G E" → %20 di URL).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".e2e-data");
const port = process.env.E2E_PORT ?? "3101";

if (!process.env.GARAGE_SEED_PASSWORD) {
  console.error("[e2e] GARAGE_SEED_PASSWORD wajib (dibuat acak oleh playwright.config.ts).");
  process.exit(1);
}

fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(path.join(dataDir, "pglite"), { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: "development",
  GARAGE_DB_DRIVER: "pglite",
  PGLITE_DATA_DIR: path.join(dataDir, "pglite"),
  GARAGE_STORAGE_BASE_DIR: dataDir,
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
  BETTER_AUTH_SECRET: process.env.E2E_AUTH_SECRET,
  GARAGE_MEMBER_SEED_PASSWORD: process.env.GARAGE_SEED_PASSWORD,
  GARAGE_POS_API_KEY: `e2e-${process.env.E2E_AUTH_SECRET?.slice(0, 12)}`,
  NEXT_TELEMETRY_DISABLED: "1",
  // Matikan MCP dev Next (log browser ke file .next/dev/logs memicu rebuild) — lihat next.config.ts.
  // Catatan: loop reload /login masih bisa muncul sesekali; ulangi E2E (docs/smart-approval-v3/06-TESTING.md).
  GARAGE_E2E_SERVER: "1",
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
for (const [label, script] of [
  ["migrasi", "src/db/migrate.ts"],
  ["seed", "src/db/seed.ts"],
]) {
  console.log(`[e2e] ${label}…`);
  const r = spawnSync(npx, ["tsx", script], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`[e2e] ${label} gagal (exit ${r.status}).`);
    process.exit(1);
  }
}

console.log(`[e2e] next dev :${port}`);
const server = spawn(npx, ["next", "dev", "-p", port, "-H", "127.0.0.1"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
