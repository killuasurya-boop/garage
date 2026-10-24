import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS — satu metode biaya (rata-rata gerak) & retur penjualan ke batch asal:
// jual memotong batch FEFO tapi bernilai HPP rata-rata; void/refund mengembalikan
// qty ke ruang & batch yang dulu terpotong (terbaru dulu); penjualan lama tanpa
// jejak batch tetap kembali lewat batch RETUR.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let barId = "";
let mainBarId = "";
let productId = "";
const DAY = 86_400_000;

async function batchQty(batchNo: string) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.wmsBatch)
    .where(and(eq(t.schema.wmsBatch.productId, productId), eq(t.schema.wmsBatch.batchNo, batchNo)));
  return Number(row?.qty ?? NaN);
}

async function balance(warehouseId: string) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.wmsWarehouseStock)
    .where(and(eq(t.schema.wmsWarehouseStock.productId, productId), eq(t.schema.wmsWarehouseStock.warehouseId, warehouseId)));
  return Number(row?.qty ?? 0);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  const whs = await wms.listWmsWarehouses();
  barId = whs.find((w: any) => w.type === "bar").id;
  mainBarId = whs.find((w: any) => w.type === "main" && w.area === "bar").id;
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Retur Test", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({ sku: "T-RET", name: "Sirup Retur", category: "Bar · Retur Test", unit: "ml", packPrice: 0, packQty: 1 });
  productId = prod.id;
  const { eq } = await import("drizzle-orm");
  await t.getDb().update(t.schema.wmsProduct).set({ hpp: 15 }).where(eq(t.schema.wmsProduct.id, productId));
  for (const [batchNo, qty, days, hpp] of [["A-SOON", 100, 5, 10], ["B-LATE", 100, 20, 20]] as const) {
    await wms.runInTx((tx: any) =>
      wms.recordStockMovement(tx, { type: "in", productId, warehouseId: barId, deltaQty: qty, hpp, refDoc: "TEST-IN", batchNo, expiredAt: new Date(Date.now() + days * DAY) }),
    );
  }
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Rata-rata gerak + retur ke batch asal", () => {
  it("jual lintas 2 batch: nilai = qty × HPP rata-rata, batch FEFO terpotong", async () => {
    await wms.runInTx((tx: any) => wms.consumeWmsStockForSale(tx, { sku: "T-RET", qty: 150, unit: "ml", refDoc: "SALE ORD-1" }));
    expect(await batchQty("A-SOON")).toBe(0);
    expect(await batchQty("B-LATE")).toBe(50);
    const { and, eq } = await import("drizzle-orm");
    const [move] = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(and(eq(t.schema.wmsStockMovement.refDoc, "SALE ORD-1"), eq(t.schema.wmsStockMovement.productId, productId)));
    expect(Number(move.valueHpp)).toBe(150 * 15);
    expect(Number(move.valuationRate)).toBe(15);
  });

  it("refund sebagian kembali ke batch terbaru dulu; void sisanya ke batch asal masing-masing", async () => {
    await wms.runInTx((tx: any) => wms.returnWmsStockForSale(tx, { sku: "T-RET", qty: 30, unit: "ml", refDoc: "Refund ORD-1", saleRefDoc: "SALE ORD-1" }));
    expect(await batchQty("B-LATE")).toBe(80);
    expect(await batchQty("A-SOON")).toBe(0);
    await wms.runInTx((tx: any) => wms.returnWmsStockForSale(tx, { sku: "T-RET", qty: 120, unit: "ml", refDoc: "Batal ORD-1", saleRefDoc: "SALE ORD-1" }));
    expect(await batchQty("B-LATE")).toBe(100);
    expect(await batchQty("A-SOON")).toBe(100);
    expect(await balance(barId)).toBe(200);
    // Tidak ada batch RETUR baru: semua kembali ke batch asal.
    const { like } = await import("drizzle-orm");
    const extra = await t.getDb().select().from(t.schema.wmsBatch).where(like(t.schema.wmsBatch.batchNo, "RETUR-%"));
    expect(extra).toHaveLength(0);
    expect((await wms.getWmsBatchIntegrity()).some((g: any) => g.productId === productId)).toBe(false);
  });

  it("terjual minus lalu dibatalkan → saldo kembali tanpa batch fiktif", async () => {
    await wms.runInTx((tx: any) => wms.consumeWmsStockForSale(tx, { sku: "T-RET", qty: 260, unit: "ml", refDoc: "SALE ORD-2" }));
    expect(await balance(barId) + (await balance(mainBarId))).toBe(-60);
    await wms.runInTx((tx: any) => wms.returnWmsStockForSale(tx, { sku: "T-RET", qty: 260, unit: "ml", refDoc: "Batal ORD-2", saleRefDoc: "SALE ORD-2" }));
    expect(await balance(barId)).toBe(200);
    expect(await batchQty("A-SOON")).toBe(100);
    expect(await batchQty("B-LATE")).toBe(100);
    expect((await wms.getWmsBatchIntegrity()).some((g: any) => g.productId === productId)).toBe(false);
  });

  it("penjualan lama tanpa jejak batch tetap bisa dikembalikan (batch RETUR)", async () => {
    await wms.runInTx((tx: any) => wms.returnWmsStockForSale(tx, { sku: "T-RET", qty: 10, unit: "ml", refDoc: "Batal ORD-LAMA", saleRefDoc: "SALE ORD-LAMA" }));
    expect(await batchQty("RETUR-Batal ORD-LAMA")).toBe(10);
  });

  it("pindah ruang tidak mengubah nilai: masuk tujuan = HPP rata-rata", async () => {
    const before = Number((await wms.getWmsProducts()).find((p: any) => p.sku === "T-RET").hpp);
    await wms.transferStock({ fromWarehouseId: barId, toWarehouseId: mainBarId, items: [{ productId, qty: 50 }] });
    const after = Number((await wms.getWmsProducts()).find((p: any) => p.sku === "T-RET").hpp);
    expect(after).toBe(before);
    const { and, eq, gt } = await import("drizzle-orm");
    const ins = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(and(eq(t.schema.wmsStockMovement.productId, productId), eq(t.schema.wmsStockMovement.warehouseId, mainBarId), gt(t.schema.wmsStockMovement.qty, 0)));
    expect(ins.every((m: any) => Number(m.valuationRate) === before)).toBe(true);
  });
});
