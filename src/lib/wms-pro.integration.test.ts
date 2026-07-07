import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Pro — landed cost + konversi satuan (Receiving), checklist, stok per gudang.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.listWmsCategories();
  await svc.getWmsProducts();
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Receiving landed cost + konversi", () => {
  it("konversi buyQty×packSize → receivedQty & landed cost menaikkan HPP", async () => {
    // Produk baru stok 0 supaya HPP hasil = HPP terima (+ landed).
    const p = await svc.createWmsProduct({ sku: "PRO-1", name: "Bahan Pro", category: "Bahan Bar", unit: "pcs", hpp: 0 }, null);
    // Beli 2 dus × 10 = 20 pcs @ HPP 100. Biaya tambahan 200 → +10/pcs → HPP 110.
    const rec = await svc.createReceiving({
      supplier: "S",
      additionalCost: 200,
      items: [{ productId: p.id, orderedQty: 20, buyQty: 2, packSize: 10, receivedQty: 0, hpp: 100, qc: "pass" }],
    }, null);
    await svc.completeReceiving(rec.id, null);

    const prods = await svc.getWmsProducts();
    const row = prods.find((x: any) => x.sku === "PRO-1");
    // receivedQty = 20 (2×10)
    const stock = await svc.getWmsProductStock(p.id);
    const total = stock.reduce((s: number, r: any) => s + r.onHand, 0);
    expect(total).toBe(20);
    // HPP = 100 + 200/20 = 110
    expect(Math.round(row.hpp)).toBe(110);
  });
});

describe("getWmsProductStock", () => {
  it("bahan Bar hanya menampilkan ruang area Bar (bukan Dapur)", async () => {
    const bean = (await svc.getWmsProducts()).find((x: any) => x.sku === "BEAN-ARB");
    const stock = await svc.getWmsProductStock(bean.id);
    expect(stock.length).toBeGreaterThan(0);
    expect(stock.every((r: any) => typeof r.onHand === "number")).toBe(true);
    // Tidak boleh ada ruang Dapur kosong untuk bahan Bar (hanya area Bar / ruang berstok).
    expect(stock.every((r: any) => r.area === "bar" || r.onHand !== 0)).toBe(true);
    expect(stock.some((r: any) => r.area === "dapur" && r.onHand === 0)).toBe(false);
  });

  it("warehouseId='all' = agregat total stok gabungan semua ruang", async () => {
    const bean = (await svc.getWmsProducts()).find((x: any) => x.sku === "BEAN-ARB");
    const perRoom = await svc.getWmsProductStock(bean.id);
    const expected = perRoom.reduce((s: number, r: any) => s + r.onHand, 0);
    const all = (await svc.getWmsProducts({ warehouseId: "all" })).find((x: any) => x.sku === "BEAN-ARB");
    expect(all.onHand).toBe(expected);
  });
});

describe("getWmsWarehouseSummary", () => {
  it("mengembalikan ringkasan item/low/empty per gudang", async () => {
    const rows = await svc.getWmsWarehouseSummary();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => typeof r.items === "number" && typeof r.low === "number" && typeof r.empty === "number")).toBe(true);
    expect(rows.every((r: any) => r.items >= 0 && r.low >= 0)).toBe(true);
  });
});

describe("Checklist", () => {
  it("buat run daily → item dari template → centang → selesai", async () => {
    const whs = await svc.listWmsWarehouses();
    const run = await svc.createChecklistRun({ type: "daily", warehouseId: whs[0].id }, null);
    const detail = await svc.getChecklistRun(run.id);
    expect(detail.items.length).toBeGreaterThan(0);
    expect(detail.type).toBe("daily");

    await svc.toggleChecklistItem(detail.items[0].id, true);
    const done = await svc.completeChecklistRun(run.id);
    expect(done.status).toBe("completed");

    const list = await svc.listChecklistRuns("daily");
    expect(list.some((r: any) => r.id === run.id && r.done >= 1)).toBe(true);
  });
});
