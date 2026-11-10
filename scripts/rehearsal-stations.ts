// Dipanggil HANYA oleh scripts/rehearsal-local.mjs: menyiapkan akun stasiun uji
// di DB gladi (kasir2 = Bar, waiter2 → Kasir stasiun Dapur). Menolak jalan bila
// database bukan PGlite di folder .rehearsal-data (tidak pernah menyentuh lokal/produksi).
import { eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db";
import { staffProfiles, user } from "@/db/schema";

async function main() {
  const dir = process.env.PGLITE_DATA_DIR ?? "";
  if (process.env.GARAGE_DB_DRIVER !== "pglite" || !dir.includes(".rehearsal-data") || process.env.DATABASE_URL) {
    throw new Error("rehearsal-stations: hanya untuk DB gladi .rehearsal-data (PGlite).");
  }
  await ensureDatabaseReady();
  const db = getDb();
  const accounts = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.email, ["kasir2@garage.id", "waiter2@garage.id"]));
  const idOf = (email: string) => accounts.find((row) => row.email === email)?.id;
  const bar = idOf("kasir2@garage.id");
  const dapur = idOf("waiter2@garage.id");
  if (!bar || !dapur) throw new Error("rehearsal-stations: akun seed kasir2/waiter2 tidak ditemukan.");
  await db.update(staffProfiles).set({ role: "Kasir", workstation: "bar" }).where(eq(staffProfiles.userId, bar));
  await db.update(staffProfiles).set({ role: "Kasir", workstation: "dapur" }).where(eq(staffProfiles.userId, dapur));
  console.log("[gladi] kasir2 = BAR, waiter2 = DAPUR");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
