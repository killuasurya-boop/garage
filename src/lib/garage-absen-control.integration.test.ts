import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI kontrol absen manajer: papan hari ini, koreksi absen, izin/sakit.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
const actor = { userId: "user-seed", name: "Manajer Test" };
const at = (iso: string) => new Date(`${iso}+07:00`);
const pins = new Map<string, string>();

async function employee(code: string, monthly: number, shiftStart: string | null = null) {
  const { eq } = await import("drizzle-orm");
  const { createAbsenEmployee } = await import("@/lib/garage-absen-employees");
  const { pin } = await createAbsenEmployee(
    { code, name: `Nama ${code}`, monthlySalary: monthly, shiftStart },
    { name: "Owner", outletId },
  );
  pins.set(code, pin);
  await t
    .getDb()
    .update(t.schema.user)
    .set({ createdAt: at("2026-08-01T08:00:00") })
    .where(eq(t.schema.user.id, `payroll-${code.toLowerCase()}`));
}

async function wageRows(code: string, date: string) {
  const { and, eq } = await import("drizzle-orm");
  return t
    .getDb()
    .select()
    .from(t.schema.staffDailyWages)
    .where(
      and(
        eq(t.schema.staffDailyWages.staffUserId, `payroll-${code.toLowerCase()}`),
        eq(t.schema.staffDailyWages.date, date),
      ),
    );
}

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: "user-seed" })).outletId;
  const s = await import("@/lib/garage-payroll-settings");
  await s.setPayrollSetting("late.penalty", { mode: "per_minute", perMinute: 1000, cutoffMinutes: 30 });
  await s.setPayrollSetting("general", {
    ...(s.PAYROLL_DEFAULTS[s.PAYROLL_KEYS.general] as Record<string, unknown>),
    weeklyOffDays: [],
    requireMinCheckout: false,
  });
  await s.setPayrollSetting("fee.pool", {
    enabled: true,
    perProduct: 100,
    splitMode: "per_head",
    fallbackMode: "hangus",
    minMinutes: 60,
    excludePromo: true,
    excludeRoles: [],
  });
  await s.setPayrollSetting("bonus.attendance", {
    enabled: true,
    amount: 50_000,
    allowLateOnce: false,
    lateGraceMinutes: 0,
    allowedOffDays: 2,
  });

  await employee("BRD1", 1_800_000);
  await employee("BRD2", 1_800_000);
  await employee("BRD3", 1_800_000);
  await employee("BRD4", 1_800_000, "23:00");
  await employee("COR1", 1_800_000);
  await employee("NGT1", 1_800_000, "23:00");
  await employee("LV1", 1_800_000);
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Papan absen hari ini", () => {
  it("menampilkan sedang shift + telat, belum datang, sakit, dan belum jam masuk", async () => {
    const { checkinV2 } = await import("@/lib/garage-attendance-v2");
    const { addLeave, getTodayBoard } = await import("@/lib/garage-absen-control");
    const now = at("2026-09-10T09:25:00");
    await checkinV2({ staffUserId: "payroll-brd1", pin: pins.get("BRD1")!, method: "pin", now: at("2026-09-10T09:12:00") });
    await addLeave({ code: "BRD3", from: "2026-09-10", to: "2026-09-10", type: "sakit", reason: "demam" }, actor, now);

    const board = await getTodayBoard(now);
    const row = (code: string) => board.rows.find((r) => r.code === code)!;
    expect(row("BRD1")).toMatchObject({ state: "sedang_shift", lateMinutes: 12 });
    expect(row("BRD2")).toMatchObject({ state: "belum_datang", lateMinutes: 25 });
    expect(row("BRD3")).toMatchObject({ state: "sakit", leaveReason: "demam" });
    expect(row("BRD4")).toMatchObject({ state: "belum_waktunya", shiftStart: "23:00" });
  });
});

describe("Papan: selfie & HP yang sama (titip absen)", () => {
  it("menampilkan selfie dan menandai dua karyawan yang absen dari HP yang sama", async () => {
    const { deviceIdOf, getTodayBoard } = await import("@/lib/garage-absen-control");
    expect(deviceIdOf("dev:abc123def456 Mozilla/5.0")).toBe("abc123def456");
    expect(deviceIdOf("Mozilla/5.0 (Linux; Android 14)")).toBeNull();

    const at12 = at("2026-09-12T09:00:00");
    await t.getDb().insert(t.schema.staffAttendanceV2).values([
      {
        staffUserId: "payroll-brd1",
        date: "2026-09-12",
        checkinAt: at12,
        checkinDevice: "dev:sharedphone1 Mozilla/5.0",
        checkinSelfieUrl: "/api/attendance-v2/photo/2026-09-12/payroll-brd1-checkin.jpg",
        status: "pending",
      },
      {
        staffUserId: "payroll-brd2",
        date: "2026-09-12",
        checkinAt: at12,
        checkinDevice: "dev:sharedphone1 Mozilla/5.0",
        status: "pending",
      },
      {
        staffUserId: "payroll-brd3",
        date: "2026-09-12",
        checkinAt: at12,
        checkinDevice: "dev:ownphone0003 Mozilla/5.0",
        status: "pending",
      },
    ]);

    const board = await getTodayBoard(at("2026-09-12T10:00:00"));
    const row = (code: string) => board.rows.find((r) => r.code === code)!;
    expect(row("BRD1")).toMatchObject({
      checkinSelfieUrl: "/api/attendance-v2/photo/2026-09-12/payroll-brd1-checkin.jpg",
      sharedDeviceWith: ["Nama BRD2"],
    });
    expect(row("BRD2").sharedDeviceWith).toEqual(["Nama BRD1"]);
    expect(row("BRD3").sharedDeviceWith).toEqual([]);
    expect(board.summary.sharedDevice).toBe(2);
  });
});

describe("Selfie lama dihapus otomatis", () => {
  it("menghapus folder tanggal lebih lama dari masa simpan (min. 30 hari)", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { cleanupOldAttendancePhotos } = await import("@/lib/garage-absen-photos");
    const s = await import("@/lib/garage-payroll-settings");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "garage-photos-"));
    for (const d of ["2026-05-01", "2026-06-11", "2026-06-13", "2026-09-10", "bukan-tanggal"]) {
      await fs.mkdir(path.join(root, d));
      await fs.writeFile(path.join(root, d, "x.jpg"), "x");
    }
    await s.setPayrollSetting("security", { photoRetentionDays: 90 });
    // 2026-09-10 − 90 hari = 2026-06-12 → yang lebih lama dihapus.
    expect(await cleanupOldAttendancePhotos(at("2026-09-10T10:00:00"), root)).toEqual(["2026-05-01", "2026-06-11"]);
    expect((await fs.readdir(root)).sort()).toEqual(["2026-06-13", "2026-09-10", "bukan-tanggal"]);

    // Nilai terlalu kecil dibatasi minimal 30 hari.
    await s.setPayrollSetting("security", { photoRetentionDays: 1 });
    expect(await cleanupOldAttendancePhotos(at("2026-09-10T10:00:00"), root)).toEqual(["2026-06-13"]);
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe("Koreksi absen", () => {
  const NOW = at("2026-09-10T10:00:00");

  it("lupa check-out: jadi valid, gaji dengan potongan telat, fee per kepala ditambahkan", async () => {
    const { eq } = await import("drizzle-orm");
    const { checkinV2 } = await import("@/lib/garage-attendance-v2");
    const { splitFeePoolForDay } = await import("@/lib/garage-fee-pool");
    const { correctAttendance } = await import("@/lib/garage-absen-control");

    await checkinV2({ staffUserId: "payroll-cor1", pin: pins.get("COR1")!, method: "pin", now: at("2026-09-08T09:07:00") });
    await t.getDb().insert(t.schema.feePoolDaily).values({ date: "2026-09-08", poolAmount: 5_000, productCount: 50, feePerProduct: 100 });
    await splitFeePoolForDay("2026-09-08"); // COR1 masih pending → belum dapat fee

    const res = await correctAttendance(
      { code: "cor1", date: "2026-09-08", checkin: "09:07", checkout: "23:00", reason: "HP mati, dicek dari CCTV" },
      actor,
      NOW,
    );
    expect(res).toMatchObject({ status: "valid", lateMinutes: 7, wage: 53_000, fee: "added" });

    const splits = await t
      .getDb()
      .select()
      .from(t.schema.feePoolSplits)
      .where(eq(t.schema.feePoolSplits.staffUserId, "payroll-cor1"));
    expect(splits.map((s: any) => s.amount)).toEqual([5_000]);

    const audit = await t
      .getDb()
      .select()
      .from(t.schema.auditLogs)
      .where(eq(t.schema.auditLogs.object, "absen:COR1:2026-09-08"));
    expect(audit[0]).toMatchObject({ action: "absen_correction", actor: "Manajer Test" });
    expect((audit[0] as any).metadata.reason).toBe("HP mati, dicek dari CCTV");
  });

  it("koreksi ulang mengganti gaji hari itu (tidak dobel)", async () => {
    const { correctAttendance } = await import("@/lib/garage-absen-control");
    const res = await correctAttendance(
      { code: "COR1", date: "2026-09-08", checkin: "09:00", checkout: "23:00", reason: "Salah input jam masuk" },
      actor,
      NOW,
    );
    expect(res).toMatchObject({ lateMinutes: 0, wage: 60_000, fee: "unchanged" });
    const rows = await wageRows("COR1", "2026-09-08");
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCredited).toBe(60_000);
  });

  it("ditolak bila gaji hari itu sudah dibayar", async () => {
    const { eq } = await import("drizzle-orm");
    const { correctAttendance } = await import("@/lib/garage-absen-control");
    const [row] = await wageRows("COR1", "2026-09-08");
    await t
      .getDb()
      .update(t.schema.staffDailyWages)
      .set({ payoutId: "00000000-0000-0000-0000-000000000001" })
      .where(eq(t.schema.staffDailyWages.id, row.id));
    await expect(
      correctAttendance({ code: "COR1", date: "2026-09-08", checkin: "09:30", checkout: "23:00", reason: "Coba ubah lagi" }, actor, NOW),
    ).rejects.toMatchObject({ code: "ALREADY_PAID" });
  });

  it("tanggal masa depan & tanggal lama tanpa jam keluar ditolak", async () => {
    const { correctAttendance } = await import("@/lib/garage-absen-control");
    await expect(
      correctAttendance({ code: "BRD2", date: "2026-09-11", checkin: "09:00", checkout: "23:00", reason: "Masa depan" }, actor, NOW),
    ).rejects.toMatchObject({ code: "DATE_INVALID" });
    await expect(
      correctAttendance({ code: "BRD2", date: "2026-09-01", checkin: "09:00", checkout: null, reason: "Tanpa jam keluar" }, actor, NOW),
    ).rejects.toMatchObject({ code: "CHECKOUT_REQUIRED" });
  });

  it("shift malam 23:05 → 07:00 keesokan hari: telat 5 menit, valid", async () => {
    const { correctAttendance } = await import("@/lib/garage-absen-control");
    const res = await correctAttendance(
      { code: "NGT1", date: "2026-09-05", checkin: "23:05", checkout: "07:00", reason: "Lupa absen, dikonfirmasi" },
      actor,
      NOW,
    );
    expect(res).toMatchObject({ lateMinutes: 5, status: "valid", wage: 55_000 });
  });
});

describe("Izin / sakit / cuti", () => {
  const NOW = at("2026-09-10T10:00:00");

  it("izin tidak menggugurkan bonus & tampil di rekap", async () => {
    const { addLeave } = await import("@/lib/garage-absen-control");
    const { creditMonthlyAttendanceBonus } = await import("@/lib/garage-daily-wage");
    const { getMonthlyReport } = await import("@/lib/garage-payroll-report");

    const values = [];
    for (let day = 1; day <= 31; day++) {
      if ([12, 13, 14, 20].includes(day)) continue; // 12–14 sakit, 20 tidak hadir
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      values.push({
        staffUserId: "payroll-lv1",
        date,
        checkinAt: at(`${date}T09:00:00`),
        checkoutAt: at(`${date}T23:00:00`),
        workedMinutes: 840,
        lateMinutes: 0,
        status: "valid",
      });
    }
    await t.getDb().insert(t.schema.staffAttendanceV2).values(values);
    const leave = await addLeave({ code: "LV1", from: "2026-08-12", to: "2026-08-14", type: "sakit", reason: "tifus" }, actor, NOW);
    expect(leave.days).toBe(3);

    // 3 hari sakit tidak dihitung; 1 hari tidak hadir masih dalam jatah 2.
    expect(await creditMonthlyAttendanceBonus("payroll-lv1", "2026-08")).toMatchObject({ credited: true });

    const report = await getMonthlyReport("2026-08", NOW);
    const lv = report.employees.find((e) => e.staffUserId === "payroll-lv1")!;
    expect(lv.summary).toMatchObject({ leaveDays: 3, absentDays: 1 });
    expect(lv.days.find((d) => d.date === "2026-08-13")?.status).toBe("sakit");
  });

  it("tidak bisa izin di hari yang sudah absen; izin bisa dihapus", async () => {
    const { addLeave, removeLeave } = await import("@/lib/garage-absen-control");
    const { getMonthlyReport } = await import("@/lib/garage-payroll-report");
    await expect(
      addLeave({ code: "LV1", from: "2026-08-15", to: "2026-08-16", type: "izin", reason: "" }, actor, NOW),
    ).rejects.toMatchObject({ code: "ATTENDANCE_EXISTS" });

    await removeLeave({ code: "LV1", date: "2026-08-14" }, actor);
    const report = await getMonthlyReport("2026-08", NOW);
    const lv = report.employees.find((e) => e.staffUserId === "payroll-lv1")!;
    expect(lv.summary).toMatchObject({ leaveDays: 2, absentDays: 2 });
  });
});
