/**
 * Hapus punch uji yang dibuat saat verifikasi (selfie dummy spesifik),
 * tanpa menyentuh punch asli. Jalankan saat dev server BERHENTI.
 *   npx tsx src/scripts/cleanup-test-punch.ts
 */
import fs from "node:fs";
import path from "node:path";

const TEST_PHOTO = "/uploads/attendance/2026-05-31-b67eae8d-52a7-4876-a5c5-2812b5b4a1d6.jpg";

async function main() {
  const { getDb, ensureDatabaseReady, getPgPool } = await import("../db/index");
  const { employeeAttendances } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  await ensureDatabaseReady();
  const db = await getDb();

  const deleted = await db
    .delete(employeeAttendances)
    .where(eq(employeeAttendances.photoUrl, TEST_PHOTO))
    .returning({ id: employeeAttendances.id });
  console.log(`Punch uji dihapus: ${deleted.length} baris`);

  const filePath = path.join(process.cwd(), "public", TEST_PHOTO);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("File selfie dummy dihapus.");
  } else {
    console.log("File selfie dummy sudah tidak ada.");
  }

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
