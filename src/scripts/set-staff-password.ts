// Skrip operator (server-side) untuk set ulang password akun staf.
// Pakai saat akun terkunci karena password lupa (mis. owner) dan UI reset
// tidak mengizinkan (hirarki role). Hanya jalan di lingkungan server dgn
// akses DB langsung — bukan endpoint publik.
//
// Pakai:
//   STAFF_EMAIL=owner@garage.local STAFF_PASSWORD=passbaru \
//     npx tsx src/scripts/set-staff-password.ts
//
// Atau via argv:
//   npx tsx src/scripts/set-staff-password.ts owner@garage.local passbaru
//
// Catatan: TIDAK menerima password sebagai literal kode — hanya runtime.
import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db";
import { account, session as sessionTable, staffProfiles, user } from "@/db/schema";
import { auth } from "@/lib/auth";

async function main() {
  await ensureDatabaseReady();
  const db = getDb();

  const email = (process.env.STAFF_EMAIL ?? process.argv[2] ?? "").trim().toLowerCase();
  const newPassword = process.env.STAFF_PASSWORD ?? process.argv[3] ?? "";

  if (!email || !newPassword) {
    console.error("Pakai: STAFF_EMAIL=<email> STAFF_PASSWORD=<password> npx tsx src/scripts/set-staff-password.ts");
    process.exit(2);
  }
  if (newPassword.length < 8) {
    console.error("Password minimal 8 karakter.");
    process.exit(2);
  }

  const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!u) {
    console.error(`User ${email} tidak ditemukan.`);
    process.exit(3);
  }

  const [cred] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")))
    .limit(1);
  if (!cred) {
    console.error(`Akun credential tidak ada untuk ${email}.`);
    process.exit(4);
  }

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);
  await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(eq(account.id, cred.id));

  // Invalidate semua sesi & paksa user login ulang.
  await db.delete(sessionTable).where(eq(sessionTable.userId, u.id));
  await db
    .update(staffProfiles)
    .set({ passwordResetRequired: false, updatedAt: new Date() })
    .where(eq(staffProfiles.userId, u.id));

  console.log(`OK: password ${email} ter-set ulang. Semua sesi dihapus.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERR:", e?.message || e);
    process.exit(1);
  });
