import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// INTEGRASI redeemMemberPoints — memastikan fix atomic (AUDIT MEDIUM-HIGH).
// Sebelumnya: read-check-write tanpa transaction → TOCTOU race, double-spend.
// Sekarang: UPDATE ... WHERE points >= X → hanya satu request menang, saldo
// tidak pernah negatif, tidak ada uang hilang.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let redeemMemberPoints: any;

async function makeCustomer(startingPoints: number, suffix: string) {
  const d = t.getDb();
  const [row] = await d
    .insert(t.schema.customers)
    .values({
      name: `Test ${suffix}`,
      phone: `08${Math.floor(Math.random() * 1e10)}`,
      tier: "Silver",
      cardTier: "Silver",
      points: startingPoints,
      memberCode: `M-${suffix}-${Date.now()}`,
      referralCode: `R-${suffix}-${Date.now()}`,
    })
    .returning();
  return row.id as string;
}

async function pointsOf(id: string): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select({ points: t.schema.customers.points })
    .from(t.schema.customers)
    .where(eq(t.schema.customers.id, id));
  return row.points as number;
}

async function redemptionRows(id: string): Promise<number> {
  const { eq } = await import("drizzle-orm");
  const rows = await t
    .getDb()
    .select()
    .from(t.schema.pointRedemptions)
    .where(eq(t.schema.pointRedemptions.customerId, id));
  return rows.length;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  const svc = await import("@/lib/member-service");
  redeemMemberPoints = svc.redeemMemberPoints;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("redeemMemberPoints — atomic (anti double-spend)", () => {
  it("redeem sukses saat saldo cukup", async () => {
    const id = await makeCustomer(500, "ok");
    const res = await redeemMemberPoints({ customerId: id, pointsToRedeem: 100 });
    expect(res.error).toBeNull();
    expect(res.data.totalPoints).toBe(400);
    expect(await pointsOf(id)).toBe(400);
    expect(await redemptionRows(id)).toBe(1);
  });

  it("tolak saat saldo kurang (tanpa mengurangi apa pun)", async () => {
    const id = await makeCustomer(50, "kurang");
    const res = await redeemMemberPoints({ customerId: id, pointsToRedeem: 100 });
    expect(res.error).toMatch(/tidak cukup/i);
    expect(await pointsOf(id)).toBe(50);
    expect(await redemptionRows(id)).toBe(0);
  });

  it("tolak saat customer tidak ada", async () => {
    const res = await redeemMemberPoints({
      customerId: "00000000-0000-0000-0000-000000000000",
      pointsToRedeem: 100,
    });
    expect(res.error).toMatch(/tidak ditemukan/i);
  });

  it("tolak kelipatan salah", async () => {
    const id = await makeCustomer(500, "bad");
    const res = await redeemMemberPoints({ customerId: id, pointsToRedeem: 150 });
    expect(res.error).toMatch(/kelipatan 100/i);
    expect(await pointsOf(id)).toBe(500);
  });

  it("BUKTI ATOMIC: 5 redeem 100pt bersamaan dari saldo 300pt → tepat 3 sukses, sisa 0, TIDAK MINUS", async () => {
    const id = await makeCustomer(300, "race");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        redeemMemberPoints({ customerId: id, pointsToRedeem: 100 }),
      ),
    );
    const okCount = results.filter((r) => !r.error).length;
    const failCount = results.filter((r) => !!r.error).length;

    expect(okCount).toBe(3); // tepat 3 kali sukses (300 / 100)
    expect(failCount).toBe(2); // 2 sisanya ditolak
    expect(await pointsOf(id)).toBe(0); // saldo TIDAK negatif
    expect(await redemptionRows(id)).toBe(3); // hanya baris redeem valid
  });

  it("BUKTI ATOMIC: 10 redeem 100pt bersamaan dari saldo 500pt → tepat 5 sukses", async () => {
    const id = await makeCustomer(500, "race2");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        redeemMemberPoints({ customerId: id, pointsToRedeem: 100 }),
      ),
    );
    const okCount = results.filter((r) => !r.error).length;
    expect(okCount).toBe(5);
    expect(await pointsOf(id)).toBe(0);
  });
});
