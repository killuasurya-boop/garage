import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI slip gaji: rincian penerimaan/potongan harus cocok dengan mesin gaji
// (penerimaan − potongan = gaji dikredit + fee) dan PDF terbentuk.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const MONTH = "2026-05";
const NOW = new Date("2026-06-10T10:00:00+07:00"); // Mei sudah selesai

async function addEmployee(userId: string, code: string, monthly: number) {
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({
    id: userId,
    name: `Karyawan ${code}`,
    email: `${userId}@absen.test`,
    createdAt: new Date("2026-05-01T08:00:00+07:00"),
  });
  await d.insert(schema.staffProfiles).values({ userId, outletId, role: "Waiter", position: "Barista", status: "active" });
  await d.insert(schema.staffWageConfig).values({
    staffUserId: userId,
    absenCode: code,
    monthlySalary: monthly,
    dailyWage: Math.round(monthly / 30),
    overtimeHourly: 3000,
  });
}

async function workDay(userId: string, day: number, late: number, fee = 0) {
  const { creditDailyWage } = await import("@/lib/garage-daily-wage");
  const date = `${MONTH}-${String(day).padStart(2, "0")}`;
  const [row] = await t
    .getDb()
    .insert(t.schema.staffAttendanceV2)
    .values({
      staffUserId: userId,
      date,
      checkinAt: new Date(new Date(`${date}T09:00:00+07:00`).getTime() + late * 60_000),
      checkoutAt: new Date(`${date}T23:00:00+07:00`),
      workedMinutes: 840,
      lateMinutes: late,
      status: "valid",
    })
    .returning();
  await creditDailyWage({ staffUserId: userId, date, attendanceId: row.id, lateMinutes: late, overtimeMinutes: 0, status: "valid" });
  if (fee) {
    await t.getDb().insert(t.schema.feePoolSplits).values({ date, staffUserId: userId, minutesWorked: 840, sharePct: 100, amount: fee });
  }
}

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: "user-seed" })).outletId;
  const settings = await import("@/lib/garage-payroll-settings");
  await settings.setPayrollSetting("late.penalty", { mode: "per_minute", perMinute: 1000, cutoffMinutes: 30 });
  await settings.setPayrollSetting("general", {
    ...(settings.PAYROLL_DEFAULTS[settings.PAYROLL_KEYS.general] as Record<string, unknown>),
    weeklyOffDays: [],
  });
  await settings.setPayrollSetting("bonus.attendance", {
    enabled: true,
    amount: 50_000,
    allowLateOnce: false,
    lateGraceMinutes: 0,
    allowedOffDays: 2,
  });

  await addEmployee("slip-a", "SLA", 1_800_000); // Rp60.000/hari
  // 30 hari hadir kecuali: tgl 2 telat 10 mnt, tgl 3 telat 35 mnt (hangus), tgl 5 & 6 tidak hadir.
  for (let day = 1; day <= 31; day++) {
    if (day === 5 || day === 6) continue;
    await workDay("slip-a", day, day === 2 ? 10 : day === 3 ? 35 : 0, day === 1 ? 12_000 : 0);
  }
  await addEmployee("slip-b", "SLB", 1_500_000);
  await workDay("slip-b", 4, 0);
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("buildPayslips", () => {
  it("rincian penerimaan & potongan sesuai aturan, dan cocok dengan gaji dikredit", async () => {
    const { buildPayslips } = await import("@/lib/garage-payslip");
    const { getMonthlyReport } = await import("@/lib/garage-payroll-report");
    const [slip] = await buildPayslips(MONTH, { staffUserId: "slip-a" }, NOW);

    expect(slip.slipNo).toBe("SG-202605-SLA");
    expect(slip.provisional).toBe(false);
    expect(slip.periodLabel).toBe("Mei 2026");
    expect(slip.employee).toMatchObject({ monthlySalary: 1_800_000, dailyWage: 60_000 });
    // Telat = semua hari telat (termasuk yang hangus); hangus = subset.
    expect(slip.attendance).toMatchObject({ presentDays: 29, lateDays: 2, lateMinutes: 45, forfeitedDays: 1, absentDays: 2 });

    const byLabel = (lines: any[], label: string) => lines.find((l) => l.label === label);
    expect(byLabel(slip.earnings, "Upah harian")).toMatchObject({ detail: "29 hari × Rp60.000", amount: 29 * 60_000 });
    expect(byLabel(slip.earnings, "Fee produk").amount).toBe(12_000);
    expect(byLabel(slip.deductions, "Potongan telat")).toMatchObject({ amount: 10_000 });
    expect(byLabel(slip.deductions, "Upah hangus")).toMatchObject({ amount: 60_000 });

    const report = await getMonthlyReport(MONTH, NOW);
    const recap = report.employees.find((e) => e.staffUserId === "slip-a")!;
    expect(slip.net).toBe(recap.summary.gaji + recap.summary.fee);
    expect(slip.net).toBe(29 * 60_000 - 10_000 - 60_000 + 12_000);
    expect(slip.totalEarnings - slip.totalDeductions).toBe(slip.net);
  });

  it("slip bulan berjalan ditandai sementara", async () => {
    const { buildPayslips } = await import("@/lib/garage-payslip");
    const [slip] = await buildPayslips(MONTH, { staffUserId: "slip-a" }, new Date("2026-05-20T10:00:00+07:00"));
    expect(slip.provisional).toBe(true);
  });

  it("PDF: 2 halaman per slip; gabungan semua karyawan dalam satu file", async () => {
    const { buildPayslips } = await import("@/lib/garage-payslip");
    const { renderPayslipsPdf } = await import("@/lib/garage-payslip-pdf");
    const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

    const one = await renderPayslipsPdf(await buildPayslips(MONTH, { staffUserId: "slip-a" }, NOW));
    expect(one.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(one)).toBe(2);

    const all = await buildPayslips(MONTH, {}, NOW);
    expect(all.map((s) => s.employee.code).sort()).toEqual(["SLA", "SLB"]);
    expect(pages(await renderPayslipsPdf(all))).toBe(4);
  });
});

describe("validatePayslipMonth", () => {
  it("tolak format salah, bulan depan, dan terlalu lama", async () => {
    const { validatePayslipMonth } = await import("@/lib/garage-payslip-http");
    const now = new Date("2026-09-24T10:00:00+07:00");
    expect(validatePayslipMonth("2026-09", now).ok).toBe(true);
    expect(validatePayslipMonth("2026-10", now).ok).toBe(false);
    expect(validatePayslipMonth("2026-9", now).ok).toBe(false);
    expect(validatePayslipMonth("2025-08", now, 12).ok).toBe(false);
    expect(validatePayslipMonth("2025-09", now, 12).ok).toBe(true);
  });
});
