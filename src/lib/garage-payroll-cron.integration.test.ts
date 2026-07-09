import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI Payroll V2 — alur cron finalisasi harian terhadap DB nyata (PGlite).
// Menguji aturan kunci: kredit gaji hanya utk absen valid, split fee pool
// proporsional jam (anti-rebutan), manajer tidak dapat fee, idempotensi cron.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let finalizePayrollDay: any;

const DATE = "2026-07-06";
const A = "user-barista-a";
const B = "user-barista-b";
const M = "user-manager";
const C = "user-barista-c"; // absen invalid

async function addStaff(userId: string, name: string, role: string) {
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({ id: userId, name, email: `${userId}@garage.local` });
  await d.insert(schema.staffProfiles).values({ userId, outletId, role, status: "active" });
  await d.insert(schema.staffWageConfig).values({ staffUserId: userId, dailyWage: 80_000 });
}

async function addAttendance(
  userId: string,
  workedMinutes: number,
  status: "valid" | "invalid",
  lateMinutes = 0,
) {
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.staffAttendanceV2).values({
    staffUserId: userId,
    date: DATE,
    checkinAt: new Date(`${DATE}T09:00:00+07:00`),
    checkoutAt: status === "valid" ? new Date(`${DATE}T23:00:00+07:00`) : null,
    workedMinutes,
    lateMinutes,
    overtimeMinutes: 0,
    status,
  });
}

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: "user-seed" });
  outletId = seeded.outletId;

  await addStaff(A, "Barista A", "Barista");
  await addStaff(B, "Barista B", "Barista");
  await addStaff(M, "Manajer", "Manager Operasional");
  await addStaff(C, "Barista C", "Barista");

  // A 14 jam valid, B 7 jam valid, M 14 jam valid, C invalid (lupa checkout).
  await addAttendance(A, 840, "valid");
  await addAttendance(B, 420, "valid");
  await addAttendance(M, 840, "valid");
  await addAttendance(C, 0, "invalid");

  // Pool fee harian: 300 produk × Rp200 = Rp60.000.
  await t.getDb().insert(t.schema.feePoolDaily).values({
    date: DATE,
    poolAmount: 60_000,
    productCount: 300,
    feePerProduct: 200,
  });

  const cron = await import("@/lib/garage-payroll-cron");
  finalizePayrollDay = cron.finalizePayrollDay;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function walletGaji(userId: string): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.staffDailyWages)
    .where(eq(t.schema.staffDailyWages.staffUserId, userId));
  return rows.reduce((s: number, r: any) => s + r.totalCredited, 0);
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

describe("finalizePayrollDay — kredit gaji + split fee pool", () => {
  it("menjalankan finalisasi tanpa error", async () => {
    const res = await finalizePayrollDay(DATE);
    expect(res.alreadyFinalized).toBe(false);
    expect(res.errors).toHaveLength(0);
    expect(res.staffValid).toBe(3); // A, B, M valid; C invalid
  });

  it("kredit gaji penuh untuk staff valid (tepat waktu)", async () => {
    expect(await walletGaji(A)).toBe(80_000);
    expect(await walletGaji(B)).toBe(80_000);
    expect(await walletGaji(M)).toBe(80_000);
  });

  it("staff absen invalid → Rp 0 (gaji & fee)", async () => {
    expect(await walletGaji(C)).toBe(0);
    expect(await walletFee(C)).toBe(0);
  });

  it("split fee pool proporsional jam kerja (anti-rebutan)", async () => {
    // Eligible: A (840m) + B (420m) = 1260m. Manajer M dikecualikan.
    // A = 840/1260 × 60.000 = 40.000 ; B = 420/1260 × 60.000 = 20.000
    expect(await walletFee(A)).toBe(40_000);
    expect(await walletFee(B)).toBe(20_000);
  });

  it("manajer TIDAK dapat fee pool (hanya gaji tetap)", async () => {
    expect(await walletFee(M)).toBe(0);
  });

  it("total split = pool (pembulatan tidak menghilangkan uang)", async () => {
    expect((await walletFee(A)) + (await walletFee(B))).toBe(60_000);
  });

  it("idempoten: finalisasi ulang tidak double-credit", async () => {
    const res2 = await finalizePayrollDay(DATE);
    expect(res2.alreadyFinalized).toBe(true);
    expect(await walletGaji(A)).toBe(80_000); // tetap, tidak dobel
    expect(await walletFee(A)).toBe(40_000);
  });
});
