/**
 * Set PIN uji ke satu staff aktif (hash pakai pepper dari .env.local agar
 * cocok dengan verifikasi Next.js). Jalankan saat dev server BERHENTI.
 *   npx tsx src/scripts/set-test-pin.ts [PIN] [namaStaffOpsional]
 */
import fs from "node:fs";
import path from "node:path";

// Muat ATTENDANCE_PIN_PEPPER dari .env.local SEBELUM import lib (hashPin
// membaca pepper saat module load).
function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const pin = process.argv[2] ?? "4729";
  const nameFilter = process.argv[3];

  const { getDb, ensureDatabaseReady, getPgPool } = await import("../db/index");
  const { staffProfiles, user } = await import("../db/schema");
  const { hashPin } = await import("../lib/attendance");
  const { eq } = await import("drizzle-orm");

  await ensureDatabaseReady();
  const db = await getDb();

  const staff = await db
    .select({ id: staffProfiles.id, name: user.name, role: staffProfiles.role })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(eq(staffProfiles.status, "active"))
    .then((rows) => (nameFilter ? rows.find((r) => r.name?.toLowerCase().includes(nameFilter.toLowerCase())) : rows[0]));

  if (!staff) {
    console.error("Tidak ada staff aktif yang cocok.");
    process.exit(1);
  }

  await db
    .update(staffProfiles)
    .set({ pinHash: hashPin(pin), pinCode: null })
    .where(eq(staffProfiles.id, staff.id));

  console.log(`PIN ${pin} diset untuk: ${staff.name} (${staff.role})`);
  console.log(`Pepper terpakai: ${process.env.ATTENDANCE_PIN_PEPPER ? "dari .env.local" : "FALLBACK (tidak cocok dgn Next!)"}`);

  const pool = getPgPool();
  if (typeof (pool as { end?: () => Promise<void> }).end === "function") {
    await (pool as { end: () => Promise<void> }).end();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
