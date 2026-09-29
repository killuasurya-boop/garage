// =============================================================================
// Server GLADI RESIK — port 3002, DB salinan (.tmp/gladi-db), build terpisah
// (.next-verify) supaya server & build asli (port 3001, .next) tidak tertimpa.
//
// Siapkan dulu:
//   npx tsx src/scripts/gladi-setup.ts
//   $env:NEXT_DIST_DIR=".next-verify"; npx next build
// Jalankan:
//   node scripts/gladi-server.mjs
//
// Tiap peran login di host berbeda supaya cookie sesi terpisah dalam satu
// browser: kasir.localhost:3002, bar.localhost:3002, dapur.localhost:3002,
// helper.localhost:3002, waiter.localhost:3002, dst.
// =============================================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath: path proyek mengandung spasi ("G A R A G E") — jangan pakai URL.pathname.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 3002;
const hosts = [
  "localhost",
  "127.0.0.1",
  "kasir.localhost",
  "bar.localhost",
  "dapur.localhost",
  "helper.localhost",
  "helper-dapur.localhost",
  "waiter.localhost",
  "waiter2.localhost",
  "manajer.localhost",
  "owner.localhost",
];

const gladiDb = path.join(root, ".tmp", "gladi-db");
const distDir = ".next-verify";

if (!fs.existsSync(gladiDb)) {
  console.error("Salinan DB gladi belum ada. Jalankan: npx tsx src/scripts/gladi-setup.ts");
  process.exit(1);
}
if (!fs.existsSync(path.join(root, distDir, "BUILD_ID"))) {
  console.error(`Build gladi belum ada. Jalankan: $env:NEXT_DIST_DIR="${distDir}"; npx next build`);
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: "production",
  GARAGE_DB_DRIVER: "pglite",
  PGLITE_DATA_DIR: gladiDb,
  NEXT_DIST_DIR: distDir,
  BETTER_AUTH_URL: `http://localhost:${port}`,
  GARAGE_PUBLIC_BASE_URL: `http://localhost:${port}`,
  GARAGE_TRUSTED_ORIGINS: hosts.map((host) => `http://${host}:${port}`).join(","),
};

console.log(`Server GLADI di http://localhost:${port} (DB: ${gladiDb})`);
const child = spawn(
  process.execPath,
  [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "0.0.0.0"],
  { cwd: root, env, stdio: "inherit" },
);
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
