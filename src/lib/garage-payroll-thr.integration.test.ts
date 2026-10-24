import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI THR, potongan tetap bulanan (BPJS), dan cek UMK.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const NOW = new Date("2027-03-01T10:00:00+07:00");
const id = (code: string) => `payroll-${code.toLowerCase()}`;

function session(role: Role): GarageSession {
  return {
    user: { id: "user-seed", name: `${role} Test`, email: "user-seed@garage.id" },
    profile: {
      id: "sp-user-seed",
      role,
      shiftLabel: "Pagi",
      deviceLabel: "Kantor",
      passwordResetRequired: false,
      outlet: { id: outletId, code: "TST", name: "Outlet Test", timezone: "Asia/Jakarta" },
    },
  } as unknown as GarageSession;
}
const manajer = () => session("Manajer" as Role);

async function employee(code: string, monthly: number, joinDate: string | null, monthlyDeduction = 0) {
  const { createAbsenEmployee } = await import("@/lib/garage-absen-employees");
  await createAbsenEmployee({ code, name: `Nama ${code}`, monthlySalary: monthly, joinDate, monthlyDeduction }, { name: "Owner", outletId });
}

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: "user-seed" })).outletId;
  await employee("LAMA", 2_000_000, "2025-01-10"); // > 12 bulan
  await employee("BARU", 1_800_000, "2026-09-15"); // 5 bulan penuh s/d 2027-03-10
  await employee("CUTI", 1_500_000, "2027-02-20"); // < 1 bulan
  await employee("BPJS", 1_800_000, "2026-01-01", 50_000);
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Rumus THR", () => {
  it("bulan penuh & besaran", async () => {
    const { fullMonthsBetween, thrAmount } = await import("@/lib/garage-payroll-thr");
    expect(fullMonthsBetween("2026-09-15", "2027-03-10")).toBe(5);
    expect(fullMonthsBetween("2026-09-15", "2027-03-15")).toBe(6);
    expect(fullMonthsBetween("2027-03-15", "2027-03-10")).toBe(0);
    expect(thrAmount(0, 2_000_000)).toBe(0);
    expect(thrAmount(5, 1_800_000)).toBe(750_000);
    expect(thrAmount(12, 2_000_000)).toBe(2_000_000);
    expect(thrAmount(30, 2_000_000)).toBe(2_000_000);
  });
});

describe("Bayar THR", () => {
  const HOLIDAY = { holidayName: "Idul Fitri 2027", holidayDate: "2027-03-10" };

  it("daftar THR per karyawan", async () => {
    const { getThrList } = await import("@/lib/garage-payroll-thr");
    const rows = await getThrList(HOLIDAY.holidayDate);
    const row = (code: string) => rows.find((r) => r.code === code)!;
    expect(row("LAMA")).toMatchObject({ monthsWorked: 26, amount: 2_000_000, joinEstimated: false, paid: null });
    expect(row("BARU")).toMatchObject({ monthsWorked: 5, amount: 750_000 });
    expect(row("CUTI")).toMatchObject({ monthsWorked: 0, amount: 0 });
  });

  it("bayar: tercatat ke Finance kategori THR (grup payroll), tidak bisa dua kali", async () => {
    const { eq } = await import("drizzle-orm");
    const { getThrList, payThr } = await import("@/lib/garage-payroll-thr");
    const res = await payThr({ code: "baru", ...HOLIDAY, method: "Cash" }, manajer(), NOW);
    expect(res).toMatchObject({ amount: 750_000, monthsWorked: 5, expenseStatus: "recorded" });

    const [exp] = await t.getDb().select().from(t.schema.expenses).where(eq(t.schema.expenses.description, "THR Idul Fitri 2027 Nama BARU"));
    expect(exp).toMatchObject({ category: "THR Karyawan", amount: 750_000 });
    const { financeExpenseCategories } = await import("@/db/schema-finance");
    const [cat] = await t.getDb().select().from(financeExpenseCategories).where(eq(financeExpenseCategories.name, "THR Karyawan"));
    expect(cat.groupKey).toBe("payroll");

    await expect(payThr({ code: "BARU", ...HOLIDAY, method: "Cash" }, manajer(), NOW)).rejects.toMatchObject({ code: "ALREADY_PAID" });
    await expect(payThr({ code: "CUTI", ...HOLIDAY, method: "Cash" }, manajer(), NOW)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect((await getThrList(HOLIDAY.holidayDate)).find((r) => r.code === "BARU")!.paid).toMatchObject({ amount: 750_000 });
  });

  it("≥ batas approval → Approvals; ditolak → THR batal & bisa dibayar lagi", async () => {
    const { eq } = await import("drizzle-orm");
    const { payThr, getThrList } = await import("@/lib/garage-payroll-thr");
    const { rejectExpense } = await import("@/lib/garage-service");
    const res = await payThr({ code: "LAMA", ...HOLIDAY, method: "Transfer" }, manajer(), NOW);
    expect(res.expenseStatus).toBe("pending_approval");
    const [row] = await t.getDb().select().from(t.schema.staffThrPayments).where(eq(t.schema.staffThrPayments.id, res.id));
    await rejectExpense(row.expenseId!, manajer());
    const [after] = await t.getDb().select().from(t.schema.staffThrPayments).where(eq(t.schema.staffThrPayments.id, res.id));
    expect(after.status).toBe("cancelled");
    expect((await getThrList(HOLIDAY.holidayDate)).find((r) => r.code === "LAMA")!.paid).toBeNull();
  });

  it("batalkan THR (salah input): pengeluaran dibatalkan, laci kasir tidak tersentuh", async () => {
    const { eq } = await import("drizzle-orm");
    const { cancelThr, getThrHistory } = await import("@/lib/garage-payroll-thr");
    const paid = (await getThrHistory()).find((h) => h.code === "BARU" && h.status === "paid")!;
    const [cashBefore] = await t.getDb().select().from(t.schema.cashSessions);
    await cancelThr(paid.id, "Salah nominal", manajer(), NOW);
    const [cashAfter] = await t.getDb().select().from(t.schema.cashSessions);
    // Buku kas (owner, Okt 2026): THR tunai dibayar dari uang Owner, bukan laci shift
    // orang lain → laci tidak berubah saat dibayar maupun dibatalkan.
    expect(cashAfter.expectedCash - cashBefore.expectedCash).toBe(0);
    const [exp] = await t.getDb().select().from(t.schema.expenses).where(eq(t.schema.expenses.description, "THR Idul Fitri 2027 Nama BARU"));
    expect(exp.status).toBe("cancelled");
    await expect(cancelThr(paid.id, "lagi", manajer(), NOW)).rejects.toMatchObject({ code: "ALREADY_CANCELLED" });
  });
});

describe("Potongan tetap bulanan (BPJS)", () => {
  async function wages(code: string, days: Array<[string, number]>) {
    await t
      .getDb()
      .insert(t.schema.staffDailyWages)
      .values(days.map(([date, total]) => ({ staffUserId: id(code), date, baseWage: total, totalCredited: total })));
  }

  it("dipotong di akhir bulan, dibatasi gaji bulan itu, dihitung ulang, tampil di slip", async () => {
    const { and, eq } = await import("drizzle-orm");
    const { applyMonthlyFixedDeduction, MONTHLY_DEDUCTION_SOURCE } = await import("@/lib/garage-daily-wage");
    const deductionRow = async () =>
      (
        await t
          .getDb()
          .select()
          .from(t.schema.staffDailyWages)
          .where(and(eq(t.schema.staffDailyWages.staffUserId, id("BPJS")), eq(t.schema.staffDailyWages.source, MONTHLY_DEDUCTION_SOURCE)))
      )[0];

    // Hanya 1 hari kerja (Rp 30.000) → potongan dibatasi Rp 30.000.
    await wages("BPJS", [["2027-01-05", 30_000]]);
    expect(await applyMonthlyFixedDeduction(id("BPJS"), "2027-01")).toMatchObject({ applied: true, amount: 30_000 });
    expect(await deductionRow()).toMatchObject({ date: "2027-01-31", totalCredited: -30_000 });

    // Koreksi menambah gaji → dihitung ulang penuh Rp 50.000 (tidak dobel).
    await wages("BPJS", [["2027-01-06", 60_000]]);
    expect(await applyMonthlyFixedDeduction(id("BPJS"), "2027-01")).toMatchObject({ amount: 50_000 });
    const rows = await t
      .getDb()
      .select()
      .from(t.schema.staffDailyWages)
      .where(and(eq(t.schema.staffDailyWages.staffUserId, id("BPJS")), eq(t.schema.staffDailyWages.source, MONTHLY_DEDUCTION_SOURCE)));
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCredited).toBe(-50_000);

    // Tanpa potongan dikonfigurasi → tidak ada baris.
    expect(await applyMonthlyFixedDeduction(id("LAMA"), "2027-01")).toMatchObject({ applied: false, reason: "not_configured" });

    const { buildPayslips } = await import("@/lib/garage-payslip");
    const [slip] = await buildPayslips("2027-01", { staffUserId: id("BPJS") }, NOW);
    expect(slip.deductions.find((d) => d.label === "Potongan tetap (BPJS)")).toMatchObject({ amount: 50_000 });
  });

  it("gajian: sisa yang hanya potongan tidak menghasilkan pembayaran negatif", async () => {
    const { eq } = await import("drizzle-orm");
    const { payEmployee } = await import("@/lib/garage-payroll-payments");
    // Bayar semua gaji harian dulu (tandai lunas), sisakan baris potongan saja.
    const { MONTHLY_DEDUCTION_SOURCE } = await import("@/lib/garage-daily-wage");
    const rows = await t.getDb().select().from(t.schema.staffDailyWages).where(eq(t.schema.staffDailyWages.staffUserId, id("BPJS")));
    for (const r of rows.filter((x: any) => x.source !== MONTHLY_DEDUCTION_SOURCE)) {
      await t.getDb().update(t.schema.staffDailyWages).set({ payoutId: "00000000-0000-0000-0000-000000000009" }).where(eq(t.schema.staffDailyWages.id, r.id));
    }
    await expect(payEmployee({ code: "BPJS", until: "2027-01-31", method: "Cash" }, manajer(), NOW)).rejects.toMatchObject({
      code: "NOTHING_TO_PAY",
    });
  });
});

describe("HP karyawan: THR & potongan", () => {
  it("dasbor absen menampilkan THR yang diterima dan baris potongan", async () => {
    const { payThr } = await import("@/lib/garage-payroll-thr");
    const { getAbsenDashboard } = await import("@/lib/garage-absen");
    await payThr({ code: "BPJS", holidayName: "Idul Adha 2027", holidayDate: "2027-05-17", method: "Cash" }, manajer(), NOW);
    const dash = await getAbsenDashboard(id("BPJS"));
    expect(dash.thr).toEqual([expect.objectContaining({ holidayName: "Idul Adha 2027", amount: 1_800_000 })]);
    expect(dash.wallet.gaji.entries.find((e) => e.kind === "potongan")).toMatchObject({ totalCredited: -50_000 });
  });
});

describe("Salinan backup di luar laptop", () => {
  it("disalin ke folder pilihan; folder hilang → gagal tercatat, backup lokal tetap jadi", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const s = await import("@/lib/garage-payroll-settings");
    const { createDbBackup, readOffsiteStatus } = await import("@/lib/garage-db-backup");
    const local = await fs.mkdtemp(path.join(os.tmpdir(), "garage-bk-local-"));
    const drive = await fs.mkdtemp(path.join(os.tmpdir(), "garage-bk-drive-"));
    process.env.GARAGE_BACKUP_DIR = local;
    try {
      await s.setPayrollSetting("backup", { copyToDir: drive });
      const b = await createDbBackup("manual", NOW);
      expect(b?.offsite).toMatchObject({ ok: true, dir: drive, file: b?.file });
      expect(await fs.readdir(drive)).toEqual([b!.file]);
      expect((await fs.stat(path.join(drive, b!.file))).size).toBe(b!.bytes);

      const gone = path.join(drive, "flashdisk-dicabut");
      await s.setPayrollSetting("backup", { copyToDir: gone });
      const b2 = await createDbBackup("manual", new Date(NOW.getTime() + 1_000));
      expect(b2?.offsite).toMatchObject({ ok: false, dir: gone });
      expect((await fs.readdir(local)).filter((f) => f.endsWith(".tar.gz"))).toHaveLength(2);
      expect(await readOffsiteStatus()).toMatchObject({ ok: false, dir: gone });

      const { getPayrollReadiness } = await import("@/lib/garage-payroll-readiness");
      const item = (await getPayrollReadiness(NOW)).items.find((i) => i.key === "offsite")!;
      expect(item.status).toBe("warn");
      expect(item.detail).toContain("GAGAL");
    } finally {
      delete process.env.GARAGE_BACKUP_DIR;
      await s.setPayrollSetting("backup", { copyToDir: "" });
      await fs.rm(local, { recursive: true, force: true });
      await fs.rm(drive, { recursive: true, force: true });
    }
  });
});

describe("Cek UMK", () => {
  it("belum diisi → peringatan; diisi → sebut karyawan di bawah UMK", async () => {
    const { getPayrollReadiness } = await import("@/lib/garage-payroll-readiness");
    const s = await import("@/lib/garage-payroll-settings");
    let item = (await getPayrollReadiness(NOW)).items.find((i) => i.key === "umk")!;
    expect(item).toMatchObject({ status: "warn" });
    expect(item.detail).toContain("belum diisi");

    await s.setPayrollSetting("umk", { amount: 1_900_000, region: "Kota Uji", year: 2027 });
    item = (await getPayrollReadiness(NOW)).items.find((i) => i.key === "umk")!;
    expect(item.status).toBe("warn");
    expect(item.detail).toContain("3 karyawan bergaji di bawah UMK");
    expect(item.detail).toContain("Nama CUTI");

    await s.setPayrollSetting("umk", { amount: 1_000_000, region: "Kota Uji", year: 2027 });
    item = (await getPayrollReadiness(NOW)).items.find((i) => i.key === "umk")!;
    expect(item.status).toBe("ok");
  });
});
