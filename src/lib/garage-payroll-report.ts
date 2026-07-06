// Payroll V2 — laporan bulanan agregat per staff + role.

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  feePoolDaily,
  feePoolSplits,
  staffAttendanceV2,
  staffDailyWages,
  staffProfiles,
  user,
} from "@/db/schema";

export interface MonthlyReportRow {
  staffUserId: string;
  name: string;
  role: string;
  validDays: number;
  lateDays: number;
  absentDays: number;
  totalGaji: number;
  totalFee: number;
  totalOvertime: number;
}

export async function getMonthlyReport(monthKey: string): Promise<{
  month: string;
  rows: MonthlyReportRow[];
  totals: { gaji: number; fee: number; overtime: number };
  poolDays: number;
  poolAmount: number;
}> {
  const [yyyy, mm] = monthKey.split("-");
  const start = `${yyyy}-${mm}-01`;
  const endMonth = Number(mm) === 12 ? 1 : Number(mm) + 1;
  const endYear = Number(mm) === 12 ? Number(yyyy) + 1 : Number(yyyy);
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT
      u.id AS staff_user_id,
      u.name AS name,
      sp.role AS role,
      (SELECT COUNT(*) FROM ${staffAttendanceV2} sa WHERE sa.staff_user_id = u.id AND sa.date >= ${start} AND sa.date < ${end} AND sa.status = 'valid') AS valid_days,
      (SELECT COUNT(*) FROM ${staffAttendanceV2} sa WHERE sa.staff_user_id = u.id AND sa.date >= ${start} AND sa.date < ${end} AND sa.late_minutes > 15) AS late_days,
      (SELECT COUNT(*) FROM ${staffAttendanceV2} sa WHERE sa.staff_user_id = u.id AND sa.date >= ${start} AND sa.date < ${end} AND sa.status = 'invalid') AS absent_days,
      (SELECT COALESCE(SUM(sdw.total_credited), 0) FROM ${staffDailyWages} sdw WHERE sdw.staff_user_id = u.id AND sdw.date >= ${start} AND sdw.date < ${end}) AS total_gaji,
      (SELECT COALESCE(SUM(fps.amount + fps.bonus_target + fps.bonus_zero_komplain), 0) FROM ${feePoolSplits} fps WHERE fps.staff_user_id = u.id AND fps.date >= ${start} AND fps.date < ${end}) AS total_fee,
      (SELECT COALESCE(SUM(sdw.overtime_amount), 0) FROM ${staffDailyWages} sdw WHERE sdw.staff_user_id = u.id AND sdw.date >= ${start} AND sdw.date < ${end}) AS total_overtime
    FROM ${user} u
    INNER JOIN ${staffProfiles} sp ON sp.user_id = u.id
    WHERE sp.status = 'active'
    ORDER BY u.name ASC
  `)).rows as unknown as Array<Record<string, string | number>>;

  const norm: MonthlyReportRow[] = rows.map((r) => ({
    staffUserId: String(r.staff_user_id),
    name: String(r.name),
    role: String(r.role),
    validDays: Number(r.valid_days ?? 0),
    lateDays: Number(r.late_days ?? 0),
    absentDays: Number(r.absent_days ?? 0),
    totalGaji: Number(r.total_gaji ?? 0),
    totalFee: Number(r.total_fee ?? 0),
    totalOvertime: Number(r.total_overtime ?? 0),
  }));

  const poolAgg = (await db.execute(sql`
    SELECT COUNT(*) AS days, COALESCE(SUM(pool_amount), 0) AS total_pool
    FROM ${feePoolDaily}
    WHERE date >= ${start} AND date < ${end}
  `)).rows as unknown as Array<{ days: number; total_pool: number }>;

  return {
    month: monthKey,
    rows: norm,
    totals: {
      gaji: norm.reduce((s, r) => s + r.totalGaji, 0),
      fee: norm.reduce((s, r) => s + r.totalFee, 0),
      overtime: norm.reduce((s, r) => s + r.totalOvertime, 0),
    },
    poolDays: Number(poolAgg[0]?.days ?? 0),
    poolAmount: Number(poolAgg[0]?.total_pool ?? 0),
  };
}
