import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Fase 5 (owner 25 Nov 2026): terlaris & "sering dibeli bersama" hanya dari order LUNAS outlet sendiri,
// komponen Paket Event tidak dihitung, order lama di luar jendela tidak dihitung.

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let insights: typeof import("@/lib/pos-insights");
let outletId = "";
let otherOutletId = "";
let seq = 0;

type Line = { item: "itm-coffee" | "itm-food" | "itm-snack"; qty: number; bundle?: boolean };

async function sale(lines: Line[], opts: { outlet?: string; status?: string; daysAgo?: number } = {}) {
  const { schema } = t;
  seq += 1;
  const createdAt = new Date(Date.now() - (opts.daysAgo ?? 0) * 24 * 60 * 60 * 1000 - 60_000);
  const [order] = await t
    .getDb()
    .insert(schema.orders)
    .values({
      orderNo: `POS-INS-${seq}`,
      outletId: opts.outlet ?? outletId,
      channel: "POS",
      status: opts.status ?? "paid",
      subtotal: 10_000,
      service: 0,
      tax: 0,
      total: 10_000,
      createdAt,
    })
    .returning();
  await t
    .getDb()
    .insert(schema.orderItems)
    .values(
      lines.map((line) => ({
        orderId: order.id,
        menuItemId: line.item,
        variantId: "reg",
        itemName: line.item,
        variantLabel: "Regular",
        unitPrice: 5_000,
        qty: line.qty,
        lineTotal: 5_000 * line.qty,
        eventSnapshot: line.bundle ? ({ kind: "bundle", groupId: "g1", entryName: "Paket", packagePrice: 10_000, entryQuantity: 1 } as any) : null,
      })),
    );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  outletId = (await seedGarageBasics(t, { userId: "user-itest-insights" })).outletId;
  const [other] = await t.getDb().insert(t.schema.outlets).values({ code: "OTH", name: "Outlet Lain" }).returning();
  otherOutletId = other.id;
  await t.getDb().insert(t.schema.menuItems).values({ id: "itm-snack", name: "Snack Test", category: "Cemilan", section: "Makanan", prep: "5m" });
  insights = await import("@/lib/pos-insights");

  // Outlet ini: kopi 4 order (qty 1) + 3 di antaranya bersama nasi; snack 2 (di bawah ambang).
  await sale([{ item: "itm-coffee", qty: 1 }, { item: "itm-food", qty: 1 }]);
  await sale([{ item: "itm-coffee", qty: 1 }, { item: "itm-food", qty: 1 }]);
  await sale([{ item: "itm-coffee", qty: 1 }, { item: "itm-food", qty: 1 }, { item: "itm-snack", qty: 1 }]);
  await sale([{ item: "itm-coffee", qty: 1 }, { item: "itm-snack", qty: 1 }]);
  // Tidak dihitung: void, outlet lain, di luar 7 hari (tapi masuk 30 hari pairing), komponen paket.
  await sale([{ item: "itm-snack", qty: 20 }], { status: "voided" });
  await sale([{ item: "itm-snack", qty: 20 }], { outlet: otherOutletId });
  await sale([{ item: "itm-snack", qty: 20 }], { daysAgo: 10 });
  await sale([{ item: "itm-snack", qty: 20, bundle: true }]);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("getPosBestsellers", () => {
  it("hanya order lunas outlet ini dalam 7 hari, tanpa komponen paket, ambang qty ≥ 3", async () => {
    const result = await insights.getPosBestsellers({ outletId });
    expect(result.windowDays).toBe(7);
    expect(result.bestsellers).toEqual([
      { menuItemId: "itm-coffee", qty: 4, orders: 4 },
      { menuItemId: "itm-food", qty: 3, orders: 3 },
    ]);
  });

  it("outlet lain tidak bocor", async () => {
    const result = await insights.getPosBestsellers({ outletId: otherOutletId });
    expect(result.bestsellers).toEqual([{ menuItemId: "itm-snack", qty: 20, orders: 1 }]);
  });
});

describe("getPosPairings", () => {
  it("pasangan dari order lunas outlet ini, minimal 3 order bersama", async () => {
    const result = await insights.getPosPairings({ outletId, menuItemId: "itm-coffee" });
    expect(result.anchorOrders).toBe(4);
    expect(result.suggestions).toEqual([{ menuItemId: "itm-food", itemName: "itm-food", pairCount: 3 }]);
  });

  it("item tanpa riwayat → kosong", async () => {
    const result = await insights.getPosPairings({ outletId: otherOutletId, menuItemId: "itm-coffee" });
    expect(result.anchorOrders).toBe(0);
    expect(result.suggestions).toEqual([]);
  });
});
