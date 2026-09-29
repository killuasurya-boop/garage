import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Laporan "Order per sumber" (orders.campaign) untuk modul Marketing.
let t: GarageTestDb;
let outletId = "";

beforeAll(async () => {
  t = await setupGarageTestDb();
  const seeded = await seedGarageBasics(t, { userId: "user-itest-campaign" });
  outletId = seeded.outletId;
}, 120_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function insertOrder(orderNo: string, campaign: string | null, status: string, total: number, extra: Record<string, unknown> = {}) {
  const [row] = await t
    .getDb()
    .insert(t.schema.orders)
    .values({
      orderNo,
      outletId,
      tableLabel: "Take away",
      channel: "QR Table",
      status,
      subtotal: total,
      service: 0,
      tax: 0,
      total,
      campaign,
      ...extra,
    })
    .returning();
  return row;
}

describe("getOrdersByCampaign", () => {
  it("mengelompokkan per sumber, omzet hanya order lunas, anak split bill tidak dihitung", async () => {
    const parent = await insertOrder("CMP-1", "bio_ig", "paid", 50_000);
    await insertOrder("CMP-1-2", "bio_ig", "paid", 20_000, { parentOrderId: parent.id });
    await insertOrder("CMP-2", "bio_ig", "pending_cashier", 30_000);
    await insertOrder("CMP-3", "mobile_bar", "paid", 15_000);
    await insertOrder("CMP-4", null, "paid", 10_000);
    await insertOrder("CMP-OLD", "bio_ig", "paid", 99_000, { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });

    const { getOrdersByCampaign } = await import("@/lib/garage-marketing-service");
    const report = await getOrdersByCampaign(30);
    const byCampaign = Object.fromEntries(report.rows.map((row) => [row.campaign, row]));

    expect(byCampaign.bio_ig).toMatchObject({ orders: 2, paidOrders: 1, revenue: 50_000 });
    expect(byCampaign.mobile_bar).toMatchObject({ orders: 1, paidOrders: 1, revenue: 15_000 });
    expect(byCampaign["(tanpa sumber)"]).toMatchObject({ orders: 1, revenue: 10_000 });
    expect(report.rows[0].campaign).toBe("bio_ig");
  });
});
