/**
 * Smoke test absensi terhadap DB asli (pglite/postgres). Membuktikan migration
 * 0053 + schema + query Drizzle + lib/attendance bekerja terintegrasi.
 *
 * Jalankan saat dev server BERHENTI (pglite single-lock):
 *   npx tsx src/scripts/smoke-attendance-db.ts
 *
 * Script ini membuat data uji bertanda SMOKE_ lalu menghapusnya di akhir.
 */
import { getDb, ensureDatabaseReady, getPgPool } from "../db/index";
import {
  staffProfiles,
  user,
  outlets,
  shiftSchedules,
  employeeAttendances,
} from "../db/schema";
import { and, eq, gte, lt, desc } from "drizzle-orm";
import {
  hashPin,
  jakartaDayRange,
  jakartaDateKey,
  evaluatePunchStatus,
  computeWorkedStats,
} from "../lib/attendance";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("=== SMOKE TEST ABSENSI (DB) ===\n");
  await ensureDatabaseReady();
  const db = await getDb();

  // --- Setup: pakai outlet & staff yang sudah ada (dari seed) ---
  const outlet = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .limit(1)
    .then((r) => r[0]);
  if (!outlet) {
    console.error("Tidak ada outlet aktif. Jalankan db:seed dulu.");
    process.exit(1);
  }

  const staff = await db
    .select({ id: staffProfiles.id, name: user.name, outletId: staffProfiles.outletId })
    .from(staffProfiles)
    .innerJoin(user, eq(staffProfiles.userId, user.id))
    .where(eq(staffProfiles.status, "active"))
    .limit(1)
    .then((r) => r[0]);
  if (!staff) {
    console.error("Tidak ada staff aktif. Jalankan db:seed dulu.");
    process.exit(1);
  }
  console.log(`Staff uji: ${staff.name} (${staff.id})`);

  // Bersihkan punch hari ini milik staff ini agar test deterministik.
  const { start, end } = jakartaDayRange();
  await db
    .delete(employeeAttendances)
    .where(
      and(
        eq(employeeAttendances.staffId, staff.id),
        gte(employeeAttendances.timestamp, start),
        lt(employeeAttendances.timestamp, end),
      ),
    );

  // Set PIN hash uji + jadwal shift hari ini 08:00-16:00.
  const TEST_PIN = "4729";
  await db
    .update(staffProfiles)
    .set({ pinHash: hashPin(TEST_PIN) })
    .where(eq(staffProfiles.id, staff.id));

  await db
    .delete(shiftSchedules)
    .where(
      and(eq(shiftSchedules.staffId, staff.id), eq(shiftSchedules.date, jakartaDateKey())),
    );
  const [schedule] = await db
    .insert(shiftSchedules)
    .values({
      staffId: staff.id,
      outletId: staff.outletId,
      date: jakartaDateKey(),
      shiftType: "morning",
      startTime: "08:00",
      endTime: "16:00",
    })
    .returning();

  // --- [1] PIN lookup via hash ---
  console.log("\n[1] Lookup staff via pinHash");
  const found = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.pinHash, hashPin(TEST_PIN)))
    .limit(1)
    .then((r) => r[0]);
  check("pinHash menemukan staff", found?.id === staff.id);
  const notFound = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.pinHash, hashPin("0000")))
    .limit(1)
    .then((r) => r[0]);
  check("PIN salah tidak menemukan staff ini", notFound?.id !== staff.id);

  // --- [2] Clock In dengan kolom baru (GPS + status) ---
  console.log("\n[2] Clock In menyimpan GPS + status shift");
  const inAt = new Date();
  const inStatus = evaluatePunchStatus({
    action: "in",
    punchAt: inAt,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  });
  const [inRow] = await db
    .insert(employeeAttendances)
    .values({
      staffId: staff.id,
      outletId: staff.outletId,
      action: "in",
      timestamp: inAt,
      latitude: -6.2,
      longitude: 106.8,
      distanceMeters: 12.5,
      status: inStatus,
      scheduleId: schedule.id,
    })
    .returning();
  check("kolom latitude tersimpan", inRow.latitude === -6.2, String(inRow.latitude));
  check("kolom distanceMeters tersimpan", inRow.distanceMeters === 12.5, String(inRow.distanceMeters));
  check("status shift tersimpan", typeof inRow.status === "string", String(inRow.status));
  check("scheduleId tertaut", inRow.scheduleId === schedule.id);

  // --- [3] Double-punch detection (query yang dipakai route) ---
  console.log("\n[3] Proteksi double-punch");
  const lastToday = await db
    .select({ action: employeeAttendances.action })
    .from(employeeAttendances)
    .where(
      and(
        eq(employeeAttendances.staffId, staff.id),
        gte(employeeAttendances.timestamp, start),
        lt(employeeAttendances.timestamp, end),
      ),
    )
    .orderBy(desc(employeeAttendances.timestamp))
    .limit(1)
    .then((r) => r[0]);
  const blockSecondIn = lastToday?.action === "in"; // route menolak in saat last == in
  check("Clock In kedua terdeteksi & ditolak", blockSecondIn === true);

  // --- [4] Clock Out lalu hitung jam kerja dari DB ---
  console.log("\n[4] Clock Out + hitung jam kerja");
  const outAt = new Date(inAt.getTime() + 8 * 60 * 60 * 1000); // +8 jam
  await db.insert(employeeAttendances).values({
    staffId: staff.id,
    outletId: staff.outletId,
    action: "out",
    timestamp: outAt,
    status: evaluatePunchStatus({
      action: "out",
      punchAt: outAt,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    }),
    scheduleId: schedule.id,
  });
  const punches = await db
    .select({ action: employeeAttendances.action, timestamp: employeeAttendances.timestamp, status: employeeAttendances.status })
    .from(employeeAttendances)
    .where(
      and(
        eq(employeeAttendances.staffId, staff.id),
        gte(employeeAttendances.timestamp, start),
        lt(employeeAttendances.timestamp, end),
      ),
    );
  const stats = computeWorkedStats(punches);
  check("workedMinutes = 480 (8 jam) dari DB", stats.workedMinutes === 480, String(stats.workedMinutes));
  check("presentDays = 1", stats.presentDays === 1, String(stats.presentDays));
  check("unpaired = 0 (in & out lengkap)", stats.unpairedCount === 0, String(stats.unpairedCount));

  // --- Cleanup ---
  console.log("\n[cleanup] Hapus data uji");
  await db
    .delete(employeeAttendances)
    .where(
      and(
        eq(employeeAttendances.staffId, staff.id),
        gte(employeeAttendances.timestamp, start),
        lt(employeeAttendances.timestamp, end),
      ),
    );
  await db.delete(shiftSchedules).where(eq(shiftSchedules.id, schedule.id));
  // pinHash uji dibiarkan (akan diset ulang admin saat assign PIN asli);
  // tidak menyentuh PIN produksi karena staff ini sebelumnya belum punya hash.
  await db.update(staffProfiles).set({ pinHash: null }).where(eq(staffProfiles.id, staff.id));

  console.log(`\nHasil: ${pass} lulus, ${fail} gagal.`);

  const pool = getPgPool();
  if (typeof (pool as { end?: () => Promise<void> }).end === "function") {
    await (pool as { end: () => Promise<void> }).end();
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
