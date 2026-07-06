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
// 5. Catat audit log.

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, staffAttendanceV2, feePoolDaily } from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import { creditDailyWage } from "@/lib/garage-daily-wage";
import { splitFeePoolForDay } from "@/lib/garage-fee-pool";

export interface FinalizeResult {
  date: string;
  alreadyFinalized: boolean;
  staffProcessed: number;
  staffValid: number;
  totalGajiCredited: number;
  poolAmount: number;
  poolSplits: number;
  errors: Array<{ staffUserId?: string; error: string }>;
}

/** Finalisasi 1 hari. Aman dijalankan berulang (idempoten). */
export async function finalizePayrollDay(
  targetDateKey?: string,
  now: Date = new Date(),
): Promise<FinalizeResult> {
  const dateKey = targetDateKey ?? jakartaDateKey(now);
  const db = getDb();
  const errors: FinalizeResult["errors"] = [];

  // 1. Cek idempotensi via feePoolDaily.finalizedAt
  const [pool] = await db
    .select({ finalizedAt: feePoolDaily.finalizedAt })
    .from(feePoolDaily)
    .where(eq(feePoolDaily.date, dateKey))
    .limit(1);
  if (pool?.finalizedAt) {
    return {
      date: dateKey,
      alreadyFinalized: true,
      staffProcessed: 0,
      staffValid: 0,
      totalGajiCredited: 0,
      poolAmount: 0,
      poolSplits: 0,
      errors: [],
    };
  }

  // 2. Auto-tandai invalid untuk yang tidak checkout (status 'pending').
  await db
    .update(staffAttendanceV2)
    .set({ status: "invalid", notes: "no_checkout" })
    .where(
      and(
        eq(staffAttendanceV2.date, dateKey),
        eq(staffAttendanceV2.status, "pending"),
        isNull(staffAttendanceV2.checkoutAt),
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

  // 5. Audit log
  try {
    await db.insert(auditLogs).values({
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
        errors,
      } as Record<string, unknown>,
    });
  } catch {
    /* audit log opsional, non-blocking */
  }

  return {
    date: dateKey,
    alreadyFinalized: false,
    staffProcessed: rows.length,
    staffValid,
    totalGajiCredited,
    poolAmount,
    poolSplits,
    errors,
  };
}

/** Finalisasi H-1 (dipanggil systemd 23:59 utk tanggal berjalan) atau tanggal lain manual. */
export async function finalizeYesterdayIfNeeded(now: Date = new Date()) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const dateKey = jakartaDateKey(y);
  return finalizePayrollDay(dateKey, now);
}
