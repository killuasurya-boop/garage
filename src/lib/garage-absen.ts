// Payroll V2 — identitas absen TERPISAH dari akun sistem.
// Karyawan login di /absen memakai KODE + PIN (bukan sesi Better Auth). Identitas
// absen = baris `staff_wage_config.absen_code`; user-nya dibuat tanpa password
// sehingga tidak bisa membuka aplikasi sistem.

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  staffAttendanceV2,
  staffCashAdvances,
  staffProfiles,
  staffThrPayments,
  staffWageConfig,
  user,
} from "@/db/schema";
import { fail } from "@/lib/api-response";
import {
  checkRateLimit,
  hashPin,
  pinHashEquals,
  recordFailedAttempt,
  resetRateLimit,
} from "@/lib/attendance";
import {
  AttendanceError,
  type AttendanceMethod,
  getCurrentAttendance,
} from "@/lib/garage-attendance-v2";
import {
  MONTHLY_BONUS_SOURCE,
  MONTHLY_DEDUCTION_SOURCE,
  getGajiWalletSummary,
} from "@/lib/garage-daily-wage";
import { getFeeWalletSummary } from "@/lib/garage-fee-pool";
import { deductibleAdvance } from "@/lib/garage-payroll-payments";
import { PAYROLL_KEYS, getPayrollSetting } from "@/lib/garage-payroll-settings";

export type AbsenAuthErrorCode = "INVALID_CREDENTIALS" | "LOCKED" | "INACTIVE";

export class AbsenAuthError extends Error {
  constructor(
    public code: AbsenAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AbsenAuthError";
  }
}

export interface AbsenEmployee {
  staffUserId: string;
  code: string;
  name: string;
  position: string | null;
  dailyWage: number;
}

export function normalizeAbsenCode(code: string): string {
  return code.trim().toUpperCase();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Verifikasi KODE + PIN. Rate-limit per kode dan per IP (anti tebak PIN). */
export async function resolveAbsenEmployee(input: {
  code: string;
  pin: string;
  ip: string;
}): Promise<AbsenEmployee> {
  const code = normalizeAbsenCode(input.code);
  const codeKey = `absen:code:${code}`;
  const ipKey = `absen:ip:${input.ip}`;
  for (const key of [codeKey, ipKey]) {
    const rl = checkRateLimit(key);
    if (!rl.allowed) {
      const minutes = Math.max(1, Math.ceil((rl.retryAfterSec ?? 60) / 60));
      throw new AbsenAuthError(
        "LOCKED",
        `Terlalu banyak percobaan salah. Coba lagi dalam ${minutes} menit.`,
      );
    }
  }

  const db = getDb();
  const [row] = await db
    .select({
      staffUserId: staffWageConfig.staffUserId,
      dailyWage: staffWageConfig.dailyWage,
      name: user.name,
      position: staffProfiles.position,
      status: staffProfiles.status,
      pinHash: staffProfiles.pinHash,
    })
    .from(staffWageConfig)
    .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
    .where(eq(staffWageConfig.absenCode, code))
    .limit(1);

  // Pesan sama untuk kode salah & PIN salah supaya kode valid tidak bisa ditebak.
  if (!row || !row.pinHash || !pinHashEquals(row.pinHash, hashPin(input.pin))) {
    recordFailedAttempt(codeKey);
    recordFailedAttempt(ipKey);
    throw new AbsenAuthError("INVALID_CREDENTIALS", "Kode atau PIN salah.");
  }
  if (row.status !== "active") {
    throw new AbsenAuthError("INACTIVE", "Akun absen nonaktif. Hubungi owner.");
  }
  resetRateLimit(codeKey);

  return {
    staffUserId: row.staffUserId,
    code,
    name: row.name,
    position: row.position,
    dailyWage: row.dailyWage,
  };
}

/** Metode absen jalur payroll: `attendance.methods.absen`, default PIN + Selfie + GPS. */
export async function resolveAbsenMethod(): Promise<AttendanceMethod> {
  const methods = (await getPayrollSetting(PAYROLL_KEYS.attendanceMethods)) as Record<
    string,
    string
  > | null;
  const m = methods?.absen;
  return m === "pin" || m === "pin_selfie_gps" || m === "pin_selfie_gps_multi"
    ? m
    : "pin_selfie_gps";
}

/** Data dasbor HP karyawan: status hari ini + saldo & riwayat wallet gaji/fee. */
export async function getAbsenDashboard(staffUserId: string) {
  const [today, gaji, fee, general, wage, advanceRows, thrRows] = await Promise.all([
    getCurrentAttendance(staffUserId),
    getGajiWalletSummary(staffUserId, 10),
    getFeeWalletSummary(staffUserId, 10),
    getPayrollSetting(PAYROLL_KEYS.general) as Promise<{ openHour?: number } | null>,
    getDb()
      .select({ shiftStartMinutes: staffWageConfig.shiftStartMinutes })
      .from(staffWageConfig)
      .where(eq(staffWageConfig.staffUserId, staffUserId))
      .limit(1),
    getDb()
      .select({
        total: sql<number>`COALESCE(SUM(${staffCashAdvances.amount} - ${staffCashAdvances.settledAmount}), 0)`,
      })
      .from(staffCashAdvances)
      .where(and(eq(staffCashAdvances.staffUserId, staffUserId), deductibleAdvance)),
    // THR yang sudah dibayar (3 terakhir).
    getDb()
      .select({
        holidayName: staffThrPayments.holidayName,
        holidayDate: staffThrPayments.holidayDate,
        amount: staffThrPayments.amount,
        createdAt: staffThrPayments.createdAt,
      })
      .from(staffThrPayments)
      .where(and(eq(staffThrPayments.staffUserId, staffUserId), eq(staffThrPayments.status, "paid")))
      .orderBy(desc(staffThrPayments.createdAt))
      .limit(3),
  ]);
  const advance = Number(advanceRows[0]?.total ?? 0);
  const shiftStartMinutes = wage[0]?.shiftStartMinutes ?? (general?.openHour ?? 9) * 60;

  // Menit telat per tanggal, untuk label riwayat gaji (potong / hangus).
  const dates = gaji.entries.map((e) => String(e.date));
  const lateByDate = new Map<string, number>();
  if (dates.length > 0) {
    const rows = await getDb()
      .select({ date: staffAttendanceV2.date, lateMinutes: staffAttendanceV2.lateMinutes })
      .from(staffAttendanceV2)
      .where(
        and(
          eq(staffAttendanceV2.staffUserId, staffUserId),
          inArray(staffAttendanceV2.date, dates),
        ),
      );
    for (const r of rows) lateByDate.set(String(r.date), r.lateMinutes ?? 0);
  }

  return {
    shiftStart: `${String(Math.floor(shiftStartMinutes / 60)).padStart(2, "0")}:${String(shiftStartMinutes % 60).padStart(2, "0")}`,
    today: today
      ? {
          checkinAt: today.checkinAt,
          checkoutAt: today.checkoutAt,
          status: today.status,
          lateMinutes: today.lateMinutes,
          workedMinutes: today.workedMinutes,
          overtimeMinutes: today.overtimeMinutes,
        }
      : null,
    wallet: {
      gaji: {
        balance: gaji.balance,
        entries: gaji.entries.map((e) => ({
          date: String(e.date),
          kind:
            e.source === MONTHLY_BONUS_SOURCE
              ? "bonus"
              : e.source === MONTHLY_DEDUCTION_SOURCE
                ? "potongan"
                : "harian",
          baseWage: e.baseWage,
          overtimeAmount: e.overtimeAmount,
          bonusAmount: e.bonusAmount,
          totalCredited: e.totalCredited,
          lateMinutes: lateByDate.get(String(e.date)) ?? 0,
          paid: Boolean(e.payoutId),
        })),
      },
      fee: {
        balance: fee.balance,
        entries: fee.entries.map((e) => ({
          date: String(e.date),
          amount: e.amount + e.bonusTarget + e.bonusZeroKomplain,
          paid: Boolean(e.paymentId),
        })),
      },
      advance, // kasbon belum lunas — dipotong saat gajian
    },
    thr: thrRows.map((t) => ({
      holidayName: t.holidayName,
      holidayDate: String(t.holidayDate),
      amount: t.amount,
      paidAt: t.createdAt.toISOString(),
    })),
  };
}

/** Petakan error absen/attendance ke respons `{ error }` yang konsisten. */
export function absenErrorResponse(err: unknown) {
  if (err instanceof AbsenAuthError) {
    const status = err.code === "LOCKED" ? 429 : err.code === "INACTIVE" ? 403 : 401;
    return fail(status, err.code, err.message);
  }
  if (err instanceof AttendanceError) {
    return fail(400, err.code, err.message);
  }
  return fail(500, "ABSEN_FAILED", (err as Error).message);
}
