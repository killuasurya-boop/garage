// Payroll V2 — data slip gaji bulanan per karyawan.
// Sumber angka = rekap bulanan + baris staff_daily_wages yang sama dengan mesin
// gaji, sehingga: total penerimaan − total potongan = gaji dikredit + fee.

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { outlets, staffDailyWages, staffProfiles, staffWageConfig } from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import {
  DAILY_WAGE_SOURCE,
  MONTHLY_BONUS_SOURCE,
  MONTHLY_DEDUCTION_SOURCE,
  monthDateKeys,
} from "@/lib/garage-daily-wage";
import { getPaymentStatusForMonth, type PaymentStatusForMonth } from "@/lib/garage-payroll-payments";
import { getMonthlyReport, type RecapDayStatus } from "@/lib/garage-payroll-report";
import { getThrPaidBetween } from "@/lib/garage-payroll-thr";
import { PAYROLL_KEYS, getPayrollSetting } from "@/lib/garage-payroll-settings";

export const COMPANY_NAME = "Garage Coffee";

export interface PayslipLine {
  label: string;
  detail: string;
  amount: number;
}

export interface PayslipDay {
  date: string;
  status: RecapDayStatus;
  statusLabel: string;
  checkinAt: string | null;
  checkoutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  base: number;
  deduction: number;
  overtime: number;
  fee: number;
}

export interface Payslip {
  slipNo: string;
  month: string;
  periodLabel: string;
  provisional: boolean;
  generatedAt: string;
  company: { name: string; outletName: string; headerNote: string | null; footerNote: string | null };
  employee: {
    staffUserId: string;
    code: string | null;
    name: string;
    position: string | null;
    shiftStart: string;
    dailyWage: number;
    monthlySalary: number;
    excludeFromFee: boolean;
  };
  attendance: {
    workingDays: number;
    presentDays: number;
    lateDays: number;
    lateMinutes: number;
    forfeitedDays: number;
    absentDays: number;
    leaveDays: number;
    allowedOffDays: number;
    overtimeMinutes: number;
    overtimeHours: number;
  };
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  totalEarnings: number;
  totalDeductions: number;
  net: number;
  bonusStatus: string;
  rules: string[];
  days: PayslipDay[];
  payment: PaymentStatusForMonth;
}

export const DAY_STATUS_LABEL: Record<RecapDayStatus, string> = {
  hadir: "Hadir",
  telat: "Telat",
  hangus: "Hangus (telat)",
  tidak_valid: "Tidak valid",
  tidak_hadir: "Tidak hadir",
  berjalan: "Sedang shift",
  belum_absen: "Belum absen",
  libur: "Toko tutup",
  akan_datang: "-",
  belum_terdaftar: "Belum terdaftar",
  izin: "Izin",
  sakit: "Sakit",
  cuti: "Cuti",
};

const rp = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;

export function periodLabel(monthKey: string): string {
  return new Date(`${monthKey}-15T12:00:00+07:00`).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Slip bulanan untuk semua karyawan payroll (atau satu, via staffUserId). */
export async function buildPayslips(
  monthKey: string,
  opts: { staffUserId?: string } = {},
  now = new Date(),
): Promise<Payslip[]> {
  const report = await getMonthlyReport(monthKey, now);
  const employees = opts.staffUserId
    ? report.employees.filter((e) => e.staffUserId === opts.staffUserId)
    : report.employees;
  if (employees.length === 0) return [];

  const ids = employees.map((e) => e.staffUserId);
  const monthDays = monthDateKeys(monthKey);
  const db = getDb();
  const [wages, configs, slipCfg, latePenalty, overtimeCfg, bonusCfg, paymentStatus] = await Promise.all([
    db
      .select()
      .from(staffDailyWages)
      .where(
        and(
          inArray(staffDailyWages.staffUserId, ids),
          gte(staffDailyWages.date, monthDays[0]),
          lte(staffDailyWages.date, monthDays[monthDays.length - 1]),
        ),
      ),
    db
      .select({
        staffUserId: staffWageConfig.staffUserId,
        monthlySalary: staffWageConfig.monthlySalary,
        outletName: outlets.name,
      })
      .from(staffWageConfig)
      .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
      .innerJoin(outlets, eq(outlets.id, staffProfiles.outletId))
      .where(inArray(staffWageConfig.staffUserId, ids)),
    getPayrollSetting(PAYROLL_KEYS.slip) as Promise<{ headerNote?: string; footerNote?: string } | null>,
    getPayrollSetting("late.penalty") as Promise<{
      mode?: string;
      perMinute?: number;
      cutoffMinutes?: number;
    } | null>,
    getPayrollSetting(PAYROLL_KEYS.overtime) as Promise<{
      enabled?: boolean;
      flatHourlyRate?: number;
      paidWeekdays?: number[];
    } | null>,
    getPayrollSetting(PAYROLL_KEYS.bonusAttendance) as Promise<{
      enabled?: boolean;
      amount?: number;
    } | null>,
    getPaymentStatusForMonth(db, ids, monthDays[0], monthDays[monthDays.length - 1]),
  ]);

  const thrPaid = await getThrPaidBetween(
    ids,
    new Date(`${monthDays[0]}T00:00:00+07:00`),
    new Date(`${monthDays[monthDays.length - 1]}T23:59:59+07:00`),
  );

  const perMinute = latePenalty?.mode === "per_minute" ? (latePenalty.perMinute ?? 1_000) : 0;
  const cutoff = latePenalty?.cutoffMinutes ?? 30;
  const today = jakartaDateKey(now);
  const provisional = monthDays[monthDays.length - 1] >= today;
  const label = periodLabel(monthKey);

  const rules = [
    "Upah harian = gaji bulanan ÷ 30, dibayar per hari hadir (absen masuk & keluar).",
    perMinute > 0
      ? `Potongan telat ${rp(perMinute)}/menit; telat ${cutoff} menit atau lebih, upah hari itu hangus.`
      : "Potongan telat mengikuti persentase keterlambatan.",
    overtimeCfg?.enabled && overtimeCfg.paidWeekdays?.length === 1 && overtimeCfg.paidWeekdays[0] === 6
      ? `Lembur hanya hari Sabtu lewat jam tutup, ${rp(overtimeCfg.flatHourlyRate ?? 0)}/jam penuh.`
      : "Lembur dihitung lewat jam tutup sesuai pengaturan.",
    bonusCfg?.enabled
      ? `Bonus kehadiran ${rp(bonusCfg.amount ?? 0)}/bulan bila tidak pernah telat dan libur maks. ${report.rules.allowedOffDays} hari.`
      : "Bonus kehadiran tidak aktif.",
  ];

  return employees.map((emp) => {
    const cfg = configs.find((c) => c.staffUserId === emp.staffUserId);
    const empWages = wages.filter((w) => w.staffUserId === emp.staffUserId);
    const dailyByDate = new Map(
      empWages.filter((w) => w.source === DAILY_WAGE_SOURCE).map((w) => [String(w.date), w]),
    );

    const days: PayslipDay[] = emp.days
      .filter((d) => d.date <= today && d.status !== "akan_datang" && d.status !== "belum_terdaftar")
      .map((d) => {
        const row = dailyByDate.get(d.date);
        const base = row?.baseWage ?? 0;
        let deduction = row?.deductionAmount ?? 0;
        // Baris lama (sebelum deduction_amount diisi): hitung ulang dari telat.
        if (row && deduction === 0 && d.lateMinutes > 0 && (d.status === "telat" || d.status === "hangus")) {
          deduction = d.status === "hangus" ? emp.dailyWage : Math.min(emp.dailyWage, perMinute * d.lateMinutes);
        }
        return {
          date: d.date,
          status: d.status,
          statusLabel: DAY_STATUS_LABEL[d.status],
          checkinAt: d.checkinAt,
          checkoutAt: d.checkoutAt,
          lateMinutes: d.lateMinutes,
          overtimeMinutes: d.overtimeMinutes,
          base,
          deduction,
          overtime: row?.overtimeAmount ?? 0,
          fee: d.fee,
        };
      });

    const paidDays = days.filter((d) => dailyByDate.has(d.date) && d.base + d.deduction > 0);
    const grossValues = new Set(paidDays.map((d) => d.base + d.deduction));
    const grossWage = paidDays.reduce((s, d) => s + d.base + d.deduction, 0);
    const overtimeAmount = days.reduce((s, d) => s + d.overtime, 0);
    const overtimeHours = days
      .filter((d) => d.overtime > 0)
      .reduce((s, d) => s + Math.floor(d.overtimeMinutes / 60), 0);
    const bonus = empWages
      .filter((w) => w.source === MONTHLY_BONUS_SOURCE)
      .reduce((s, w) => s + w.totalCredited, 0);
    const adjustments = empWages.filter(
      (w) => w.source !== DAILY_WAGE_SOURCE && w.source !== MONTHLY_BONUS_SOURCE,
    );
    const feeDays = days.filter((d) => d.fee > 0).length;
    const lateDays = days.filter((d) => d.status === "telat");
    const forfeited = days.filter((d) => d.status === "hangus");

    const earnings: PayslipLine[] = [
      {
        label: "Upah harian",
        detail:
          grossValues.size === 1
            ? `${paidDays.length} hari × ${rp([...grossValues][0])}`
            : `${paidDays.length} hari hadir`,
        amount: grossWage,
      },
    ];
    if (overtimeAmount > 0) {
      earnings.push({ label: "Lembur Sabtu", detail: `${overtimeHours} jam`, amount: overtimeAmount });
    }
    if (bonus > 0) {
      earnings.push({ label: "Bonus kehadiran", detail: "Tanpa telat, libur sesuai jatah", amount: bonus });
    }
    earnings.push(
      emp.excludeFromFee
        ? { label: "Fee produk", detail: "Tidak termasuk untuk jabatan ini", amount: 0 }
        : { label: "Fee produk", detail: `${feeDays} hari · per produk terjual`, amount: emp.summary.fee },
    );

    const deductions: PayslipLine[] = [];
    const lateDeduction = lateDays.reduce((s, d) => s + d.deduction, 0);
    if (lateDeduction > 0) {
      const minutes = lateDays.reduce((s, d) => s + d.lateMinutes, 0);
      deductions.push({
        label: "Potongan telat",
        detail: `${lateDays.length} hari · ${minutes} menit${perMinute ? ` × ${rp(perMinute)}` : ""}`,
        amount: lateDeduction,
      });
    }
    const forfeitedAmount = forfeited.reduce((s, d) => s + d.deduction, 0);
    if (forfeitedAmount > 0) {
      deductions.push({
        label: "Upah hangus",
        detail: `${forfeited.length} hari telat ${cutoff} menit atau lebih`,
        amount: forfeitedAmount,
      });
    }
    for (const adj of adjustments) {
      const fixed = adj.source === MONTHLY_DEDUCTION_SOURCE;
      const line = {
        label: fixed ? "Potongan tetap (BPJS)" : "Penyesuaian owner",
        detail: fixed ? "Iuran bulanan bagian karyawan" : (adj.note ?? String(adj.date)),
        amount: Math.abs(adj.totalCredited),
      };
      if (adj.totalCredited >= 0) earnings.push(line);
      else deductions.push(line);
    }

    const totalEarnings = earnings.reduce((s, l) => s + l.amount, 0);
    const totalDeductions = deductions.reduce((s, l) => s + l.amount, 0);
    const yyyymm = monthKey.replace("-", "");

    return {
      slipNo: `SG-${yyyymm}-${emp.code ?? emp.staffUserId.slice(-6).toUpperCase()}`,
      month: monthKey,
      periodLabel: label,
      provisional,
      generatedAt: now.toISOString(),
      company: {
        name: COMPANY_NAME,
        outletName: cfg?.outletName ?? "Outlet",
        headerNote: slipCfg?.headerNote && slipCfg.headerNote !== COMPANY_NAME ? slipCfg.headerNote : null,
        footerNote: slipCfg?.footerNote ?? null,
      },
      employee: {
        staffUserId: emp.staffUserId,
        code: emp.code,
        name: emp.name,
        position: emp.position,
        shiftStart: emp.shiftStart,
        dailyWage: emp.dailyWage,
        monthlySalary: cfg?.monthlySalary ?? Math.round((emp.dailyWage * 30) / 1_000) * 1_000,
        excludeFromFee: emp.excludeFromFee,
      },
      attendance: {
        workingDays: emp.summary.presentDays + emp.summary.absentDays,
        presentDays: emp.summary.presentDays,
        lateDays: emp.summary.lateDays,
        lateMinutes: emp.summary.lateMinutes,
        forfeitedDays: emp.summary.forfeitedDays,
        absentDays: emp.summary.absentDays,
        leaveDays: emp.summary.leaveDays,
        allowedOffDays: report.rules.allowedOffDays,
        overtimeMinutes: days.reduce((s, d) => s + d.overtimeMinutes, 0),
        overtimeHours,
      },
      earnings,
      deductions,
      totalEarnings,
      totalDeductions,
      net: totalEarnings - totalDeductions,
      bonusStatus: emp.bonus.label,
      rules,
      days,
      payment: {
        ...(paymentStatus.get(emp.staffUserId) ?? {
          state: "kosong" as const,
          paidAmount: 0,
          unpaidAmount: 0,
          advanceOutstanding: 0,
          payments: [],
        }),
        thr: thrPaid
          .filter((t) => t.staffUserId === emp.staffUserId)
          .map((t) => ({ holidayName: t.holidayName, amount: t.amount, paidAt: t.createdAt.toISOString() })),
      },
    };
  });
}
