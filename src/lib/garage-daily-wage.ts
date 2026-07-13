// Payroll V2 — kredit Wallet Gaji (upah harian + lembur + bonus kehadiran).
// Idempoten per (staff, date). Dipanggil dari cron finalisasi 23:59.

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  staffAttendanceV2,
  staffDailyWages,
  staffProfiles,
  staffWageConfig,
} from "@/db/schema";
import {
  PAYROLL_KEYS,
  computeLatePercent,
  getPayrollSetting,
} from "@/lib/garage-payroll-settings";

export interface CreditDailyWageInput {
  staffUserId: string;
  date: string; // YYYY-MM-DD
  attendanceId: string;
  lateMinutes: number;
  overtimeMinutes: number;
  status: string; // 'valid' | ... — hanya 'valid' yang di-credit
  source?: string;
}

export interface DailyWageResult {
  skipped: boolean;
  reason?: string;
  baseWage: number;
  overtimeAmount: number;
  totalCredited: number;
  balanceAfter: number;
}

/** Baca config upah + hitung total credit + insert idempoten. */
export async function creditDailyWage(input: CreditDailyWageInput): Promise<DailyWageResult> {
  const db = getDb();

  // Idempoten: kalau sudah ada row (staff, date), skip.
  const [existing] = await db
    .select({ id: staffDailyWages.id, totalCredited: staffDailyWages.totalCredited })
    .from(staffDailyWages)
    .where(and(eq(staffDailyWages.staffUserId, input.staffUserId), eq(staffDailyWages.date, input.date)))
    .limit(1);
  if (existing) {
    return {
      skipped: true,
      reason: "already_credited",
      baseWage: 0,
      overtimeAmount: 0,
      totalCredited: existing.totalCredited,
      balanceAfter: 0,
    };
  }

  // Kalau attendance bukan valid → tidak credit apa-apa (tapi tetap catat baris zero utk audit)
  if (input.status !== "valid") {
    await db.insert(staffDailyWages).values({
      staffUserId: input.staffUserId,
      date: input.date,
      baseWage: 0,
      lateMultiplierPct: 0,
      overtimeAmount: 0,
      totalCredited: 0,
      balanceAfter: 0,
      source: input.source ?? "cron_finalize",
      note: `attendance status=${input.status}`,
    });
    return {
      skipped: true,
      reason: `attendance_${input.status}`,
      baseWage: 0,
      overtimeAmount: 0,
      totalCredited: 0,
      balanceAfter: 0,
    };
  }

  // Load wage config
  const [wageRow] = await db
    .select({ dailyWage: staffWageConfig.dailyWage, overtimeHourly: staffWageConfig.overtimeHourly })
    .from(staffWageConfig)
    .where(eq(staffWageConfig.staffUserId, input.staffUserId))
    .limit(1);
  const dailyWage = wageRow?.dailyWage ?? 0;
  const overtimeHourlyCfg = wageRow?.overtimeHourly ?? 0;

  const brackets = (await getPayrollSetting(PAYROLL_KEYS.lateBrackets)) as Array<{
    maxMinutes: number | null;
    percent: number;
  }>;
  const overtime = (await getPayrollSetting(PAYROLL_KEYS.overtime)) as {
    enabled: boolean;
    autoFromWage: boolean;
    hourlyRate: number;
  };

  const percent = computeLatePercent(input.lateMinutes, brackets);
  const baseWage = Math.round((dailyWage * percent) / 100);

  let overtimeAmount = 0;
  if (overtime.enabled && input.overtimeMinutes > 0) {
    const rate = overtime.autoFromWage
      ? Math.round((dailyWage / 8) * 1.5)
      : overtime.hourlyRate || overtimeHourlyCfg;
    overtimeAmount = Math.round((rate * input.overtimeMinutes) / 60);
  }

  const totalCredited = baseWage + overtimeAmount;

  // Insert dengan ON CONFLICT DO NOTHING — mencegah DOUBLE-CREDIT saat cron
  // 23:59 double-fire (systemd timer + manual trigger UI bersamaan). Unique
  // constraint `(staff_user_id, date)` sudah ada di schema. Kalau race, INSERT
  // pihak-kedua tidak error tapi tidak menghasilkan row → `row` undefined =
  // sudah ter-credit staff lain, kita skip aman.
  const inserted = await db
    .insert(staffDailyWages)
    .values({
      staffUserId: input.staffUserId,
      date: input.date,
      baseWage,
      lateMultiplierPct: percent,
      overtimeAmount,
      totalCredited,
      balanceAfter: 0, // diisi setelah agregat
      source: input.source ?? "cron_finalize",
      note: `late=${input.lateMinutes}m ot=${input.overtimeMinutes}m pct=${percent}`,
    })
    .onConflictDoNothing({ target: [staffDailyWages.staffUserId, staffDailyWages.date] })
    .returning({ id: staffDailyWages.id });
  const row = inserted[0];
  if (!row) {
    // Race: sudah di-credit request lain di antara guard idempoten & insert.
    return {
      skipped: true,
      reason: "already_credited_race",
      baseWage: 0,
      overtimeAmount: 0,
      totalCredited: 0,
      balanceAfter: 0,
    };
  }

  const [{ sum }] = await db
    .select({ sum: sql<number>`COALESCE(SUM(${staffDailyWages.totalCredited}), 0)` })
    .from(staffDailyWages)
    .where(eq(staffDailyWages.staffUserId, input.staffUserId));
  const balanceAfter = Number(sum ?? 0);
  await db
    .update(staffDailyWages)
    .set({ balanceAfter })
    .where(eq(staffDailyWages.id, row.id));

  return {
    skipped: false,
    baseWage,
    overtimeAmount,
    totalCredited,
    balanceAfter,
  };
}

/** Kredit bonus kehadiran sempurna bulanan. Dipanggil tgl 1 bulan berikut. */
export async function creditMonthlyAttendanceBonus(
  staffUserId: string,
  monthKey: string,
): Promise<{ credited: boolean; amount: number; reason?: string }> {
  const settings = (await getPayrollSetting(PAYROLL_KEYS.bonusAttendance)) as {
    enabled: boolean;
    amount: number;
    allowLateOnce: boolean;
  };
  if (!settings.enabled) return { credited: false, amount: 0, reason: "disabled" };

  const db = getDb();
  const [yyyy, mm] = monthKey.split("-");
  const start = `${yyyy}-${mm}-01`;
  const endMonth = Number(mm) === 12 ? 1 : Number(mm) + 1;
  const endYear = Number(mm) === 12 ? Number(yyyy) + 1 : Number(yyyy);
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      status: staffAttendanceV2.status,
      lateMinutes: staffAttendanceV2.lateMinutes,
    })
    .from(staffAttendanceV2)
    .where(
      and(
        eq(staffAttendanceV2.staffUserId, staffUserId),
        sql`${staffAttendanceV2.date} >= ${start}`,
        sql`${staffAttendanceV2.date} < ${end}`,
      ),
    );

  const invalidDays = rows.filter((r) => r.status !== "valid").length;
  const lateDays = rows.filter((r) => (r.lateMinutes ?? 0) > 15).length;

  if (invalidDays > 0) return { credited: false, amount: 0, reason: "has_invalid_days" };
  if (lateDays > (settings.allowLateOnce ? 1 : 0))
    return { credited: false, amount: 0, reason: "too_many_late" };

  // Kredit sebagai baris tersendiri di staff_daily_wages (source='monthly_attendance_bonus')
  const bonusDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
  await db.insert(staffDailyWages).values({
    staffUserId,
    date: bonusDate,
    baseWage: 0,
    lateMultiplierPct: 0,
    overtimeAmount: 0,
    bonusAmount: settings.amount,
    totalCredited: settings.amount,
    balanceAfter: 0,
    source: "monthly_attendance_bonus",
    note: `Bonus kehadiran bulan ${monthKey}`,
  });

  return { credited: true, amount: settings.amount };
}

/**
 * Ambil ringkasan wallet gaji: saldo (agregat SQL dari SEMUA baris) + histori
 * terbaru (dibatasi supaya query tetap cepat walau data bertahun-tahun).
 */
export async function getGajiWalletSummary(staffUserId: string, limit = 60) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(1, limit), 366);
  const [[agg], entries] = await Promise.all([
    db
      .select({ balance: sql<number>`COALESCE(SUM(${staffDailyWages.totalCredited}), 0)` })
      .from(staffDailyWages)
      .where(eq(staffDailyWages.staffUserId, staffUserId)),
    db
      .select()
      .from(staffDailyWages)
      .where(eq(staffDailyWages.staffUserId, staffUserId))
      .orderBy(sql`${staffDailyWages.date} DESC`)
      .limit(safeLimit),
  ]);
  return { balance: Number(agg?.balance ?? 0), entries };
}

/** Cek role manajer (yang gaji tetap, tidak dapat fee pool). */
export async function isManagerRole(staffUserId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ role: staffProfiles.role })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, staffUserId))
    .limit(1);
  if (!row) return false;
  const feePool = (await getPayrollSetting(PAYROLL_KEYS.feePool)) as {
    excludeRoles: string[];
  };
  return (feePool.excludeRoles ?? []).includes(row.role);
}
