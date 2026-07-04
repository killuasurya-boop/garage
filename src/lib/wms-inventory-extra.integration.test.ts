import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS — Stok awal saat tambah produk + ringkasan (getWmsSummary).
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

describe("stok awal saat tambah produk", () => {
  it("bahan Bar → stok awal masuk ke Ruang Bar", async () => {
    const whs = await svc.listWmsWarehouses();
    const ruangBar = whs.find((w: any) => w.type === "main" && w.area === "bar");
    await svc.createWmsProduct({ sku: "TEA-1", name: "Teh Hijau", category: "Bahan Bar", unit: "gram", hpp: 0.1, initialStock: 500 }, null);
    const atBar = (await svc.getWmsProducts({ warehouseId: ruangBar.id })).find((p: any) => p.sku === "TEA-1");
    expect(atBar.onHand).toBe(500);
  });

  it("bahan Dapur → stok awal masuk ke Ruang Dapur", async () => {
    const whs = await svc.listWmsWarehouses();
    const ruangDapur = whs.find((w: any) => w.type === "main" && w.area === "dapur");
    await svc.createWmsProduct({ sku: "FLOUR-1", name: "Tepung", category: "Bahan Dapur", unit: "gram", hpp: 0.02, initialStock: 300 }, null);
    const atDapur = (await svc.getWmsProducts({ warehouseId: ruangDapur.id })).find((p: any) => p.sku === "FLOUR-1");
    expect(atDapur.onHand).toBe(300);
  });
});

describe("getWmsSummary", () => {
  it("mengembalikan nilai persediaan + rincian per gudang", async () => {
    const s = await svc.getWmsSummary();
    expect(s.inventoryValue).toBeGreaterThan(0);
    expect(Array.isArray(s.byWarehouse)).toBe(true);
    expect(s.byWarehouse.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(s.outletAlerts)).toBe(true);
  });
});
