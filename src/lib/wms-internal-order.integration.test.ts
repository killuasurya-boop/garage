import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 3 — Internal Order + FEFO: potong stok gudang (batch expired dulu) +
// tambah stok outlet + lineHpp dari batch + validasi tak melebihi stok.
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
async function outlet(type: string) {
  return (await svc.listWmsWarehouses()).find((w: any) => w.type === type);
}

describe("Internal Order + FEFO", () => {
  it("issue ke Bar: stok utama berkurang, stok outlet bertambah, lineHpp benar", async () => {
    const before = await bean(); // onHand 8000 @0.12
    const bar = await outlet("bar");

    const io = await svc.createInternalOrder({
      outletWarehouseId: bar.id,
      items: [{ productId: before.id, qty: 1000 }],
    });
    expect(io.status).toBe("issued");
    // 1000 × 0.12 = 120
    expect(Number(io.totalHpp)).toBeCloseTo(120, 2);

    // stok gudang utama turun
    const afterMain = await bean();
    expect(afterMain.onHand).toBe(7000);

    // stok outlet bar naik
    const barProducts = await svc.getWmsProducts({ warehouseId: bar.id });
    const beanBar = barProducts.find((p: any) => p.sku === "BEAN-ARB");
    expect(beanBar.onHand).toBe(1000);
  });

  it("FEFO: batch expired lebih awal dipakai duluan", async () => {
    const p = (await svc.getWmsProducts()).find((x: any) => x.sku === "MILK-FC");
    const wh = await svc.listWmsWarehouses();
    const main = wh.find((w: any) => w.isPrimary);
    const bar = wh.find((w: any) => w.type === "bar");

    // dua batch: B-LATE (expired jauh, hpp 0.05) & B-SOON (expired dekat, hpp 0.01)
    await t.getDb().insert(t.schema.wmsBatch).values([
      { productId: p.id, warehouseId: main.id, batchNo: "B-LATE", qty: 1000, hpp: 0.05, expiredAt: new Date("2030-01-01") },
      { productId: p.id, warehouseId: main.id, batchNo: "B-SOON", qty: 1000, hpp: 0.01, expiredAt: new Date("2026-01-01") },
    ]);

    // ambil 800 → harus dari B-SOON (0.01) duluan → biaya 800×0.01 = 8
    const io = await svc.createInternalOrder({
      outletWarehouseId: bar.id,
      items: [{ productId: p.id, qty: 800 }],
    });
    expect(Number(io.totalHpp)).toBeCloseTo(8, 2);

    const { eq } = await import("drizzle-orm");
    const [soon] = await t.getDb().select().from(t.schema.wmsBatch).where(eq(t.schema.wmsBatch.batchNo, "B-SOON"));
    expect(soon.qty).toBe(200); // 1000 - 800
  });

  it("validasi: tidak boleh keluar melebihi stok tersedia", async () => {
    const p = await bean();
    const bar = await outlet("bar");
    await expect(
      svc.createInternalOrder({ outletWarehouseId: bar.id, items: [{ productId: p.id, qty: 9_999_999 }] }),
    ).rejects.toThrow(/tidak cukup/i);
  });
});
