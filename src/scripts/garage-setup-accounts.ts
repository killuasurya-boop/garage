// Skrip operator: samakan akun staf dengan 11 akun operasional go-live.
//
//   Owner 1 · Manajer 1 · Barista 2 · Waiter 3 · Koki 1 · Asisten Koki 1 ·
//   Helper Bar 1 · Helper Dapur 1  = 11 akun
//
// Pemetaan ke pondasi Garage OS (4 role aplikasi, tidak diubah):
//   Barista      → role Kasir, workstation "bar"          (POS + produksi BAR)
//   Koki         → role Kasir, workstation "dapur"        (produksi DAPUR)
//   Asisten Koki → role Kasir, workstation "dapur"
//   Helper Bar   → role Kasir, workstation "helper_bar"   (serah-terima BAR)
//   Helper Dapur → role Kasir, workstation "helper_dapur" (serah-terima DAPUR)
//
// Default DRY-RUN (hanya laporan). Tulis dengan --apply.
//   npx tsx src/scripts/garage-setup-accounts.ts
//   npx tsx src/scripts/garage-setup-accounts.ts --apply
//   npx tsx src/scripts/garage-setup-accounts.ts --apply --remove-others
//
// - Akun yang sudah ada (cocok email) hanya disamakan role/workstation/jabatan;
//   PASSWORD TIDAK DIUBAH.
// - Akun baru dibuat dengan password sementara acak (dicetak SEKALI di layar)
//   dan wajib ganti password saat login pertama.
// - Akun staf lain: hanya dilaporkan; dihapus bila --remove-others (sesi ikut
//   dihapus). Jalankan setelah garage-fresh-reset agar tidak ada transaksi
//   yang masih menunjuk akun tersebut.
// - Server Garage dengan PGlite harus MATI dulu (satu penulis).
import { randomInt } from "node:crypto";

import { config } from "dotenv";
import { asc, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb, getPgPool } from "@/db";
import { outlets, staffProfiles, user } from "@/db/schema";
import { createAdminUser, deleteAdminUser, updateAdminUser } from "@/lib/admin-user-service";
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
};

export const OPERATIONAL_ROSTER: RosterEntry[] = [
  { email: "owner@garage.id", name: "Owner Garage", role: "Owner", position: "Owner", division: "Management", workstation: null, deviceLabel: "OWNER" },
  { email: "manajer@garage.id", name: "Manajer Garage", role: "Manajer", position: "Manajer", division: "Management", workstation: null, deviceLabel: "MANAGER" },
  { email: "barista1@garage.id", name: "Barista 1", role: "Kasir", position: "Barista", division: "Bar", workstation: "bar", deviceLabel: "BAR-01" },
  { email: "barista2@garage.id", name: "Barista 2", role: "Kasir", position: "Barista", division: "Bar", workstation: "bar", deviceLabel: "BAR-02" },
  { email: "waiter1@garage.id", name: "Waiter 1", role: "Waiter", position: "Waiter", division: "Service", workstation: null, deviceLabel: "WAITER-01" },
  { email: "waiter2@garage.id", name: "Waiter 2", role: "Waiter", position: "Waiter", division: "Service", workstation: null, deviceLabel: "WAITER-02" },
  { email: "waiter3@garage.id", name: "Waiter 3", role: "Waiter", position: "Waiter", division: "Service", workstation: null, deviceLabel: "WAITER-03" },
  { email: "koki@garage.id", name: "Koki", role: "Kasir", position: "Koki", division: "Dapur", workstation: "dapur", deviceLabel: "DAPUR-01" },
  { email: "asisten.koki@garage.id", name: "Asisten Koki", role: "Kasir", position: "Asisten Koki", division: "Dapur", workstation: "dapur", deviceLabel: "DAPUR-02" },
  { email: "helper.bar@garage.id", name: "Helper Bar", role: "Kasir", position: "Helper Bar", division: "Bar", workstation: "helper_bar", deviceLabel: "BAR-HELPER" },
  { email: "helper.dapur@garage.id", name: "Helper Dapur", role: "Kasir", position: "Helper Dapur", division: "Dapur", workstation: "helper_dapur", deviceLabel: "DAPUR-HELPER" },
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
    })
    .from(user)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, user.id));
  const byEmail = new Map(existing.map((row) => [row.email.toLowerCase(), row]));
  const rosterEmails = new Set(OPERATIONAL_ROSTER.map((entry) => entry.email));

  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN (tambahkan --apply untuk menulis)"} · outlet ${outlet.code}`);
  console.log("\n== 11 akun operasional ==");
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
  console.log(`\n== Akun staf di luar daftar (${others.length}) ==`);
  for (const row of others) {
    console.log(`${removeOthers ? "HAPUS   " : "LAPOR   "} ${row.email} (${row.role}${row.workstation ? `/${row.workstation}` : ""}, ${row.status})`);
    if (apply && removeOthers) {
      await deleteAdminUser(row.id, OWNER_CONTEXT);
    }
  }
  if (others.length && !removeOthers) {
    console.log("   → tambahkan --remove-others untuk menghapus akun-akun ini.");
  }

  if (created.length) {
    console.log("\n== Password sementara (catat sekarang — tidak ditampilkan lagi; wajib ganti saat login pertama) ==");
    for (const row of created) console.log(`${row.email.padEnd(26)} ${row.password}`);
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
