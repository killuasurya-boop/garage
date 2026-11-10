// =============================================================================
// Gladi lokal tanpa staging (Smart Notification V2): PGlite BARU di .rehearsal-data
// → migrasi → seed → stasiun uji → next dev 127.0.0.1:3102.
// TIDAK PERNAH menyentuh DB lokal (.pglite-data) maupun produksi. Folder
// .rehearsal-data dihapus & dibuat ulang tiap run (hanya data uji).
// Password akun uji dibuat acak dan ditulis ke .rehearsal-data/LOGIN.txt
// (tidak dicetak ke log).
//
//   node scripts/rehearsal-local.mjs
//
// Akun: owner@ / manajer@ / kasir@ (kasir depan) / kasir2@ (BAR) /
//       waiter2@ (DAPUR, diubah jadi Kasir stasiun dapur) / waiter@ (waiter) — @garage.id
// =============================================================================
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".rehearsal-data");
const port = process.env.REHEARSAL_PORT ?? "3102";
const password = `gladi-${crypto.randomBytes(6).toString("base64url")}`;

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
  BETTER_AUTH_SECRET: crypto.randomBytes(32).toString("hex"),
  GARAGE_SEED_PASSWORD: password,
  GARAGE_MEMBER_SEED_PASSWORD: password,
  GARAGE_POS_API_KEY: `gladi-${crypto.randomBytes(8).toString("hex")}`,
  NEXT_TELEMETRY_DISABLED: "1",
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
function run(label, args) {
  console.log(`[gladi] ${label}…`);
  const r = spawnSync(npx, args, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`[gladi] ${label} gagal (exit ${r.status}).`);
    process.exit(1);
  }
}

run("migrasi", ["tsx", "src/db/migrate.ts"]);
run("seed", ["tsx", "src/db/seed.ts"]);
run("stasiun uji", ["tsx", "scripts/rehearsal-stations.ts"]);

fs.writeFileSync(
  path.join(dataDir, "LOGIN.txt"),
  [
    `Gladi lokal: http://127.0.0.1:${port}/pos-login`,
    `Password semua akun uji: ${password}`,
    "owner@garage.id · manajer@garage.id · kasir@garage.id (kasir depan)",
    "kasir2@garage.id (BAR) · waiter2@garage.id (DAPUR) · waiter@garage.id (waiter)",
    "Data uji saja — dihapus saat gladi dijalankan ulang.",
    "",
  ].join("\n"),
);
console.log(`[gladi] Akun & password uji: ${path.join(dataDir, "LOGIN.txt")}`);

console.log(`[gladi] next dev :${port}`);
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
