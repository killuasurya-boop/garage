// =============================================================================
// GLADI RESIK — siapkan lingkungan uji terpisah dari DB asli.
//   1. Salin .pglite-data → .tmp/gladi-db (DB asli TIDAK disentuh).
//   2. Jalankan migrasi di salinan.
//   3. Buat akun uji per peran (hanya di salinan) dengan password & PIN acak.
//   4. Tulis kredensial ke .tmp/gladi-accounts.json (di-gitignore).
//
// Pakai (server asli port 3001 sebaiknya mati supaya salinan konsisten):
//   npx tsx src/scripts/gladi-setup.ts
// Lalu jalankan server gladi: node scripts/gladi-server.mjs  (port 3002)
// =============================================================================
import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { config as loadEnv } from "dotenv";

// Env yang sama dengan server (mis. ATTENDANCE_PIN_PEPPER untuk hash PIN) —
// tanpa ini PIN manajer gladi di-hash dengan pepper berbeda dan ditolak server.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const ROOT = process.cwd();
const SOURCE_DB = path.join(ROOT, ".pglite-data");
const GLADI_DIR = path.join(ROOT, ".tmp");
const GLADI_DB = path.join(GLADI_DIR, "gladi-db");
const ACCOUNTS_FILE = path.join(GLADI_DIR, "gladi-accounts.json");

export const GLADI_ACCOUNTS = [
  { key: "kasir", email: "gladi.kasir@garage.id", name: "Gladi Kasir", role: "Kasir", workstation: null, host: "kasir" },
  { key: "bar", email: "gladi.bar@garage.id", name: "Gladi Barista", role: "Kasir", workstation: "bar", host: "bar" },
  { key: "dapur", email: "gladi.dapur@garage.id", name: "Gladi Koki", role: "Kasir", workstation: "dapur", host: "dapur" },
  { key: "helperBar", email: "gladi.helper.bar@garage.id", name: "Gladi Helper Bar", role: "Kasir", workstation: "helper_bar", host: "helper" },
  { key: "helperDapur", email: "gladi.helper.dapur@garage.id", name: "Gladi Helper Dapur", role: "Kasir", workstation: "helper_dapur", host: "helper-dapur" },
  { key: "waiter1", email: "gladi.waiter1@garage.id", name: "Gladi Waiter Satu", role: "Waiter", workstation: null, host: "waiter" },
  { key: "waiter2", email: "gladi.waiter2@garage.id", name: "Gladi Waiter Dua", role: "Waiter", workstation: null, host: "waiter2" },
  { key: "manajer", email: "gladi.manajer@garage.id", name: "Gladi Manajer", role: "Manajer", workstation: null, host: "manajer" },
  // UAT Owner (QA-audit): laporan, pengaturan, manajemen user.
  { key: "owner", email: "gladi.owner@garage.id", name: "Gladi Owner", role: "Owner", workstation: null, host: "owner" },
] as const;

function portInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function randomPassword() {
  return randomBytes(12).toString("base64url");
}

// PIN approval 6 digit, bukan angka kembar/berurutan (lihat pin-rules).
function randomPin() {
  for (;;) {
    const pin = String(randomInt(100000, 999999));
    if (!/^(\d)\1+$/.test(pin) && !"0123456789".includes(pin) && !"9876543210".includes(pin)) {
      return pin;
    }
  }
}

async function main() {
  if (!fs.existsSync(SOURCE_DB)) {
    throw new Error(".pglite-data tidak ditemukan.");
  }
  if (await portInUse(3002)) {
    throw new Error("Port 3002 masih dipakai (server gladi lama?). Matikan dulu.");
  }
  if ((await portInUse(3001)) && !process.argv.includes("--allow-live")) {
    throw new Error(
      "Server asli di port 3001 masih jalan — salinan DB bisa tidak konsisten. " +
        "Matikan dulu, atau tambah --allow-live bila yakin tidak ada transaksi berjalan.",
    );
  }

  // 1. Salinan DB baru (selalu fresh supaya gladi berulang mulai dari kondisi sama).
  fs.mkdirSync(GLADI_DIR, { recursive: true });
  fs.rmSync(GLADI_DB, { recursive: true, force: true });
  fs.cpSync(SOURCE_DB, GLADI_DB, { recursive: true });
  fs.rmSync(path.join(GLADI_DB, "postmaster.pid"), { force: true });
  console.log(`Salinan DB: ${GLADI_DB}`);

  const env = { ...process.env, GARAGE_DB_DRIVER: "pglite", PGLITE_DATA_DIR: GLADI_DB };

  // 2. Migrasi di salinan (proses terpisah, env menunjuk salinan).
  const migrate = spawnSync(process.execPath, [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), "src/db/migrate.ts"], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (migrate.status !== 0) {
    throw new Error("Migrasi salinan DB gagal.");
  }

  // 3. Akun uji — env diset SEBELUM modul DB diimpor.
  process.env.GARAGE_DB_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = GLADI_DB;
  const { ensureDatabaseReady, getDb, getPgPool } = await import("@/db");
  const { outlets, user } = await import("@/db/schema");
  const { asc, eq } = await import("drizzle-orm");
  const { createAdminUser, setStaffPin } = await import("@/lib/admin-user-service");

  await ensureDatabaseReady();
  const db = getDb();
  const [outlet] = await db
    .select({ id: outlets.id, code: outlets.code })
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(asc(outlets.code))
    .limit(1);
  if (!outlet) throw new Error("Outlet aktif tidak ditemukan di salinan DB.");

  const accounts: Record<string, { email: string; password: string; name: string; role: string; host: string; userId: string }> = {};
  for (const account of GLADI_ACCOUNTS) {
    const password = randomPassword();
    const created = await createAdminUser({
      email: account.email,
      name: account.name,
      password,
      role: account.role,
      outletId: outlet.id,
      deviceLabel: `GLADI-${account.key.toUpperCase()}`,
      division: "Gladi",
      position: account.name,
      workstation: account.workstation,
      requirePasswordChange: false,
    });
    if ("error" in created) {
      throw new Error(`Gagal buat ${account.email}: ${created.error}`);
    }
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.email)).limit(1);
    accounts[account.key] = {
      email: account.email,
      password,
      name: account.name,
      role: account.role,
      host: `http://${account.host}.localhost:3002`,
      userId: row.id,
    };
    console.log(`Akun gladi: ${account.email} (${account.role}${account.workstation ? `, ${account.workstation}` : ""})`);
  }

  // Shift kas yang masih terbuka di DB asli ikut tersalin; aturan aplikasi hanya
  // mengizinkan satu shift terbuka per outlet. Tutup di SALINAN saja supaya
  // kasir gladi bisa membuka shift sendiri.
  const { sql } = await import("drizzle-orm");
  const closedShifts = await db.execute(sql`
    UPDATE cash_sessions
    SET status = 'closed', closed_at = now(), actual_cash = expected_cash,
        closing_note = 'Ditutup otomatis oleh gladi-setup (salinan DB gladi)'
    WHERE status = 'open'
    RETURNING code
  `);
  const closedCodes = ((closedShifts as { rows?: Array<Record<string, unknown>> }).rows ?? []).map(
    (row) => String(row.code),
  );
  if (closedCodes.length) {
    console.log(`Shift terbuka di salinan ditutup: ${closedCodes.join(", ")}`);
  }

  const managerPin = randomPin();
  const pinResult = await setStaffPin(accounts.manajer.userId, managerPin);
  if ("error" in pinResult) throw new Error(`PIN manajer gagal: ${pinResult.error}`);

  fs.writeFileSync(
    ACCOUNTS_FILE,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        baseUrl: "http://localhost:3002",
        outlet: outlet.code,
        managerPin,
        accounts,
      },
      null,
      2,
    ),
  );
  console.log(`Kredensial gladi ditulis ke ${ACCOUNTS_FILE} (jangan dibagikan).`);

  const client = getPgPool() as { close?: () => Promise<void>; end?: () => Promise<void> };
  await (client.close?.() ?? client.end?.());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("GAGAL:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
