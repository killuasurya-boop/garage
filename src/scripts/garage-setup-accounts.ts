// Skrip operator: samakan akun staf dengan 13 akun operasional go-live.
// SATU AKUN per orang: akun login yang sama dipakai untuk absen (kode + PIN),
// gaji harian, fee pool, dan fee produksi — tidak ada lagi akun absen terpisah.
//
//   Owner 1 · Manajer 1 · Kasir 2 · Barista 2 · Waiter 3 · Koki 1 ·
//   Asisten Koki 1 · Helper Bar 1 · Helper Dapur 1  = 13 akun
//
// Pemetaan ke pondasi Garage OS (4 role aplikasi, tidak diubah):
//   Kasir        → role Kasir, tanpa workstation            (POS + tutup shift)
//   Barista      → role Kasir, workstation "bar"            (POS + produksi BAR)
//   Koki         → role Kasir, workstation "dapur"          (produksi DAPUR)
//   Asisten Koki → role Kasir, workstation "dapur"
//   Helper Bar   → role Kasir, workstation "helper_bar"     (serah-terima BAR)
//   Helper Dapur → role Kasir, workstation "helper_dapur"   (serah-terima DAPUR)
// Semua kecuali Owner mendapat kode absen (KSR1, BAR1, WTR1, …) + PIN absen.
//
// Default DRY-RUN (hanya laporan). Tulis dengan --apply.
//   npx tsx src/scripts/garage-setup-accounts.ts
//   npx tsx src/scripts/garage-setup-accounts.ts --apply
//   npx tsx src/scripts/garage-setup-accounts.ts --apply --remove-others
//
// - Akun yang sudah ada (cocok email) hanya disamakan; PASSWORD & PIN lama TIDAK diubah.
// - Akun baru: password sementara acak (wajib ganti saat login pertama) dan PIN
//   absen acak — keduanya dicetak SEKALI di layar.
// - --remove-others menghapus akun staf di luar daftar, TERMASUK akun absen lama
//   yang terpisah (@absen.garage.local). Tidak pernah dihapus: akun Owner dan
//   akun sistem bot (@internal.garage). Jalankan setelah reset-grand-opening.
// - Gaji per akun diisi Owner di Payroll → Karyawan (nilai awal 0).
// - Server Garage dengan PGlite harus MATI dulu (satu penulis).
import { randomInt } from "node:crypto";

import { config } from "dotenv";
import { asc, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";
import { outlets, staffProfiles, staffWageConfig, user } from "@/db/schema";
import { createAdminUser, deleteAdminUser, updateAdminUser } from "@/lib/admin-user-service";
import { ensureAbsenIdentity } from "@/lib/garage-absen-employees";
import type { Role } from "@/lib/garage-data";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const apply = process.argv.includes("--apply");
const removeOthers = process.argv.includes("--remove-others");

type RosterEntry = {
  email: string;
  name: string;
  role: Role;
  position: string;
  division: string;
  workstation: string | null;
  deviceLabel: string;
  /** Kode absen; null = tidak absen (Owner). */
  absenCode: string | null;
};

export const OPERATIONAL_ROSTER: RosterEntry[] = [
  { email: "owner@garage.id", name: "Owner Garage", role: "Owner", position: "Owner", division: "Management", workstation: null, deviceLabel: "OWNER", absenCode: null },
  { email: "manajer@garage.id", name: "Manajer Garage", role: "Manajer", position: "Manajer", division: "Management", workstation: null, deviceLabel: "MANAGER", absenCode: "MGR" },
  { email: "kasir1@garage.id", name: "Kasir 1", role: "Kasir", position: "Kasir", division: "Kasir", workstation: null, deviceLabel: "KASIR-01", absenCode: "KSR1" },
  { email: "kasir2@garage.id", name: "Kasir 2", role: "Kasir", position: "Kasir", division: "Kasir", workstation: null, deviceLabel: "KASIR-02", absenCode: "KSR2" },
  { email: "barista1@garage.id", name: "Barista 1", role: "Kasir", position: "Barista", division: "Bar", workstation: "bar", deviceLabel: "BAR-01", absenCode: "BAR1" },
  { email: "barista2@garage.id", name: "Barista 2", role: "Kasir", position: "Barista", division: "Bar", workstation: "bar", deviceLabel: "BAR-02", absenCode: "BAR2" },
  { email: "waiter1@garage.id", name: "Waiter 1", role: "Waiter", position: "Waiter", division: "Service", workstation: null, deviceLabel: "WAITER-01", absenCode: "WTR1" },
  { email: "waiter2@garage.id", name: "Waiter 2", role: "Waiter", position: "Waiter", division: "Service", workstation: null, deviceLabel: "WAITER-02", absenCode: "WTR2" },
  { email: "waiter3@garage.id", name: "Waiter 3", role: "Waiter", position: "Waiter", division: "Service", workstation: null, deviceLabel: "WAITER-03", absenCode: "WTR3" },
  { email: "koki@garage.id", name: "Koki", role: "Kasir", position: "Koki", division: "Dapur", workstation: "dapur", deviceLabel: "DAPUR-01", absenCode: "KOKI" },
  { email: "asisten.koki@garage.id", name: "Asisten Koki", role: "Kasir", position: "Asisten Koki", division: "Dapur", workstation: "dapur", deviceLabel: "DAPUR-02", absenCode: "AKOKI" },
  { email: "helper.bar@garage.id", name: "Helper Bar", role: "Kasir", position: "Helper Bar", division: "Bar", workstation: "helper_bar", deviceLabel: "BAR-HELPER", absenCode: "HBAR" },
  { email: "helper.dapur@garage.id", name: "Helper Dapur", role: "Kasir", position: "Helper Dapur", division: "Dapur", workstation: "helper_dapur", deviceLabel: "DAPUR-HELPER", absenCode: "HDPR" },
];

const OWNER_CONTEXT = { actorUserId: "system", actorName: "garage-setup-accounts", actorRole: "Owner" as Role };

function tempPassword() {
  // Tanpa karakter mirip (0/O, 1/l/I) agar mudah diketik dari layar.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

async function main() {
  await ensureDatabaseReady();
  const db = getDb();

  const [outlet] = await db
    .select({ id: outlets.id, code: outlets.code })
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(asc(outlets.code))
    .limit(1);
  if (!outlet) throw new Error("Outlet aktif tidak ditemukan.");

  const existing = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: staffProfiles.role,
      workstation: staffProfiles.workstation,
      status: staffProfiles.status,
      absenCode: staffWageConfig.absenCode,
    })
    .from(user)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, user.id))
    .leftJoin(staffWageConfig, eq(staffWageConfig.staffUserId, user.id));
  const byEmail = new Map(existing.map((row) => [row.email.toLowerCase(), row]));
  const rosterEmails = new Set(OPERATIONAL_ROSTER.map((entry) => entry.email));

  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN (tambahkan --apply untuk menulis)"} · outlet ${outlet.code}`);
  console.log(`\n== ${OPERATIONAL_ROSTER.length} akun operasional (login = absen = gaji = fee) ==`);
  const created: Array<{ email: string; password: string }> = [];
  for (const entry of OPERATIONAL_ROSTER) {
    const current = byEmail.get(entry.email);
    if (current) {
      const same =
        current.role === entry.role &&
        (current.workstation ?? null) === entry.workstation &&
        current.status === "active";
      console.log(`${same ? "OK      " : "SAMAKAN "} ${entry.email} → ${entry.position} (${entry.role}${entry.workstation ? `/${entry.workstation}` : ""})`);
      if (apply && !same) {
        const result = await updateAdminUser(
          current.id,
          { role: entry.role, workstation: entry.workstation, position: entry.position, division: entry.division, status: "active" },
          OWNER_CONTEXT,
        );
        if ("error" in result) throw new Error(`Gagal menyamakan ${entry.email}: ${result.error}`);
      }
      continue;
    }
    console.log(`BUAT     ${entry.email} → ${entry.position} (${entry.role}${entry.workstation ? `/${entry.workstation}` : ""})`);
    if (!apply) continue;
    const password = tempPassword();
    const result = await createAdminUser(
      {
        email: entry.email,
        name: entry.name,
        password,
        role: entry.role,
        outletId: outlet.id,
        deviceLabel: entry.deviceLabel,
        division: entry.division,
        position: entry.position,
        workstation: entry.workstation,
        requirePasswordChange: true,
      },
      OWNER_CONTEXT,
    );
    if ("error" in result) throw new Error(`Gagal membuat ${entry.email}: ${result.error}`);
    created.push({ email: entry.email, password });
  }

  const others = existing.filter((row) => !rosterEmails.has(row.email.toLowerCase()) && row.role);
  // Tidak pernah dihapus otomatis: akun Owner (bisa jadi login Owner asli) dan
  // akun sistem bot. Akun absen terpisah lama (@absen.garage.local) DIHAPUS bila
  // --remove-others: absen kini memakai akun login masing-masing.
  const isSystem = (email: string) => email.toLowerCase().endsWith("@internal.garage"); // bot chat & AI, bukan login staf
  const isProtected = (row: (typeof others)[number]) => row.role === "Owner" || isSystem(row.email);
  console.log(`\n== Akun staf di luar daftar (${others.length}) ==`);
  for (const row of others) {
    const label = `${row.email} (${row.role}${row.workstation ? `/${row.workstation}` : ""}, ${row.status})`;
    if (isProtected(row)) {
      const why = isSystem(row.email) ? "akun sistem (bot), bukan login staf" : "akun Owner, hapus manual bila perlu";
      console.log(`SIMPAN   ${label} — ${why}`);
      continue;
    }
    const legacy = row.email.toLowerCase().endsWith("@absen.garage.local") ? ` — akun absen lama ${row.absenCode ?? ""}`.trimEnd() : "";
    console.log(`${removeOthers ? "HAPUS   " : "LAPOR   "} ${label}${legacy}`);
    if (apply && removeOthers) {
      await deleteAdminUser(row.id, OWNER_CONTEXT);
    }
  }
  if (others.length && !removeOthers) {
    console.log("   → tambahkan --remove-others untuk menghapus akun-akun ini.");
  }

  // Absen di akun login: kode absen + PIN (setelah akun lama dihapus, agar kode
  // seperti BAR1 yang dulu dipakai akun absen terpisah bisa dipakai akun login).
  console.log("\n== Absen di akun login (kode absen) ==");
  const newPins: Array<{ email: string; code: string; pin: string }> = [];
  for (const entry of OPERATIONAL_ROSTER) {
    if (!entry.absenCode) {
      console.log(`-        ${entry.email} — tidak absen (Owner)`);
      continue;
    }
    if (!apply) {
      console.log(`ABSEN    ${entry.email} → kode ${entry.absenCode}`);
      continue;
    }
    const [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, entry.email)).limit(1);
    if (!account) continue;
    let result;
    try {
      result = await ensureAbsenIdentity(account.id, {
        code: entry.absenCode,
        position: entry.position,
        role: entry.role,
        excludeFromFee: entry.role === "Manajer",
      });
    } catch (error) {
      // Kode dipakai akun absen lama yang tidak dihapus (tanpa --remove-others).
      console.log(`ABSEN!   ${entry.email} → kode ${entry.absenCode} dipakai akun lain (${error instanceof Error ? error.message : error}); pakai --remove-others`);
      continue;
    }
    console.log(`ABSEN    ${entry.email} → kode ${result.code}${result.created ? " (baru)" : ""}`);
    if (result.pin) newPins.push({ email: entry.email, code: result.code, pin: result.pin });
  }

  if (created.length) {
    console.log("\n== Password sementara (catat sekarang — tidak ditampilkan lagi; wajib ganti saat login pertama) ==");
    for (const row of created) console.log(`${row.email.padEnd(26)} ${row.password}`);
  }
  if (newPins.length) {
    console.log("\n== PIN absen baru (catat sekarang — tidak ditampilkan lagi) ==");
    for (const row of newPins) console.log(`${row.email.padEnd(26)} kode ${row.code.padEnd(6)} PIN ${row.pin}`);
  }
  if (apply) {
    console.log("\nGaji per akun: isi di Payroll → Karyawan (nilai awal Rp0 untuk akun baru).");
  }

  if (apply) {
    const after = await db
      .select({ email: user.email, role: staffProfiles.role, workstation: staffProfiles.workstation })
      .from(user)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, user.id));
    console.log(`\nTotal akun staf sekarang: ${after.length}`);
  }
}

main()
  .catch((error) => {
    console.error("ERR:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const client = getPgPool();
      if ("end" in client && typeof client.end === "function") await client.end();
    } catch {
      // PGlite / belum terhubung — abaikan.
    }
  });
