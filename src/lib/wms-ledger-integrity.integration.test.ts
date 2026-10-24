import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Wave 1 — ledger akurat: saldo per baris, stok minus dilunasi sebelum batch
// baru, cek Σ batch = saldo, konversi satuan resep, masalah stok tercatat, batal
// penerimaan mengembalikan HPP rata-rata.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;
let barId = "";
let productId = "";

async function batchTotal(pid: string, whId: string) {
  const { and, eq, sql } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select({ total: sql<number>`coalesce(sum(${t.schema.wmsBatch.qty}),0)` })
    .from(t.schema.wmsBatch)
    .where(and(eq(t.schema.wmsBatch.productId, pid), eq(t.schema.wmsBatch.warehouseId, whId)));
  return Number(row.total);
}

async function balance(pid: string, whId: string) {
  const { and, eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select()
    .from(t.schema.wmsWarehouseStock)
    .where(and(eq(t.schema.wmsWarehouseStock.productId, pid), eq(t.schema.wmsWarehouseStock.warehouseId, whId)));
  return Number(row?.qty ?? 0);
}

async function move(deltaQty: number, extra: Record<string, unknown> = {}) {
  return wms.runInTx((tx: any) =>
    wms.recordStockMovement(tx, { type: deltaQty > 0 ? "in" : "out", productId, warehouseId: barId, deltaQty, hpp: 10, refDoc: "T", ...extra }),
  );
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  wms = await import("@/lib/wms-service");
  const whs = await wms.listWmsWarehouses();
  barId = whs.find((w: any) => w.type === "main" && w.area === "bar").id;
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Ledger Test", area: "bar" }).onConflictDoNothing();
  const prod = await wms.createWmsProduct({ sku: "T-LEDGER", name: "Gula Ledger", category: "Bar · Ledger Test", unit: "gr", packPrice: 10_000, packQty: 1000 });
  productId = prod.id;
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Ledger WMS akurat", () => {
  it("setiap mutasi menyimpan saldo setelah & biaya per unit", async () => {
    await move(100);
    await move(-30);
    const { desc, eq } = await import("drizzle-orm");
    const rows = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(eq(t.schema.wmsStockMovement.productId, productId))
      .orderBy(desc(t.schema.wmsStockMovement.createdAt));
    expect(rows.map((r: any) => Number(r.balanceAfter)).sort((a: number, b: number) => a - b)).toEqual([70, 100]);
    expect(rows.every((r: any) => Number(r.valuationRate) === 10 && r.batchId)).toBe(true);
  });

  it("stok minus dilunasi dulu: barang masuk berikutnya tidak menggelembungkan batch", async () => {
    await wms.runInTx((tx: any) =>
      wms.recordStockMovement(tx, { type: "out", productId, warehouseId: barId, deltaQty: -100, hpp: 10, refDoc: "SALE X", allowNegative: true }),
    );
    expect(await balance(productId, barId)).toBe(-30);
    expect(await batchTotal(productId, barId)).toBe(0);
    await move(50);
    expect(await balance(productId, barId)).toBe(20);
    expect(await batchTotal(productId, barId)).toBe(20);
    expect((await wms.getWmsBatchIntegrity()).some((g: any) => g.productId === productId)).toBe(false);
  });

  it("cek integritas menemukan & menyamakan batch data lama", async () => {
    const { and, eq, sql } = await import("drizzle-orm");
    // Data lama: batch dikurangi di luar ledger → saldo 20, batch 5.
    await t
      .getDb()
      .update(t.schema.wmsBatch)
      .set({ qty: 5 })
      .where(and(eq(t.schema.wmsBatch.productId, productId), eq(t.schema.wmsBatch.warehouseId, barId), sql`${t.schema.wmsBatch.qty} > 0`));
    const gaps = await wms.getWmsBatchIntegrity();
    expect(gaps.find((g: any) => g.productId === productId && g.warehouseId === barId)?.gap).toBe(15);
    await wms.fixWmsBatchIntegrity({ actorName: "Owner Test" });
    expect(await batchTotal(productId, barId)).toBe(20);
    expect(await balance(productId, barId)).toBe(20);
    expect((await wms.getWmsBatchIntegrity()).some((g: any) => g.productId === productId)).toBe(false);
  });

  it("satuan resep dikonversi ke satuan gudang; dimensi beda dicatat sebagai masalah", async () => {
    expect(wms.saleQtyInWmsUnit(0.5, "kg", "gr")).toEqual({ qty: 500, mismatch: false });
    expect(wms.saleQtyInWmsUnit(12, "gram", "gr")).toEqual({ qty: 12, mismatch: false });
    expect(wms.saleQtyInWmsUnit(3, "pcs", "ml")).toEqual({ qty: 3, mismatch: true });

    const before = await balance(productId, barId);
    await wms.runInTx((tx: any) => wms.consumeWmsStockForSale(tx, { sku: "T-LEDGER", qty: 0.01, unit: "kg", refDoc: "SALE U1" }));
    expect(Number((before - (await balance(productId, barId))).toFixed(4))).toBe(10);

    await wms.runInTx((tx: any) => wms.consumeWmsStockForSale(tx, { sku: "T-LEDGER", qty: 1, unit: "pcs", refDoc: "SALE U2" }));
    await wms.runInTx((tx: any) => wms.consumeWmsStockForSale(tx, { sku: "T-NOT-IN-WMS", qty: 2, unit: "ml", refDoc: "SALE U3" }));
    await wms.runInTx((tx: any) => wms.consumeWmsStockForSale(tx, { sku: "T-NOT-IN-WMS", qty: 3, unit: "ml", refDoc: "SALE U4" }));
    const issues = await wms.listOpenWmsStockIssues();
    expect(issues.find((i: any) => i.kind === "unit_mismatch" && i.sku === "T-LEDGER")).toBeTruthy();
    const missing = issues.filter((i: any) => i.kind === "not_in_wms" && i.sku === "T-NOT-IN-WMS");
    expect(missing).toHaveLength(1); // satu baris terbuka per SKU, qty diakumulasi
    expect(missing[0]).toMatchObject({ qty: 5, refDoc: "SALE U4" });
    await wms.resolveWmsStockIssue(missing[0].id, null);
    expect((await wms.listOpenWmsStockIssues()).some((i: any) => i.id === missing[0].id)).toBe(false);
  });

  it("terjual melebihi stok tercatat → masalah 'oversold' tercatat", async () => {
    await wms.runInTx((tx: any) => wms.consumeWmsStockForSale(tx, { sku: "T-LEDGER", qty: 1000, unit: "gr", refDoc: "SALE BIG" }));
    const issue = (await wms.listOpenWmsStockIssues()).find((i: any) => i.kind === "oversold" && i.sku === "T-LEDGER");
    expect(issue?.qty).toBeGreaterThan(0);
  });

  it("batal penerimaan mengembalikan HPP rata-rata & mengeluarkan batch penerimaan itu sendiri", async () => {
    await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Batal Test", area: "bar" }).onConflictDoNothing();
    const p = await wms.createWmsProduct({ sku: "T-CANCEL", name: "Sirup Batal", category: "Bar · Batal Test", unit: "ml", packPrice: 10_000, packQty: 1000 });
    const first = await wms.createReceiving({ warehouseId: barId, items: [{ productId: p.id, orderedQty: 1000, receivedQty: 1000, hpp: 10, qc: "pass" }] });
    await wms.completeReceiving(first.id);
    const second = await wms.createReceiving({ warehouseId: barId, items: [{ productId: p.id, orderedQty: 1000, receivedQty: 1000, hpp: 30, qc: "pass" }] });
    await wms.completeReceiving(second.id);
    const hppOf = async () => Number((await wms.getWmsProducts()).find((x: any) => x.sku === "T-CANCEL").hpp);
    expect(await hppOf()).toBeCloseTo(20, 4);

    await wms.cancelReceiving(second.id, { reason: "Salah harga" });
    expect(await hppOf()).toBeCloseTo(10, 4);
    const { and, eq, sql } = await import("drizzle-orm");
    const batches = await t
      .getDb()
      .select()
      .from(t.schema.wmsBatch)
      .where(and(eq(t.schema.wmsBatch.productId, p.id), sql`${t.schema.wmsBatch.qty} > 0`));
    expect(batches.map((b: any) => Number(b.hpp))).toEqual([10]);
  });
});
