import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI splitFeePoolForDay — atomicity anti double-split fee pool.
//
// Skenario nyata: cron systemd 23:59 + manual "Finalisasi H-1" bersamaan →
// splitFeePoolForDay dipanggil 2x paralel. Sebelum fix: kedua pemanggil sama
// bacanya "belum finalized" → sama-sama insert splits → UNIQUE constraint
// `(date, staff_user_id)` reject pihak-kedua → transaction rollback → TIDAK
// ADA split sama sekali. Sesudah fix: klaim atomic via UPDATE bersyarat
// `finalizedAt IS NULL` → pihak-kalah return skipped, pihak-menang jalan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let outletId = "";
let splitFeePoolForDay: any;

const DATE = "2026-07-11";
const A = "user-race-fee-a";
const B = "user-race-fee-b";

async function addStaff(userId: string, name: string, minutes: number) {
  const d = t.getDb();
  const { schema } = t;
  await d.insert(schema.user).values({ id: userId, name, email: `${userId}@garage.local` });
  await d.insert(schema.staffProfiles).values({ userId, outletId, role: "Barista", status: "active" });
  await d.insert(schema.staffAttendanceV2).values({
    staffUserId: userId,
    date: DATE,
    checkinAt: new Date(`${DATE}T09:00:00+07:00`),
    checkoutAt: new Date(`${DATE}T23:00:00+07:00`),
    workedMinutes: minutes,
    lateMinutes: 0,
    overtimeMinutes: 0,
    status: "valid",
  });
}

async function splitRowCount(): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.feePoolSplits)
    .where(eq(t.schema.feePoolSplits.date, DATE));
  return rows.length;
}

async function totalSplit(): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.feePoolSplits)
    .where(eq(t.schema.feePoolSplits.date, DATE));
  return rows.reduce((s: number, r: any) => s + r.amount, 0);
}

beforeAll(async () => {
  process.env.PAYROLL_V2_ENABLED = "true";
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: "user-seed-fee" });
  outletId = seeded.outletId;

  await addStaff(A, "Barista A", 480); // 8 jam
  await addStaff(B, "Barista B", 480); // 8 jam

  // Pool Rp 60.000 (300 produk × 200)
  await t.getDb().insert(t.schema.feePoolDaily).values({
    date: DATE,
    poolAmount: 60_000,
    productCount: 300,
    feePerProduct: 200,
  });

  const svc = await import("@/lib/garage-fee-pool");
  splitFeePoolForDay = svc.splitFeePoolForDay;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("splitFeePoolForDay — anti double-split (cron race)", () => {
  it("BUKTI ATOMIC: 5 pemanggilan bersamaan → TEPAT 2 baris split (A & B), TIDAK ADA duplikat", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => splitFeePoolForDay(DATE)),
    );

    // Hanya satu pemanggilan yang benar-benar melakukan split.
    const doneSplit = results.filter(
      (r: any) => r.finalized && r.skipped === undefined && r.splits.length > 0,
    );
    expect(doneSplit.length).toBe(1);
    expect(doneSplit[0].splits.length).toBe(2);

    // Sisanya harus return skipped (either already_finalized atau no_pool_row-tapi ada).
    const skipped = results.filter((r: any) => r.skipped === "already_finalized");
    expect(skipped.length).toBe(4);

    // Yang terpenting: tepat 2 baris split (A + B), TIDAK dobel.
    expect(await splitRowCount()).toBe(2);
    // Total split = pool (Rp 60.000).
    expect(await totalSplit()).toBe(60_000);
  });

  it("pemanggilan berikutnya juga skip (idempoten)", async () => {
    const res = await splitFeePoolForDay(DATE);
    expect(res.skipped).toBe("already_finalized");
    expect(await splitRowCount()).toBe(2);
    expect(await totalSplit()).toBe(60_000);
  });
});
