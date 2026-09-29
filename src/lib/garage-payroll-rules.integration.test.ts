import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI Payroll V2 — aturan gaji Garage (opt-in via payroll_settings):
//   - potongan telat Rp1.000/menit, hangus bila telat >= 30 menit
//   - lembur HANYA Sabtu, flat Rp3.000/jam, dibulatkan per jam penuh (ke bawah)
//   - fee per kepala: tiap staff berhak dapat PENUH (bukan pool dibagi)
//   - excludeFromFee per-orang (mis. jaga malam) tidak dapat fee
// Aturan lama (bracket persen, split proporsional) tetap default bila setting
// tak diisi — diuji terpisah di garage-payroll-cron.integration.test.ts.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let creditDailyWage: any;
let splitFeePoolForDay: any;
let setPayrollSetting: any;

const SAT = "2026-07-11"; // Sabtu
const MON = "2026-07-13"; // Senin

async function addWageStaff(
  userId: string,
  dailyWage: number,
  opts: { excludeFromFee?: boolean; role?: string } = {},
) {
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({ id: userId, name: userId, email: `${userId}@garage.id` });
  await d
    .insert(schema.staffProfiles)
    .values({ userId, outletId, role: opts.role ?? "Kasir", status: "active" });
  await d.insert(schema.staffWageConfig).values({
    staffUserId: userId,
    dailyWage,
    overtimeHourly: 3000,
    excludeFromFee: opts.excludeFromFee ?? false,
  });
}

async function addValidAttendance(userId: string, date: string, workedMinutes: number) {
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.staffAttendanceV2).values({
    staffUserId: userId,
    date,
    checkinAt: new Date(`${date}T09:00:00+07:00`),
    checkoutAt: new Date(`${date}T23:00:00+07:00`),
    workedMinutes,
    lateMinutes: 0,
    overtimeMinutes: 0,
    status: "valid",
  });
}

async function credit(
  userId: string,
  date: string,
  lateMinutes: number,
  overtimeMinutes: number,
): Promise<number> {
  const res = await creditDailyWage({
    staffUserId: userId,
    date,
    attendanceId: `att-${userId}-${date}`,
    lateMinutes,
    overtimeMinutes,
    status: "valid",
  });
  return res.totalCredited;
}

async function walletFee(userId: string): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.feePoolSplits)
    .where(eq(t.schema.feePoolSplits.staffUserId, userId));
  return rows.reduce((s: number, r: any) => s + r.amount, 0);
}

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: "user-seed" });
  outletId = seeded.outletId;

  const wage = await import("@/lib/garage-daily-wage");
  creditDailyWage = wage.creditDailyWage;
  const fee = await import("@/lib/garage-fee-pool");
  splitFeePoolForDay = fee.splitFeePoolForDay;
  const settings = await import("@/lib/garage-payroll-settings");
  setPayrollSetting = settings.setPayrollSetting;

  // Aktifkan aturan Garage (opt-in) lewat DB settings.
  await setPayrollSetting("late.penalty", {
    mode: "per_minute",
    perMinute: 1000,
    cutoffMinutes: 30,
  });
  await setPayrollSetting("overtime", {
    enabled: true,
    startHour: 23,
    startMinute: 0,
    autoFromWage: false,
    flatHourlyRate: 3000,
    paidWeekdays: [6], // hanya Sabtu
    roundMode: "hour", // per jam penuh (ke bawah)
    maxHoursPerDay: 4,
  });
  await setPayrollSetting("fee.pool", {
    enabled: true,
    perProduct: 100,
    splitMode: "per_head",
    fallbackMode: "hangus",
    minMinutes: 60,
    excludePromo: true,
    excludeRoles: [],
  });
  await setPayrollSetting("general", {
    ...(settings.PAYROLL_DEFAULTS[settings.PAYROLL_KEYS.general] as Record<string, unknown>),
    weeklyOffDays: [], // toko buka setiap hari
    requireMinCheckout: false,
  });
  await setPayrollSetting("bonus.attendance", {
    enabled: true,
    amount: 50_000,
    allowLateOnce: false,
    lateGraceMinutes: 0,
    allowedOffDays: 2,
  });
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Wallet Gaji — potongan telat per menit + cutoff", () => {
  it("telat 10 menit → gaji dipotong Rp1.000 × 10 = Rp10.000", async () => {
    await addWageStaff("w-late10", 60_000);
    expect(await credit("w-late10", MON, 10, 0)).toBe(50_000);
  });

  it("telat tepat 30 menit → gaji hari itu hangus (Rp0)", async () => {
    await addWageStaff("w-late30", 60_000);
    expect(await credit("w-late30", MON, 30, 0)).toBe(0);
  });

  it("telat 45 menit → tetap Rp0", async () => {
    await addWageStaff("w-late45", 60_000);
    expect(await credit("w-late45", MON, 45, 0)).toBe(0);
  });

  it("tepat waktu → gaji penuh", async () => {
    await addWageStaff("w-ontime", 60_000);
    expect(await credit("w-ontime", MON, 0, 0)).toBe(60_000);
  });
});

describe("Wallet Gaji — lembur hanya Sabtu, flat per jam penuh", () => {
  it("Sabtu lembur 90 menit → +Rp3.000 (1 jam penuh)", async () => {
    await addWageStaff("w-sat90", 60_000);
    expect(await credit("w-sat90", SAT, 0, 90)).toBe(63_000);
  });

  it("Sabtu lembur 150 menit → +Rp6.000 (2 jam penuh)", async () => {
    await addWageStaff("w-sat150", 60_000);
    expect(await credit("w-sat150", SAT, 0, 150)).toBe(66_000);
  });

  it("Senin lembur 90 menit → TIDAK dihitung (Rp0 lembur)", async () => {
    await addWageStaff("w-mon90", 60_000);
    expect(await credit("w-mon90", MON, 0, 90)).toBe(60_000);
  });
});

describe("Wallet Fee — per kepala (bukan pool dibagi) + excludeFromFee", () => {
  const FEE = "2026-07-14";

  it("tiap staff berhak dapat fee PENUH; jaga malam dikecualikan", async () => {
    await addWageStaff("fee-a", 60_000);
    await addWageStaff("fee-b", 60_000);
    await addWageStaff("fee-jaga", 60_000, { excludeFromFee: true });
    await addValidAttendance("fee-a", FEE, 840);
    await addValidAttendance("fee-b", FEE, 420);
    await addValidAttendance("fee-jaga", FEE, 840);

    // 50 produk × Rp100 = Rp5.000 per kepala.
    await t.getDb().insert(t.schema.feePoolDaily).values({
      date: FEE,
      poolAmount: 5_000,
      productCount: 50,
      feePerProduct: 100,
    });

    const res = await splitFeePoolForDay(FEE);
    expect(res.finalized).toBe(true);

    // Per kepala: A & B dapat penuh Rp5.000 (bukan dibagi), jaga malam Rp0.
    expect(await walletFee("fee-a")).toBe(5_000);
    expect(await walletFee("fee-b")).toBe(5_000);
    expect(await walletFee("fee-jaga")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bonus kehadiran bulanan: Rp50.000, libur maks 2 hari, telat sekali = gugur.
// ---------------------------------------------------------------------------

const JUNE = "2026-06";

async function addBonusStaff(userId: string) {
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({
    id: userId,
    name: userId,
    email: `${userId}@garage.id`,
    createdAt: new Date("2026-06-01T08:00:00+07:00"),
  });
  await d.insert(schema.staffProfiles).values({ userId, outletId, role: "Kasir", status: "active" });
  await d.insert(schema.staffWageConfig).values({ staffUserId: userId, dailyWage: 60_000 });
}

async function addJuneAttendance(userId: string, skipDays: number[], lateOnDay?: number) {
  const values = [];
  for (let day = 1; day <= 30; day++) {
    if (skipDays.includes(day)) continue;
    const date = `${JUNE}-${String(day).padStart(2, "0")}`;
    values.push({
      staffUserId: userId,
      date,
      checkinAt: new Date(`${date}T09:00:00+07:00`),
      checkoutAt: new Date(`${date}T23:00:00+07:00`),
      workedMinutes: 840,
      lateMinutes: day === lateOnDay ? 1 : 0,
      overtimeMinutes: 0,
      status: "valid",
    });
  }
  await t.getDb().insert(t.schema.staffAttendanceV2).values(values);
}

async function wageRows(userId: string, date: string) {
  const { and, eq } = await import("drizzle-orm");
  return t
    .getDb()
    .select()
    .from(t.schema.staffDailyWages)
    .where(
      and(
        eq(t.schema.staffDailyWages.staffUserId, userId),
        eq(t.schema.staffDailyWages.date, date),
      ),
    );
}

describe("Bonus kehadiran bulanan", () => {
  it("libur 2 hari (jatah) → tetap dapat Rp50.000", async () => {
    const { creditMonthlyAttendanceBonus } = await import("@/lib/garage-daily-wage");
    await addBonusStaff("bonus-ok");
    await addJuneAttendance("bonus-ok", [10, 20]);
    const res = await creditMonthlyAttendanceBonus("bonus-ok", JUNE);
    expect(res).toMatchObject({ credited: true, amount: 50_000 });
  });

  it("tidak hadir 3 hari → bonus gugur", async () => {
    const { creditMonthlyAttendanceBonus } = await import("@/lib/garage-daily-wage");
    await addBonusStaff("bonus-absent");
    await addJuneAttendance("bonus-absent", [5, 10, 20]);
    const res = await creditMonthlyAttendanceBonus("bonus-absent", JUNE);
    expect(res).toMatchObject({ credited: false, reason: "too_many_absent" });
  });

  it("telat 1 menit sekali saja → bonus gugur", async () => {
    const { creditMonthlyAttendanceBonus } = await import("@/lib/garage-daily-wage");
    await addBonusStaff("bonus-late");
    await addJuneAttendance("bonus-late", [], 15);
    const res = await creditMonthlyAttendanceBonus("bonus-late", JUNE);
    expect(res).toMatchObject({ credited: false, reason: "too_many_late" });
  });

  it("idempoten: bonus tidak dikredit dua kali", async () => {
    const { creditMonthlyAttendanceBonus } = await import("@/lib/garage-daily-wage");
    const res = await creditMonthlyAttendanceBonus("bonus-ok", JUNE);
    expect(res).toMatchObject({ credited: false, reason: "already_credited" });
  });

  it("gaji harian di hari terakhir bulan tetap masuk bersama bonus", async () => {
    await credit("bonus-ok", `${JUNE}-30`, 0, 0);
    const rows = await wageRows("bonus-ok", `${JUNE}-30`);
    const total = rows.reduce((s: number, r: any) => s + r.totalCredited, 0);
    expect(rows).toHaveLength(2);
    expect(total).toBe(60_000 + 50_000);
  });
});

describe("Rekap bulanan owner", () => {
  it("status bonus, hadir/tidak hadir, dan total gaji sesuai mesin gaji", async () => {
    const { getMonthlyReport } = await import("@/lib/garage-payroll-report");
    const report = await getMonthlyReport(JUNE, new Date("2026-07-15T10:00:00+07:00"));
    const byId = new Map(report.employees.map((e) => [e.staffUserId, e]));

    const ok = byId.get("bonus-ok")!;
    expect(ok.bonus.status).toBe("dapat");
    expect(ok.summary).toMatchObject({ presentDays: 28, absentDays: 2, bonus: 50_000 });
    expect(ok.summary.gaji).toBe(60_000 + 50_000); // gaji harian 30 Jun + bonus
    expect(ok.days.find((d) => d.date === `${JUNE}-10`)?.status).toBe("tidak_hadir");

    expect(byId.get("bonus-absent")!.bonus).toMatchObject({ status: "gugur", label: "Gugur: tidak hadir 3 hari" });
    expect(byId.get("bonus-late")!.bonus).toMatchObject({ status: "gugur", label: "Gugur: pernah telat" });
    expect(byId.get("bonus-late")!.summary).toMatchObject({ lateDays: 1, lateMinutes: 1 });

    // Akun tanpa konfigurasi gaji (akun sistem) tidak ikut rekap.
    expect(byId.has("user-seed")).toBe(false);
    expect(report.rules).toMatchObject({ allowedOffDays: 2, bonusAmount: 50_000, bonusEnabled: true });
  });
});

// ---------------------------------------------------------------------------
// Identitas absen terpisah: KODE + PIN (bukan akun sistem).
// ---------------------------------------------------------------------------

async function addAbsenEmployee(userId: string, code: string, pin: string) {
  const { hashPin } = await import("@/lib/attendance");
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({ id: userId, name: `Nama ${code}`, email: `${userId}@absen.test` });
  await d.insert(schema.staffProfiles).values({
    userId,
    outletId,
    role: "Kasir",
    position: "Barista",
    status: "active",
    pinHash: hashPin(pin),
  });
  await d
    .insert(schema.staffWageConfig)
    .values({ staffUserId: userId, dailyWage: 66_667, absenCode: code });
}

describe("Login absen KODE + PIN", () => {
  it("kode (huruf kecil pun) + PIN benar → identitas karyawan", async () => {
    const { resolveAbsenEmployee } = await import("@/lib/garage-absen");
    await addAbsenEmployee("absen-ok", "TST1", "246810");
    const emp = await resolveAbsenEmployee({ code: " tst1 ", pin: "246810", ip: "10.0.0.1" });
    expect(emp).toMatchObject({ staffUserId: "absen-ok", code: "TST1", dailyWage: 66_667 });
  });

  it("PIN salah dan kode tak dikenal → pesan sama (tidak bocorkan kode valid)", async () => {
    const { resolveAbsenEmployee } = await import("@/lib/garage-absen");
    const wrongPin = resolveAbsenEmployee({ code: "TST1", pin: "111111", ip: "10.0.0.2" });
    await expect(wrongPin).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const unknown = resolveAbsenEmployee({ code: "NOPE", pin: "111111", ip: "10.0.0.3" });
    await expect(unknown).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("8x PIN salah → kode terkunci, PIN benar pun ditolak", async () => {
    const { resolveAbsenEmployee } = await import("@/lib/garage-absen");
    await addAbsenEmployee("absen-lock", "LOCK1", "135790");
    for (let i = 0; i < 8; i++) {
      await expect(
        resolveAbsenEmployee({ code: "LOCK1", pin: "000001", ip: `10.1.0.${i}` }),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    await expect(
      resolveAbsenEmployee({ code: "LOCK1", pin: "135790", ip: "10.2.0.1" }),
    ).rejects.toMatchObject({ code: "LOCKED" });
  });
});

// ---------------------------------------------------------------------------
// Finalisasi tertunda (tanpa penjadwal): dipicu saat karyawan membuka /absen.
// ---------------------------------------------------------------------------

describe("finalizePendingPayrollDays", () => {
  const DAY = "2026-08-04";
  const NOW = new Date("2026-08-05T10:00:00+07:00");

  it("memproses hari kemarin: lupa check-out → Rp0, fee per kepala terbagi", async () => {
    const { eq } = await import("drizzle-orm");
    const { finalizePendingPayrollDays } = await import("@/lib/garage-payroll-cron");
    await addWageStaff("pend-forgot", 60_000);
    await addWageStaff("pend-valid", 60_000);
    const d = t.getDb();
    await d.insert(t.schema.staffAttendanceV2).values({
      staffUserId: "pend-forgot",
      date: DAY,
      checkinAt: new Date(`${DAY}T09:00:00+07:00`),
      status: "pending",
    });
    await addValidAttendance("pend-valid", DAY, 600);
    await d
      .insert(t.schema.feePoolDaily)
      .values({ date: DAY, poolAmount: 1_000, productCount: 10, feePerProduct: 100 });

    const results = await finalizePendingPayrollDays(NOW, 3);
    expect(results.map((r) => r.date)).toEqual([DAY]);

    const [forgot] = await d
      .select()
      .from(t.schema.staffAttendanceV2)
      .where(eq(t.schema.staffAttendanceV2.staffUserId, "pend-forgot"));
    expect(forgot.status).toBe("invalid");
    expect((await wageRows("pend-forgot", DAY))[0].totalCredited).toBe(0);
    expect((await wageRows("pend-valid", DAY))[0].totalCredited).toBe(60_000);
    expect(await walletFee("pend-valid")).toBe(1_000);
    expect(await walletFee("pend-forgot")).toBe(0);
  });

  it("panggilan berikutnya tidak memproses ulang", async () => {
    const { finalizePendingPayrollDays } = await import("@/lib/garage-payroll-cron");
    expect(await finalizePendingPayrollDays(NOW, 3)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Kelola karyawan absen dari layar owner.
// ---------------------------------------------------------------------------

describe("Kelola karyawan absen", () => {
  const actor = () => ({ name: "Owner Test", outletId });

  it("tambah karyawan: gaji harian = bulanan ÷ 30, PIN langsung bisa login", async () => {
    const { createAbsenEmployee, listAbsenEmployees } = await import("@/lib/garage-absen-employees");
    const { resolveAbsenEmployee } = await import("@/lib/garage-absen");
    const res = await createAbsenEmployee(
      { code: "bar9", name: "Siti", position: "Barista", monthlySalary: 2_100_000, shiftStart: null },
      actor(),
    );
    expect(res.code).toBe("BAR9");
    expect(res.pin).toMatch(/^\d{6}$/);
    const emp = await resolveAbsenEmployee({ code: "BAR9", pin: res.pin, ip: "10.9.0.1" });
    expect(emp).toMatchObject({ name: "Siti", dailyWage: 70_000 });
    const listed = (await listAbsenEmployees()).find((e) => e.code === "BAR9");
    expect(listed).toMatchObject({ monthlySalary: 2_100_000, shiftStart: null, active: true, hasPin: true });
  });

  it("kode yang sudah dipakai ditolak", async () => {
    const { createAbsenEmployee } = await import("@/lib/garage-absen-employees");
    await expect(
      createAbsenEmployee({ code: "BAR9", name: "Lain", monthlySalary: 1_500_000 }, actor()),
    ).rejects.toMatchObject({ code: "CODE_TAKEN" });
  });

  it("ubah nama, gaji, jam masuk, fee; nonaktif → tidak bisa absen", async () => {
    const { updateAbsenEmployee, listAbsenEmployees, resetAbsenPin } = await import(
      "@/lib/garage-absen-employees"
    );
    const { resolveAbsenEmployee } = await import("@/lib/garage-absen");
    await updateAbsenEmployee(
      "bar9",
      { name: "Siti Aminah", monthlySalary: 2_400_000, shiftStart: "13:30", excludeFromFee: true },
      actor(),
    );
    const listed = (await listAbsenEmployees()).find((e) => e.code === "BAR9");
    expect(listed).toMatchObject({
      name: "Siti Aminah",
      monthlySalary: 2_400_000,
      dailyWage: 80_000,
      shiftStart: "13:30",
      excludeFromFee: true,
    });

    const { pin } = await resetAbsenPin("BAR9", actor());
    await updateAbsenEmployee("BAR9", { active: false }, actor());
    await expect(resolveAbsenEmployee({ code: "BAR9", pin, ip: "10.9.0.2" })).rejects.toMatchObject({
      code: "INACTIVE",
    });
  });

  it("reset PIN: PIN lama tidak berlaku, PIN baru berlaku; tercatat di audit tanpa PIN", async () => {
    const { eq } = await import("drizzle-orm");
    const { createAbsenEmployee, resetAbsenPin } = await import("@/lib/garage-absen-employees");
    const { resolveAbsenEmployee } = await import("@/lib/garage-absen");
    const { pin: oldPin } = await createAbsenEmployee(
      { code: "WTR9", name: "Budi", monthlySalary: 1_500_000 },
      actor(),
    );
    const { pin: newPin } = await resetAbsenPin("WTR9", actor());
    await expect(resolveAbsenEmployee({ code: "WTR9", pin: oldPin, ip: "10.9.0.3" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect((await resolveAbsenEmployee({ code: "WTR9", pin: newPin, ip: "10.9.0.4" })).name).toBe("Budi");

    const logs = await t
      .getDb()
      .select()
      .from(t.schema.auditLogs)
      .where(eq(t.schema.auditLogs.object, "absen:WTR9"));
    expect(logs.map((l: any) => l.action).sort()).toEqual([
      "absen_employee_create",
      "absen_employee_reset_pin",
    ]);
    const metadata = JSON.stringify(logs.map((l: any) => l.metadata));
    expect(metadata).not.toContain(newPin);
    expect(metadata).not.toContain(oldPin);
  });
});

// ---------------------------------------------------------------------------
// Shift malam (Jaga Malam masuk 23:00) & checkout lewat tengah malam.
// ---------------------------------------------------------------------------

async function addShiftStaff(userId: string, pin: string, shiftStartMinutes: number | null) {
  const { hashPin } = await import("@/lib/attendance");
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({ id: userId, name: userId, email: `${userId}@absen.test` });
  await d
    .insert(schema.staffProfiles)
    .values({ userId, outletId, role: "Waiter", status: "active", pinHash: hashPin(pin) });
  await d
    .insert(schema.staffWageConfig)
    .values({ staffUserId: userId, dailyWage: 60_000, overtimeHourly: 3000, shiftStartMinutes });
}

const at = (iso: string) => new Date(`${iso}+07:00`);

describe("Shift malam & lintas tengah malam", () => {
  it("jaga malam check-in 23:10 → telat 10 mnt, tanggal shift hari itu", async () => {
    const { checkinV2 } = await import("@/lib/garage-attendance-v2");
    await addShiftStaff("jaga-a", "112233", 23 * 60);
    const res = await checkinV2({ staffUserId: "jaga-a", pin: "112233", method: "pin", now: at("2026-07-20T23:10:00") });
    expect(res).toMatchObject({ dateKey: "2026-07-20", lateMinutes: 10 });
  });

  it("check-out keesokan pagi menutup shift kemarin: valid, tanpa lembur", async () => {
    const { checkoutV2 } = await import("@/lib/garage-attendance-v2");
    const res = await checkoutV2({ staffUserId: "jaga-a", pin: "112233", method: "pin", now: at("2026-07-21T07:00:00") });
    expect(res).toMatchObject({ dateKey: "2026-07-20", status: "valid", workedMinutes: 470, overtimeMinutes: 0 });
  });

  it("check-in 00:20 → milik shift kemarin, telat 80 mnt", async () => {
    const { checkinV2 } = await import("@/lib/garage-attendance-v2");
    await addShiftStaff("jaga-b", "445566", 23 * 60);
    const res = await checkinV2({ staffUserId: "jaga-b", pin: "445566", method: "pin", now: at("2026-07-21T00:20:00") });
    expect(res).toMatchObject({ dateKey: "2026-07-20", lateMinutes: 80 });
  });

  it("karyawan biasa, Sabtu checkout 00:30 Minggu → lembur 90 mnt = Rp3.000 (1 jam penuh)", async () => {
    const { checkinV2, checkoutV2 } = await import("@/lib/garage-attendance-v2");
    await addShiftStaff("sat-late", "778899", null);
    await checkinV2({ staffUserId: "sat-late", pin: "778899", method: "pin", now: at("2026-07-18T09:00:00") });
    const out = await checkoutV2({ staffUserId: "sat-late", pin: "778899", method: "pin", now: at("2026-07-19T00:30:00") });
    expect(out).toMatchObject({ dateKey: "2026-07-18", overtimeMinutes: 90 });
    expect(await credit("sat-late", "2026-07-18", 0, out.overtimeMinutes)).toBe(63_000);
  });

  it("finalisasi TIDAK menghanguskan shift malam yang masih berjalan", async () => {
    const { eq } = await import("drizzle-orm");
    const { checkinV2 } = await import("@/lib/garage-attendance-v2");
    const { finalizePayrollDay } = await import("@/lib/garage-payroll-cron");
    await addShiftStaff("jaga-c", "990011", 23 * 60);
    await checkinV2({ staffUserId: "jaga-c", pin: "990011", method: "pin", now: at("2026-07-22T23:00:00") });
    await finalizePayrollDay("2026-07-22", at("2026-07-23T06:00:00"));
    const [row] = await t
      .getDb()
      .select()
      .from(t.schema.staffAttendanceV2)
      .where(eq(t.schema.staffAttendanceV2.staffUserId, "jaga-c"));
    expect(row.status).toBe("pending");
    expect(await wageRows("jaga-c", "2026-07-22")).toHaveLength(0);
  });
});
