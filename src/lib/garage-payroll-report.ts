// Payroll V2 — rekap bulanan per karyawan payroll (bukan akun sistem).
// Status harian & bonus dihitung dengan aturan yang sama dengan mesin gaji
// (garage-daily-wage.ts) supaya angka rekap = angka yang dikredit.

import { and, eq, gt, gte, inArray, lte, sum } from "drizzle-orm";

import { getDb } from "@/db";
import {
  feePoolDaily,
  feePoolSplits,
  staffAttendanceV2,
  staffDailyWages,
  staffLeaves,
  staffProfiles,
  staffWageConfig,
  user,
} from "@/db/schema";
import { jakartaDateKey } from "@/lib/attendance";
import {
  DAILY_WAGE_SOURCE,
  MONTHLY_BONUS_SOURCE,
  monthDateKeys,
} from "@/lib/garage-daily-wage";
import { PAYROLL_KEYS, getPayrollSetting } from "@/lib/garage-payroll-settings";

export type RecapDayStatus =
  | "hadir"
  | "telat"
  | "hangus"
  | "tidak_valid"
  | "tidak_hadir"
  | "berjalan"
  | "belum_absen"
  | "libur"
  | "akan_datang"
  | "belum_terdaftar"
  | "izin"
  | "sakit"
  | "cuti";

export const LEAVE_TYPES = ["izin", "sakit", "cuti"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export interface RecapDay {
  date: string;
  status: RecapDayStatus;
  checkinAt: string | null;
  checkoutAt: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  wage: number;
  fee: number;
}

export interface RecapEmployee {
  staffUserId: string;
  code: string | null;
  name: string;
  position: string | null;
  active: boolean;
  dailyWage: number;
  shiftStart: string;
  excludeFromFee: boolean;
  summary: {
    presentDays: number;
    lateDays: number;
    lateMinutes: number;
    forfeitedDays: number;
    absentDays: number;
    leaveDays: number;
    base: number;
    overtime: number;
    bonus: number;
    gaji: number;
    fee: number;
    total: number;
  };
  bonus: { status: "dapat" | "gugur" | "berpeluang" | "nonaktif"; label: string };
  days: RecapDay[];
}

export interface MonthlyRecap {
  month: string;
  today: string;
  rules: { allowedOffDays: number; bonusAmount: number; bonusEnabled: boolean };
  totals: {
    base: number;
    overtime: number;
    bonus: number;
    gaji: number;
    fee: number;
    total: number;
    productsSold: number;
  };
  employees: RecapEmployee[];
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const weekdayOf = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

export async function getMonthlyReport(monthKey: string, now = new Date()): Promise<MonthlyRecap> {
  const db = getDb();
  const days = monthDateKeys(monthKey);
  const start = days[0];
  const end = days[days.length - 1];
  const today = jakartaDateKey(now);

  const [general, bonusCfg, employees] = await Promise.all([
    getPayrollSetting(PAYROLL_KEYS.general) as Promise<{
      openHour?: number;
      weeklyOffDays?: number[];
    } | null>,
    getPayrollSetting(PAYROLL_KEYS.bonusAttendance) as Promise<{
      enabled?: boolean;
      amount?: number;
      allowLateOnce?: boolean;
      lateGraceMinutes?: number;
      allowedOffDays?: number;
    } | null>,
    db
      .select({
        staffUserId: staffWageConfig.staffUserId,
        code: staffWageConfig.absenCode,
        dailyWage: staffWageConfig.dailyWage,
        shiftStartMinutes: staffWageConfig.shiftStartMinutes,
        excludeFromFee: staffWageConfig.excludeFromFee,
        name: user.name,
        createdAt: user.createdAt,
        position: staffProfiles.position,
        status: staffProfiles.status,
      })
      .from(staffWageConfig)
      .innerJoin(user, eq(user.id, staffWageConfig.staffUserId))
      .innerJoin(staffProfiles, eq(staffProfiles.userId, staffWageConfig.staffUserId))
      .where(gt(staffWageConfig.dailyWage, 0))
      .orderBy(staffWageConfig.absenCode, user.name),
  ]);

  const offDays = Array.isArray(general?.weeklyOffDays) ? general.weeklyOffDays : [];
  const allowedOffDays = bonusCfg?.allowedOffDays ?? 0;
  const lateGrace = bonusCfg?.lateGraceMinutes ?? 15;
  const allowedLateDays = bonusCfg?.allowLateOnce ? 1 : 0;
  const bonusEnabled = Boolean(bonusCfg?.enabled);
  const bonusAmount = bonusCfg?.amount ?? 0;
  const ids = employees.map((e) => e.staffUserId);

  const [attendance, wages, fees, products, leaves] = ids.length
    ? await Promise.all([
        db
          .select()
          .from(staffAttendanceV2)
          .where(
            and(
              inArray(staffAttendanceV2.staffUserId, ids),
              gte(staffAttendanceV2.date, start),
              lte(staffAttendanceV2.date, end),
            ),
          ),
        db
          .select()
          .from(staffDailyWages)
          .where(
            and(
              inArray(staffDailyWages.staffUserId, ids),
              gte(staffDailyWages.date, start),
              lte(staffDailyWages.date, end),
            ),
          ),
        db
          .select()
          .from(feePoolSplits)
          .where(
            and(
              inArray(feePoolSplits.staffUserId, ids),
              gte(feePoolSplits.date, start),
              lte(feePoolSplits.date, end),
            ),
          ),
        db
          .select({ total: sum(feePoolDaily.productCount) })
          .from(feePoolDaily)
          .where(and(gte(feePoolDaily.date, start), lte(feePoolDaily.date, end))),
        db
          .select({ staffUserId: staffLeaves.staffUserId, date: staffLeaves.date, type: staffLeaves.type })
          .from(staffLeaves)
          .where(
            and(
              inArray(staffLeaves.staffUserId, ids),
              gte(staffLeaves.date, start),
              lte(staffLeaves.date, end),
            ),
          ),
      ])
    : [[], [], [], [{ total: "0" }], []];

  const key = (staffUserId: string, date: unknown) => `${staffUserId}|${String(date)}`;
  const attByKey = new Map(attendance.map((a) => [key(a.staffUserId, a.date), a]));
  const dailyByKey = new Map(
    wages.filter((w) => w.source === DAILY_WAGE_SOURCE).map((w) => [key(w.staffUserId, w.date), w]),
  );
  const leaveByKey = new Map(leaves.map((l) => [key(l.staffUserId, l.date), l.type as LeaveType]));
  const feeByKey = new Map<string, number>();
  for (const f of fees) {
    const k = key(f.staffUserId, f.date);
    feeByKey.set(k, (feeByKey.get(k) ?? 0) + f.amount + f.bonusTarget + f.bonusZeroKomplain);
  }

  const recap: RecapEmployee[] = employees.map((emp) => {
    const startKey = jakartaDateKey(emp.createdAt);
    const empWages = wages.filter((w) => w.staffUserId === emp.staffUserId);
    const bonusRow = empWages.find((w) => w.source === MONTHLY_BONUS_SOURCE);

    const dayRows: RecapDay[] = days.map((date) => {
      const att = attByKey.get(key(emp.staffUserId, date));
      const daily = dailyByKey.get(key(emp.staffUserId, date));
      const fee = feeByKey.get(key(emp.staffUserId, date)) ?? 0;
      const late = att?.lateMinutes ?? 0;
      let status: RecapDayStatus;
      if (att?.status === "pending") status = "berjalan";
      else if (att?.status === "invalid") status = "tidak_valid";
      else if (att?.status === "valid") {
        status = daily && daily.totalCredited === 0 && late > 0 ? "hangus" : late > 0 ? "telat" : "hadir";
      } else if (leaveByKey.has(key(emp.staffUserId, date))) {
        status = leaveByKey.get(key(emp.staffUserId, date))!;
      } else if (date < startKey) status = "belum_terdaftar";
      else if (offDays.includes(weekdayOf(date))) status = "libur";
      else if (date < today) status = "tidak_hadir";
      else if (date === today) status = "belum_absen";
      else status = "akan_datang";
      return {
        date,
        status,
        checkinAt: att?.checkinAt ? att.checkinAt.toISOString() : null,
        checkoutAt: att?.checkoutAt ? att.checkoutAt.toISOString() : null,
        lateMinutes: late,
        overtimeMinutes: att?.overtimeMinutes ?? 0,
        wage: daily?.totalCredited ?? 0,
        fee,
      };
    });

    const valid = dayRows.filter((d) => d.status === "hadir" || d.status === "telat" || d.status === "hangus");
    const absentDays = dayRows.filter((d) => d.status === "tidak_hadir" || d.status === "tidak_valid").length;
    // Sama dengan creditMonthlyAttendanceBonus: hari telat = telat > grace.
    const bonusLateDays = attendance.filter(
      (a) => a.staffUserId === emp.staffUserId && (a.lateMinutes ?? 0) > lateGrace,
    ).length;

    const base = empWages
      .filter((w) => w.source === DAILY_WAGE_SOURCE)
      .reduce((s, w) => s + w.baseWage, 0);
    const overtime = empWages.reduce((s, w) => s + w.overtimeAmount, 0);
    const bonus = empWages
      .filter((w) => w.source === MONTHLY_BONUS_SOURCE)
      .reduce((s, w) => s + w.totalCredited, 0);
    const gaji = empWages.reduce((s, w) => s + w.totalCredited, 0);
    const fee = dayRows.reduce((s, d) => s + d.fee, 0);

    let bonusState: RecapEmployee["bonus"];
    if (bonusRow) bonusState = { status: "dapat", label: "Dapat bonus" };
    else if (!bonusEnabled) bonusState = { status: "nonaktif", label: "Bonus nonaktif" };
    else if (bonusLateDays > allowedLateDays) bonusState = { status: "gugur", label: "Gugur: pernah telat" };
    else if (absentDays > allowedOffDays)
      bonusState = { status: "gugur", label: `Gugur: tidak hadir ${absentDays} hari` };
    else if (end < today) bonusState = { status: "gugur", label: "Belum dikredit" };
    else
      bonusState = {
        status: "berpeluang",
        label: `Berpeluang · sisa jatah libur ${allowedOffDays - absentDays}`,
      };

    return {
      staffUserId: emp.staffUserId,
      code: emp.code,
      name: emp.name,
      position: emp.position,
      active: emp.status === "active",
      dailyWage: emp.dailyWage,
      shiftStart: hhmm(emp.shiftStartMinutes ?? (general?.openHour ?? 9) * 60),
      excludeFromFee: emp.excludeFromFee,
      summary: {
        presentDays: valid.length,
        lateDays: valid.filter((d) => d.lateMinutes > 0).length,
        lateMinutes: valid.reduce((s, d) => s + d.lateMinutes, 0),
        forfeitedDays: dayRows.filter((d) => d.status === "hangus").length,
        absentDays,
        leaveDays: dayRows.filter((d) => (LEAVE_TYPES as readonly string[]).includes(d.status)).length,
        base,
        overtime,
        bonus,
        gaji,
        fee,
        total: gaji + fee,
      },
      bonus: bonusState,
      days: dayRows,
    };
  });

  // Karyawan nonaktif hanya tampil di bulan yang masih ada absen/gaji/fee-nya.
  const visible = recap.filter(
    (e) =>
      e.active ||
      e.summary.presentDays > 0 ||
      e.summary.gaji > 0 ||
      e.summary.fee > 0 ||
      e.days.some((d) => d.status === "berjalan" || d.status === "tidak_valid"),
  );

  const totals = visible.reduce(
    (t, e) => ({
      base: t.base + e.summary.base,
      overtime: t.overtime + e.summary.overtime,
      bonus: t.bonus + e.summary.bonus,
      gaji: t.gaji + e.summary.gaji,
      fee: t.fee + e.summary.fee,
      total: t.total + e.summary.total,
      productsSold: t.productsSold,
    }),
    {
      base: 0,
      overtime: 0,
      bonus: 0,
      gaji: 0,
      fee: 0,
      total: 0,
      productsSold: Number(products[0]?.total ?? 0),
    },
  );

  return {
    month: monthKey,
    today,
    rules: { allowedOffDays, bonusAmount, bonusEnabled },
    totals,
    employees: visible,
  };
}
