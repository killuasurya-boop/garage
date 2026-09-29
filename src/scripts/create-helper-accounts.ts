// Skrip operator: buat akun login Helper BAR & Helper DAPUR (Production Hub).
// Helper = role Kasir dengan workstation helper_bar / helper_dapur: hanya ACC
// serah-terima & memanggil waiter, TIDAK bisa MULAI/READY produksi.
//
// Idempoten: bila email sudah ada, hanya workstation/role yang disamakan
// (password tidak diubah — pakai set-staff-password.ts untuk itu).
//
// Pakai (server Garage harus MATI dulu — PGlite satu penulis):
//   HELPER_PASSWORD=<password awal> npx tsx src/scripts/create-helper-accounts.ts
// Atau password beda per akun:
//   HELPER_BAR_PASSWORD=... HELPER_DAPUR_PASSWORD=... npx tsx src/scripts/create-helper-accounts.ts
//
// Catatan: TIDAK menerima password sebagai literal kode — hanya runtime.
// Helper wajib ganti password saat login pertama.
import { asc, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db";
import { outlets, user } from "@/db/schema";
import { createAdminUser, updateAdminUser } from "@/lib/admin-user-service";

const HELPERS = [
  {
    email: "helper.bar@garage.id",
    name: "Helper Bar",
    deviceLabel: "BAR-HELPER",
    workstation: "helper_bar",
    passwordEnv: "HELPER_BAR_PASSWORD",
  },
  {
    email: "helper.dapur@garage.id",
    name: "Helper Dapur",
    deviceLabel: "DAPUR-HELPER",
    workstation: "helper_dapur",
    passwordEnv: "HELPER_DAPUR_PASSWORD",
  },
] as const;

async function main() {
  await ensureDatabaseReady();
  const db = getDb();

  const [outlet] = await db
    .select({ id: outlets.id, code: outlets.code })
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(asc(outlets.code))
    .limit(1);
  if (!outlet) {
    console.error("Outlet aktif tidak ditemukan.");
    process.exit(3);
  }

  for (const helper of HELPERS) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, helper.email))
      .limit(1);

    if (existing) {
      const result = await updateAdminUser(existing.id, {
        role: "Kasir",
        workstation: helper.workstation,
        deviceLabel: helper.deviceLabel,
      });
      if ("error" in result) {
        console.error(`GAGAL update ${helper.email}: ${result.error}`);
        process.exit(1);
      }
      console.log(`SUDAH ADA: ${helper.email} → workstation ${helper.workstation} (password tidak diubah).`);
      continue;
    }

    const password = process.env[helper.passwordEnv] ?? process.env.HELPER_PASSWORD ?? "";
    if (password.length < 8) {
      console.error(
        `Password untuk ${helper.email} belum diisi / kurang dari 8 karakter. ` +
          `Set HELPER_PASSWORD atau ${helper.passwordEnv}.`,
      );
      process.exit(2);
    }

    const result = await createAdminUser({
      email: helper.email,
      name: helper.name,
      password,
      role: "Kasir",
      outletId: outlet.id,
      shiftLabel: "Shift aktif",
      deviceLabel: helper.deviceLabel,
      division: "Production",
      position: helper.name,
      workstation: helper.workstation,
      requirePasswordChange: true,
    });
    if ("error" in result) {
      console.error(`GAGAL buat ${helper.email}: ${result.error}`);
      process.exit(1);
    }
    console.log(`DIBUAT: ${helper.email} (${helper.name}) outlet ${outlet.code}, workstation ${helper.workstation}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERR:", e?.message || e);
    process.exit(1);
  });
