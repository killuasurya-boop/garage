import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 2 — Receiving: complete → +stok + batch + HPP rata-rata + ledger.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function bean() {
  return (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
}

describe("Receiving complete", () => {
  it("terima 2000 @0.20 → stok +2000 & HPP jadi rata-rata tertimbang", async () => {
    const before = await bean(); // onHand 8000, hpp 0.12
    expect(before.onHand).toBe(8000);

    const rec = await svc.createReceiving({
      supplier: "PT Kopi Nusantara",
      items: [{ productId: before.id, orderedQty: 2000, receivedQty: 2000, hpp: 0.2, qc: "pass" }],
    });
    expect(rec.status).toBe("draft");

    await svc.completeReceiving(rec.id);

    const after = await bean();
    expect(after.onHand).toBe(10000);
    // (8000*0.12 + 2000*0.20)/10000 = 0.136
    expect(after.hpp).toBeCloseTo(0.136, 4);

    // batch dibuat
    const { eq } = await import("drizzle-orm");
    const batches = await t
      .getDb()
      .select()
      .from(t.schema.wmsBatch)
      .where(eq(t.schema.wmsBatch.productId, before.id));
    // seed sudah membuat 1 batch awal; receiving menambah batch qty 2000.
    expect(batches.some((b: any) => b.qty === 2000)).toBe(true);

    // ledger 'in' dgn refDoc = doc
    const moves = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(eq(t.schema.wmsStockMovement.refDoc, rec.doc));
    expect(moves.length).toBe(1);
    expect(moves[0].type).toBe("in");
  });

  it("idempoten: complete dua kali tidak menambah stok lagi", async () => {
    const p = await bean();
    const rec = await svc.createReceiving({
      items: [{ productId: p.id, orderedQty: 500, receivedQty: 500, hpp: 0.2, qc: "pass" }],
    });
    await svc.completeReceiving(rec.id);
    const mid = await bean();
    await svc.completeReceiving(rec.id); // ulang
    const after = await bean();
    expect(after.onHand).toBe(mid.onHand);
  });

  it("item QC reject tidak menambah stok", async () => {
    const p = (await svc.getWmsProducts()).find((x: any) => x.sku === "MILK-FC");
    const before = p.onHand;
    const rec = await svc.createReceiving({
      items: [{ productId: p.id, orderedQty: 1000, receivedQty: 1000, hpp: 0.02, qc: "reject" }],
    });
    await svc.completeReceiving(rec.id);
    const after = (await svc.getWmsProducts()).find((x: any) => x.sku === "MILK-FC");
    expect(after.onHand).toBe(before);
  });
});
