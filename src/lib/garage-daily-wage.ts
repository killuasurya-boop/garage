// Payroll V2 — kredit Wallet Gaji (upah harian + lembur + bonus kehadiran).
// Idempoten per (staff, date, source). Dipanggil saat checkout absen dan dari
// cron finalisasi.

import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  staffAttendanceV2,
  staffDailyWages,
  staffLeaves,
  staffProfiles,
  staffWageConfig,
  user,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import {
  PAYROLL_KEYS,
  computeLatePercent,
  getPayrollSetting,
} from "@/lib/garage-payroll-settings";

export const DAILY_WAGE_SOURCE = "cron_finalize";
export const MONTHLY_BONUS_SOURCE = "monthly_attendance_bonus";
export const MONTHLY_DEDUCTION_SOURCE = "monthly_deduction";

async function refreshBalanceAfter(staffUserId: string, rowId: string): Promise<number> {
  const db = getDb();
  const [{ sum }] = await db
    .select({ sum: sql<number>`COALESCE(SUM(${staffDailyWages.totalCredited}), 0)` })
    .from(staffDailyWages)
    .where(eq(staffDailyWages.staffUserId, staffUserId));
  const balanceAfter = Number(sum ?? 0);
  await db.update(staffDailyWages).set({ balanceAfter }).where(eq(staffDailyWages.id, rowId));
  return balanceAfter;
}

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
  const source = input.source ?? DAILY_WAGE_SOURCE;

  // Idempoten per (staff, date, source): bonus bulanan / penyesuaian owner di
  // tanggal yang sama tidak boleh membuat gaji harian ter-skip.
  const [existing] = await db
    .select({ id: staffDailyWages.id, totalCredited: staffDailyWages.totalCredited })
    .from(staffDailyWages)
    .where(
      and(
        eq(staffDailyWages.staffUserId, input.staffUserId),
        eq(staffDailyWages.date, input.date),
        eq(staffDailyWages.source, source),
      ),
    )
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
      source,
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
    flatHourlyRate?: number;
    paidWeekdays?: number[]; // 0=Minggu..6=Sabtu; bila diisi, lembur hanya di hari-hari ini
    roundMode?: "hour" | "minute"; // "hour" = per jam penuh (floor); default prorata menit
  };
  // Opt-in (Garage): potongan telat per menit + cutoff hangus. Bila key belum
  // di-set, pakai model bracket persen lama (backward-compatible).
  const latePenalty = (await getPayrollSetting("late.penalty")) as {
    mode?: "per_minute" | "bracket";
    perMinute?: number;
    cutoffMinutes?: number;
  } | null;

  let baseWage: number;
  let percent: number;
  if (latePenalty && latePenalty.mode === "per_minute") {
    const cutoff = latePenalty.cutoffMinutes ?? 30;
    const perMinute = latePenalty.perMinute ?? 1000;
    const late = Math.max(0, input.lateMinutes);
    if (late >= cutoff) {
      baseWage = 0; // telat ≥ cutoff → gaji hari itu hangus
      percent = 0;
    } else {
      baseWage = Math.max(0, dailyWage - perMinute * late);
      percent = dailyWage > 0 ? Math.round((baseWage / dailyWage) * 100) : 0;
    }
  } else {
    percent = computeLatePercent(input.lateMinutes, brackets);
    baseWage = Math.round((dailyWage * percent) / 100);
  }

  let overtimeAmount = 0;
  if (overtime.enabled && input.overtimeMinutes > 0) {
    // Gating hari: bila paidWeekdays diisi (mis. [6]=Sabtu), lembur hanya
    // dihitung pada hari tsb. Tanpa paidWeekdays → semua hari (perilaku lama).
    const weekday = new Date(`${input.date}T12:00:00+07:00`).getDay();
    const restrictDays = Array.isArray(overtime.paidWeekdays) ? overtime.paidWeekdays : null;
    const dayAllowed = !restrictDays || restrictDays.includes(weekday);
    if (dayAllowed) {
      const rate =
        overtime.flatHourlyRate && overtime.flatHourlyRate > 0
          ? overtime.flatHourlyRate
          : overtime.autoFromWage
            ? Math.round((dailyWage / 8) * 1.5)
            : overtime.hourlyRate || overtimeHourlyCfg;
      overtimeAmount =
        overtime.roundMode === "hour"
          ? Math.floor(input.overtimeMinutes / 60) * rate // per jam penuh (ke bawah)
          : Math.round((rate * input.overtimeMinutes) / 60);
    }
  }

  const totalCredited = baseWage + overtimeAmount;

  const [row] = await db
    .insert(staffDailyWages)
    .values({
      staffUserId: input.staffUserId,
      date: input.date,
      baseWage,
      lateMultiplierPct: percent,
      overtimeAmount,
      // Informasi utk slip: upah harian penuh − upah dikredit (telat/hangus).
      // Tidak mengurangi totalCredited lagi.
      deductionAmount: Math.max(0, dailyWage - baseWage),
      totalCredited,
      balanceAfter: 0, // diisi setelah agregat
      source,
      note: `late=${input.lateMinutes}m ot=${input.overtimeMinutes}m pct=${percent}`,
    })
    .returning({ id: staffDailyWages.id });

  const balanceAfter = await refreshBalanceAfter(input.staffUserId, row.id);

  return {
    skipped: false,
    baseWage,
    overtimeAmount,
    totalCredited,
    balanceAfter,
  };
}

/** Semua tanggal (YYYY-MM-DD) dalam bulan `monthKey` (YYYY-MM). */
export function monthDateKeys(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`);
}

export function isLastDayOfMonth(dateKey: string): boolean {
  const days = monthDateKeys(dateKey.slice(0, 7));
  return days[days.length - 1] === dateKey;
}

function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/**
 * Kredit bonus kehadiran bulanan (dicatat di tanggal terakhir bulan). Gugur bila:
 * - hari tidak hadir (hari kerja tanpa absen valid) > `allowedOffDays`, atau
 * - hari telat (> `lateGraceMinutes`) melebihi toleransi `allowLateOnce`.
 * Hari kerja = hari dalam bulan sejak karyawan terdaftar, dikurangi
 * `general.weeklyOffDays` (hari toko tutup). Idempoten per (staff, bulan).
 */
export async function creditMonthlyAttendanceBonus(
  staffUserId: string,
  monthKey: string,
): Promise<{ credited: boolean; amount: number; reason?: string }> {
  const settings = (await getPayrollSetting(PAYROLL_KEYS.bonusAttendance)) as {
    enabled: boolean;
    amount: number;
    allowLateOnce: boolean;
    lateGraceMinutes?: number; // telat di atas nilai ini dihitung "hari telat"; default 15
    allowedOffDays?: number; // jatah tidak hadir per bulan yang tidak menggugurkan; default 0
  };
  if (!settings.enabled) return { credited: false, amount: 0, reason: "disabled" };

  const db = getDb();
  const days = monthDateKeys(monthKey);
  const bonusDate = days[days.length - 1];

  const [already] = await db
    .select({ id: staffDailyWages.id })
    .from(staffDailyWages)
    .where(
      and(
        eq(staffDailyWages.staffUserId, staffUserId),
        eq(staffDailyWages.date, bonusDate),
        eq(staffDailyWages.source, MONTHLY_BONUS_SOURCE),
      ),
    )
    .limit(1);
  if (already) return { credited: false, amount: 0, reason: "already_credited" };

  const general = (await getPayrollSetting(PAYROLL_KEYS.general)) as {
    weeklyOffDays?: number[];
  } | null;
  const offDays = Array.isArray(general?.weeklyOffDays) ? general.weeklyOffDays : [];

  // Karyawan baru tidak dihukum untuk hari sebelum ia terdaftar.
  const [who] = await db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, staffUserId))
    .limit(1);
  const startKey = who ? jakartaDateKey(who.createdAt) : days[0];
  // Izin/sakit/cuti yang dicatat manajer bukan hari "tidak hadir".
  const leaves = await db
    .select({ date: staffLeaves.date })
    .from(staffLeaves)
    .where(
      and(
        eq(staffLeaves.staffUserId, staffUserId),
        gte(staffLeaves.date, days[0]),
        lte(staffLeaves.date, bonusDate),
      ),
    );
  const leaveDates = new Set(leaves.map((l) => String(l.date)));
  const requiredDays = days.filter(
    (d) => d >= startKey && !offDays.includes(weekdayOf(d)) && !leaveDates.has(d),
  );
  if (requiredDays.length === 0) return { credited: false, amount: 0, reason: "no_working_days" };

  const rows = await db
    .select({
      date: staffAttendanceV2.date,
      status: staffAttendanceV2.status,
      lateMinutes: staffAttendanceV2.lateMinutes,
    })
    .from(staffAttendanceV2)
    .where(
      and(
        eq(staffAttendanceV2.staffUserId, staffUserId),
        gte(staffAttendanceV2.date, days[0]),
        lte(staffAttendanceV2.date, bonusDate),
      ),
    );

  const validDates = new Set(rows.filter((r) => r.status === "valid").map((r) => String(r.date)));
  const absentDays = requiredDays.filter((d) => !validDates.has(d)).length;
  const grace = settings.lateGraceMinutes ?? 15;
  const lateDays = rows.filter((r) => (r.lateMinutes ?? 0) > grace).length;

  if (absentDays > (settings.allowedOffDays ?? 0))
    return { credited: false, amount: 0, reason: "too_many_absent" };
  if (lateDays > (settings.allowLateOnce ? 1 : 0))
    return { credited: false, amount: 0, reason: "too_many_late" };

  const [row] = await db
    .insert(staffDailyWages)
    .values({
      staffUserId,
      date: bonusDate,
      baseWage: 0,
      lateMultiplierPct: 0,
      overtimeAmount: 0,
      bonusAmount: settings.amount,
      totalCredited: settings.amount,
      balanceAfter: 0,
      source: MONTHLY_BONUS_SOURCE,
      note: `Bonus kehadiran bulan ${monthKey} (tidak hadir ${absentDays} hari)`,
    })
    .returning({ id: staffDailyWages.id });
  await refreshBalanceAfter(staffUserId, row.id);

  return { credited: true, amount: settings.amount };
}

/**
 * Potongan tetap bulanan (mis. iuran BPJS bagian karyawan) dari
 * `staff_wage_config.monthly_deduction`, dicatat sekali di tanggal terakhir bulan
 * sebagai baris negatif. Tidak melebihi gaji yang diperoleh bulan itu (karyawan
 * yang tidak masuk sebulan penuh tidak jadi berutang). Idempoten per (staff, bulan);
 * dihitung ulang selama belum dibayar.
 */
export async function applyMonthlyFixedDeduction(
  staffUserId: string,
  monthKey: string,
): Promise<{ applied: boolean; amount: number; reason?: string }> {
  const db = getDb();
  const days = monthDateKeys(monthKey);
  const lastDay = days[days.length - 1];
  const [cfg] = await db
    .select({ monthlyDeduction: staffWageConfig.monthlyDeduction })
    .from(staffWageConfig)
    .where(eq(staffWageConfig.staffUserId, staffUserId))
    .limit(1);
  const configured = Math.max(0, cfg?.monthlyDeduction ?? 0);

  const monthRows = await db
    .select({
      id: staffDailyWages.id,
      source: staffDailyWages.source,
      total: staffDailyWages.totalCredited,
      payoutId: staffDailyWages.payoutId,
    })
    .from(staffDailyWages)
    .where(
      and(
        eq(staffDailyWages.staffUserId, staffUserId),
        gte(staffDailyWages.date, days[0]),
        lte(staffDailyWages.date, lastDay),
      ),
    );
  const existing = monthRows.find((r) => r.source === MONTHLY_DEDUCTION_SOURCE);
  if (existing?.payoutId) return { applied: false, amount: -existing.total, reason: "already_paid" };

  const earned = monthRows
    .filter((r) => r.source !== MONTHLY_DEDUCTION_SOURCE)
    .reduce((s, r) => s + r.total, 0);
  const amount = Math.min(configured, Math.max(0, earned));
  if (amount <= 0) {
    if (existing) await db.delete(staffDailyWages).where(eq(staffDailyWages.id, existing.id));
    return { applied: false, amount: 0, reason: configured ? "no_earnings" : "not_configured" };
  }

  const note =
    amount < configured
      ? `Potongan tetap bulan ${monthKey} (mis. BPJS) — dibatasi gaji bulan itu`
      : `Potongan tetap bulan ${monthKey} (mis. BPJS)`;
  const values = {
    baseWage: 0,
    lateMultiplierPct: 0,
    overtimeAmount: 0,
    bonusAmount: 0,
    deductionAmount: amount,
    totalCredited: -amount,
    note,
  };
  let rowId = existing?.id;
  if (existing) {
    await db.update(staffDailyWages).set(values).where(eq(staffDailyWages.id, existing.id));
  } else {
    const [row] = await db
      .insert(staffDailyWages)
      .values({ staffUserId, date: lastDay, balanceAfter: 0, source: MONTHLY_DEDUCTION_SOURCE, ...values })
      .returning({ id: staffDailyWages.id });
    rowId = row.id;
  }
  await refreshBalanceAfter(staffUserId, rowId!);
  return { applied: true, amount };
}

/**
 * Ambil ringkasan wallet gaji: saldo (agregat SQL dari SEMUA baris) + histori
 * terbaru (dibatasi supaya query tetap cepat walau data bertahun-tahun).
 */
export async function getGajiWalletSummary(staffUserId: string, limit = 60) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(1, limit), 366);
  const [[agg], entries] = await Promise.all([
    // Saldo = gaji yang BELUM dibayar lewat gajian (payout_id kosong).
    db
      .select({ balance: sql<number>`COALESCE(SUM(${staffDailyWages.totalCredited}), 0)` })
      .from(staffDailyWages)
      .where(and(eq(staffDailyWages.staffUserId, staffUserId), isNull(staffDailyWages.payoutId))),
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
