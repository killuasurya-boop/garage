// Payroll V2 — cron finalisasi harian.
//
// Dipanggil jam 23:59 (systemd timer di VPS / manual di dev).
// Idempoten per tanggal via kolom `fee_pool_daily.finalizedAt`.
//
// Alur:
// 1. Iterasi semua staff attendance V2 tanggal itu.
// 2. Tandai status invalid untuk yang tidak checkout / checkout terlalu awal.
// 3. Credit wallet gaji untuk staff valid (creditDailyWage).
// 4. Split fee pool ke staff valid non-manajer (splitFeePoolForDay).
// 5. Hari terakhir bulan: kredit bonus kehadiran bulanan.
// 6. Catat audit log.

import { and, eq, gt, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  feePoolDaily,
  staffAttendanceV2,
  staffDailyWages,
  staffWageConfig,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import { OPEN_SHIFT_MAX_MS } from "@/lib/garage-attendance-v2";
import {
  DAILY_WAGE_SOURCE,
  creditDailyWage,
  applyMonthlyFixedDeduction,
  creditMonthlyAttendanceBonus,
  isLastDayOfMonth,
} from "@/lib/garage-daily-wage";
import { splitFeePoolForDay } from "@/lib/garage-fee-pool";

export interface FinalizeResult {
  date: string;
  alreadyFinalized: boolean;
  staffProcessed: number;
  staffValid: number;
  totalGajiCredited: number;
  poolAmount: number;
  poolSplits: number;
  monthlyBonusCredited: number;
  errors: Array<{ staffUserId?: string; error: string }>;
}

/** Hari terakhir bulan → kredit bonus kehadiran untuk semua staff bergaji. Idempoten. */
async function creditMonthEndBonuses(
  dateKey: string,
  errors: FinalizeResult["errors"],
): Promise<number> {
  if (!isLastDayOfMonth(dateKey)) return 0;
  const db = getDb();
  const staff = await db
    .select({ staffUserId: staffWageConfig.staffUserId })
    .from(staffWageConfig)
    .where(gt(staffWageConfig.dailyWage, 0));
  let credited = 0;
  for (const s of staff) {
    try {
      const res = await creditMonthlyAttendanceBonus(s.staffUserId, dateKey.slice(0, 7));
      if (res.credited) credited += 1;
    } catch (err) {
      errors.push({ staffUserId: s.staffUserId, error: `bonus: ${(err as Error).message}` });
    }
    try {
      // Potongan tetap bulanan (mis. BPJS) — setelah bonus, dibatasi gaji bulan itu.
      await applyMonthlyFixedDeduction(s.staffUserId, dateKey.slice(0, 7));
    } catch (err) {
      errors.push({ staffUserId: s.staffUserId, error: `potongan tetap: ${(err as Error).message}` });
    }
  }
  return credited;
}

/** Finalisasi 1 hari. Aman dijalankan berulang (idempoten). */
export async function finalizePayrollDay(
  targetDateKey?: string,
  now: Date = new Date(),
): Promise<FinalizeResult> {
  const dateKey = targetDateKey ?? jakartaDateKey(now);
  const db = getDb();
  const errors: FinalizeResult["errors"] = [];

  // 1. Fee hari ini sudah final? (langkah absen tetap dijalankan — idempoten —
  //    supaya shift malam yang ditutup belakangan tetap tercatat.)
  const [pool] = await db
    .select({ finalizedAt: feePoolDaily.finalizedAt })
    .from(feePoolDaily)
    .where(eq(feePoolDaily.date, dateKey))
    .limit(1);
  const alreadyFinalized = Boolean(pool?.finalizedAt);

  // 2. Auto-tandai invalid: belum checkout dan shift sudah terbuka > 20 jam
  //    (shift malam yang masih berjalan TIDAK disentuh).
  const staleBefore = new Date(now.getTime() - OPEN_SHIFT_MAX_MS);
  await db
    .update(staffAttendanceV2)
    .set({ status: "invalid", notes: "no_checkout" })
    .where(
      and(
        eq(staffAttendanceV2.date, dateKey),
        eq(staffAttendanceV2.status, "pending"),
        isNull(staffAttendanceV2.checkoutAt),
        or(isNull(staffAttendanceV2.checkinAt), lt(staffAttendanceV2.checkinAt, staleBefore)),
      ),
    );

  // 3. Ambil semua row tanggal itu.
  const rows = await db
    .select()
    .from(staffAttendanceV2)
    .where(eq(staffAttendanceV2.date, dateKey));

  let staffValid = 0;
  let totalGajiCredited = 0;

  for (const r of rows) {
    if (r.status === "pending") continue; // shift masih berjalan → dikredit saat checkout
    try {
      const res = await creditDailyWage({
        staffUserId: r.staffUserId,
        date: dateKey,
        attendanceId: r.id,
        lateMinutes: r.lateMinutes ?? 0,
        overtimeMinutes: r.overtimeMinutes ?? 0,
        status: r.status,
      });
      if (!res.skipped) {
        staffValid += 1;
        totalGajiCredited += res.totalCredited;
      }
    } catch (err) {
      errors.push({ staffUserId: r.staffUserId, error: (err as Error).message });
    }
  }

  // 4. Split fee pool
  let poolAmount = 0;
  let poolSplits = 0;
  try {
    const splitRes = await splitFeePoolForDay(dateKey, now);
    poolAmount = splitRes.pool;
    poolSplits = splitRes.splits.length;
  } catch (err) {
    errors.push({ error: `fee_pool_split: ${(err as Error).message}` });
  }

  // 5. Bonus kehadiran bulanan (hanya di hari terakhir bulan)
  const monthlyBonusCredited = await creditMonthEndBonuses(dateKey, errors);

  // 6. Audit log (hanya bila ada pekerjaan baru — rerun idempoten tidak spam log)
  const didWork = !alreadyFinalized || staffValid > 0 || monthlyBonusCredited > 0;
  try {
    if (didWork) await db.insert(auditLogs).values({
      time: now.toISOString(),
      actor: "system",
      action: "payroll_finalize",
      object: `date=${dateKey}`,
      device: "cron",
      status: errors.length ? "warning" : "success",
      metadata: {
        date: dateKey,
        staffProcessed: rows.length,
        staffValid,
        totalGajiCredited,
        poolAmount,
        poolSplits,
        monthlyBonusCredited,
        errors,
      } as Record<string, unknown>,
    });
  } catch {
    /* audit log opsional, non-blocking */
  }

  return {
    date: dateKey,
    alreadyFinalized,
    staffProcessed: rows.length,
    staffValid,
    totalGajiCredited,
    poolAmount,
    poolSplits,
    monthlyBonusCredited,
    errors,
  };
}

/** Apakah tanggal ini masih punya pekerjaan finalisasi yang tertunda? */
async function needsFinalize(dateKey: string): Promise<boolean> {
  const db = getDb();
  const [unprocessed] = await db
    .select({ id: staffAttendanceV2.id })
    .from(staffAttendanceV2)
    .leftJoin(
      staffDailyWages,
      and(
        eq(staffDailyWages.staffUserId, staffAttendanceV2.staffUserId),
        eq(staffDailyWages.date, staffAttendanceV2.date),
        eq(staffDailyWages.source, DAILY_WAGE_SOURCE),
      ),
    )
    .where(and(eq(staffAttendanceV2.date, dateKey), isNull(staffDailyWages.id)))
    .limit(1);
  if (unprocessed) return true;

  const [openPool] = await db
    .select({ date: feePoolDaily.date })
    .from(feePoolDaily)
    .where(and(eq(feePoolDaily.date, dateKey), isNull(feePoolDaily.finalizedAt)))
    .limit(1);
  if (openPool) return true;

  return isLastDayOfMonth(dateKey); // bonus bulanan idempoten
}

// Tanggal yang sudah dipastikan final di proses ini (hindari kerja & audit log berulang).
const ensuredDates = new Set<string>();
let inflight: Promise<FinalizeResult[]> | null = null;

/**
 * Finalisasi "malas" tanpa penjadwal: memproses hari-hari sebelumnya (maks
 * `lookbackDays`) yang masih tertunda — fee per kepala, lupa check-out, bonus
 * akhir bulan. Dipanggil saat karyawan membuka /absen. Satu eksekusi sekaligus.
 */
export function finalizePendingPayrollDays(
  now: Date = new Date(),
  lookbackDays = 7,
): Promise<FinalizeResult[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    const results: FinalizeResult[] = [];
    for (let d = lookbackDays; d >= 1; d--) {
      const dateKey = jakartaDateKey(new Date(now.getTime() - d * 86_400_000));
      if (ensuredDates.has(dateKey)) continue;
      // Tunggu sampai semua shift tanggal itu pasti selesai (shift malam
      // berakhir pagi hari) — baru diproses setelah H+1 jam 10:00 WIB.
      const closedAt = new Date(`${dateKey}T10:00:00+07:00`).getTime() + 86_400_000;
      if (now.getTime() < closedAt) continue;
      try {
        if (await needsFinalize(dateKey)) results.push(await finalizePayrollDay(dateKey, now));
        const [stillOpen] = await getDb()
          .select({ id: staffAttendanceV2.id })
          .from(staffAttendanceV2)
          .where(and(eq(staffAttendanceV2.date, dateKey), eq(staffAttendanceV2.status, "pending")))
          .limit(1);
        if (!stillOpen) ensuredDates.add(dateKey);
      } catch {
        /* dicoba lagi pada panggilan berikutnya */
      }
    }
    return results;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Finalisasi H-1 (dipanggil systemd 23:59 utk tanggal berjalan) atau tanggal lain manual. */
export async function finalizeYesterdayIfNeeded(now: Date = new Date()) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const dateKey = jakartaDateKey(y);
  return finalizePayrollDay(dateKey, now);
}
