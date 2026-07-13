import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI creditDailyWage — atomicity anti double-credit gaji.
//
// Skenario nyata: cron systemd 23:59 + tombol "Finalisasi H-1" di UI ditekan
// owner bersamaan → creditDailyWage untuk staff yang sama dipanggil 2x.
// Sebelum fix: pola read-check-insert bisa lolos guard idempoten dan
// menghasilkan 2 baris → staff dibayar DOBEL.
// Sesudah fix: onConflictDoNothing pada UNIQUE (staff_user_id, date) →
// hanya 1 request yang menang, sisanya `skipped: already_credited_race`.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let creditDailyWage: any;

const DATE = "2026-07-10";
const STAFF = "user-race-barista";

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: "user-seed-race" });
  outletId = seeded.outletId;

  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({
    id: STAFF,
    name: "Barista Race",
    email: `${STAFF}@garage.local`,
  });
  await d.insert(schema.staffProfiles).values({
    userId: STAFF,
    outletId,
    role: "Barista",
    status: "active",
  });
  await d.insert(schema.staffWageConfig).values({
    staffUserId: STAFF,
    dailyWage: 100_000,
  });
  await d.insert(schema.staffAttendanceV2).values({
    staffUserId: STAFF,
    date: DATE,
    checkinAt: new Date(`${DATE}T09:00:00+07:00`),
    checkoutAt: new Date(`${DATE}T23:00:00+07:00`),
    workedMinutes: 840,
    lateMinutes: 0,
    overtimeMinutes: 0,
    status: "valid",
  });

  const svc = await import("@/lib/garage-daily-wage");
  creditDailyWage = svc.creditDailyWage;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function walletTotal(): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.staffDailyWages)
    .where(eq(t.schema.staffDailyWages.staffUserId, STAFF));
  return rows.reduce((s: number, r: any) => s + r.totalCredited, 0);
}

async function rowCount(): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.staffDailyWages)
    .where(eq(t.schema.staffDailyWages.staffUserId, STAFF));
  return rows.length;
}

describe("creditDailyWage — anti double-credit gaji (cron race)", () => {
  const input = () => ({
    staffUserId: STAFF,
    date: DATE,
    attendanceId: "att-race",
    lateMinutes: 0,
    overtimeMinutes: 0,
    status: "valid",
  });

  it("kredit tunggal jalan normal", async () => {
    const res = await creditDailyWage(input());
    expect(res.skipped).toBeFalsy();
    expect(res.totalCredited).toBe(100_000);
    expect(await walletTotal()).toBe(100_000);
    expect(await rowCount()).toBe(1);
  });

  it("panggilan kedua di-skip (guard idempoten)", async () => {
    const res = await creditDailyWage(input());
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("already_credited");
    expect(await walletTotal()).toBe(100_000);
    expect(await rowCount()).toBe(1);
  });

  it("BUKTI ATOMIC: 5 kredit bersamaan dari nol → tepat 1 baris, tidak dobel", async () => {
    // Bersihkan dulu supaya test ini independen dari test sebelumnya.
    const { eq } = await import("drizzle-orm");
    await t
      .getDb()
      .delete(t.schema.staffDailyWages)
      .where(eq(t.schema.staffDailyWages.staffUserId, STAFF));

    const results = await Promise.all(
      Array.from({ length: 5 }, () => creditDailyWage(input())),
    );
    const nonSkipped = results.filter((r) => !r.skipped).length;

    // Salah satu saja yang benar-benar menulis row. Yang lain harus skip
    // (baik lewat guard idempoten baca-dulu, atau lewat ON CONFLICT race).
    expect(nonSkipped).toBeLessThanOrEqual(1);
    expect(await rowCount()).toBe(1); // ini yang terpenting: TIDAK ADA baris dobel
    expect(await walletTotal()).toBe(100_000);
  });
});
