import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// Audit POS Nov 2026: sinkron poin terminal tidak boleh menambah poin dua kali untuk struk yang
// sama, walau server restart (kunci anti-dobel disimpan di DB, bukan di memori).

let t: GarageTestDb;
let member: typeof import("@/lib/member-service");

const PHONE_A = "081377700001";
const PHONE_B = "081377700002";

async function pointsOf(phone: string) {
  const res = await t.getDb().execute(`select points, visits from customers where phone = '${phone}'` as never);
  const rows = ((res as { rows?: unknown[] }).rows ?? res) as Array<{ points: number; visits: number }>;
  return rows[0];
}

async function txCount(phone: string) {
  const res = await t
    .getDb()
    .execute(
      `select count(*)::int as n from member_transactions mt join customers c on c.id = mt.customer_id where c.phone = '${phone}' and mt.source = 'POS'` as never,
    );
  const rows = ((res as { rows?: unknown[] }).rows ?? res) as Array<{ n: number }>;
  return rows[0].n;
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: "user-itest-sync-points" });
  await t.getDb().insert(t.schema.customers).values([
    { name: "Member Sync A", phone: PHONE_A, tier: "Silver" },
    { name: "Member Sync B", phone: PHONE_B, tier: "Silver" },
  ]);
  member = await import("@/lib/member-service");
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("syncPosTransaction — anti-dobel durable", () => {
  it("kirim ulang dengan kunci sama: poin & kunjungan hanya bertambah sekali", async () => {
    const before = await pointsOf(PHONE_A);
    const input = { memberPhone: PHONE_A, totalAmount: 100_000, requestKey: "pos-sync:T1:struk-0001" };
    const first = await member.syncPosTransaction(input);
    expect(first.data?.pointsEarned).toBeGreaterThan(0);
    expect(first.data?.replayed).toBe(false);

    const second = await member.syncPosTransaction(input);
    expect(second.data?.replayed).toBe(true);
    expect(second.data?.pointsEarned).toBe(first.data?.pointsEarned);
    expect(second.data?.totalPoints).toBe(first.data?.totalPoints);

    const after = await pointsOf(PHONE_A);
    expect(after.points).toBe(before.points + (first.data?.pointsEarned ?? 0));
    expect(after.visits).toBe(before.visits + 1);
    expect(await txCount(PHONE_A)).toBe(1);
  });

  it("kiriman bersamaan dengan kunci sama tetap tercatat sekali", async () => {
    const input = { memberPhone: PHONE_A, totalAmount: 50_000, requestKey: "pos-sync:T1:struk-0002" };
    const results = await Promise.all([member.syncPosTransaction(input), member.syncPosTransaction(input)]);
    expect(results.every((r) => r.data)).toBe(true);
    expect(await txCount(PHONE_A)).toBe(2);
  });

  it("kunci yang sudah dipakai member lain ditolak tanpa menambah poin", async () => {
    const before = await pointsOf(PHONE_B);
    const res = await member.syncPosTransaction({
      memberPhone: PHONE_B,
      totalAmount: 100_000,
      requestKey: "pos-sync:T1:struk-0001",
    });
    expect(res.data).toBeNull();
    expect(res.error).toBe(member.SYNC_KEY_CONFLICT_ERROR);
    expect((await pointsOf(PHONE_B)).points).toBe(before.points);
  });

  it("kunci berbeda = struk berbeda → poin bertambah lagi", async () => {
    const before = await pointsOf(PHONE_B);
    const res = await member.syncPosTransaction({
      memberPhone: PHONE_B,
      totalAmount: 100_000,
      requestKey: "pos-sync:T1:struk-0003",
    });
    expect(res.data?.replayed).toBe(false);
    expect((await pointsOf(PHONE_B)).points).toBe(before.points + (res.data?.pointsEarned ?? 0));
  });
});
