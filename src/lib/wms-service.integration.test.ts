import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// GARAGE WMS — test integrasi fondasi: seed, recordStockMovement (ledger +
// stok, anti-minus), getWmsProducts (status), dashboard KPI.
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

describe("WMS fondasi", () => {
  it("seed: warehouse default + produk contoh ter-seed", async () => {
    const wh = await svc.listWmsWarehouses();
    expect(wh.length).toBeGreaterThanOrEqual(3);
    expect(wh.find((w: any) => w.isPrimary)).toBeTruthy();

    const products = await svc.getWmsProducts();
    expect(products.length).toBeGreaterThan(0);
  });

  it("status stok: low & out terdeteksi dari onHand vs min", async () => {
    const products = await svc.getWmsProducts();
    // CUP-16 min 300 stok awal 240 -> low; SYR-CARAMEL min 500 stok 300 -> low
    const cup = products.find((p: any) => p.sku === "CUP-16");
    expect(cup?.status).toBe("low");
  });

  it("recordStockMovement: keluar mengurangi stok + tercatat di ledger", async () => {
    const { eq } = await import("drizzle-orm");
    const before = (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
    const wh = await svc.listWmsWarehouses();
    const main = wh.find((w: any) => w.isPrimary);

    await svc.recordStockMovement(t.getDb(), {
      type: "out",
      productId: before.id,
      warehouseId: main.id,
      deltaQty: -500,
      hpp: before.hpp,
      refDoc: "TEST-OUT",
    });

    const after = (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
    expect(after.onHand).toBe(before.onHand - 500);

    const moves = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(eq(t.schema.wmsStockMovement.refDoc, "TEST-OUT"));
    expect(moves.length).toBe(1);
    expect(moves[0].type).toBe("out");
  });

  it("anti-minus: keluar melebihi stok DITOLAK (tidak clamp diam-diam)", async () => {
    const { eq } = await import("drizzle-orm");
    const p = (await svc.getWmsProducts()).find((x: any) => x.sku === "SYR-CARAMEL");
    const wh = await svc.listWmsWarehouses();
    const main = wh.find((w: any) => w.isPrimary);
    const before = p.onHand;

    // Sekarang oversell dilempar sebagai error (ledger & stok tetap konsisten).
    await expect(
      svc.recordStockMovement(t.getDb(), {
        type: "out",
        productId: p.id,
        warehouseId: main.id,
        deltaQty: -999999,
        hpp: p.hpp,
        refDoc: "TEST-NEG",
      }),
    ).rejects.toThrow(/tidak cukup/i);

    // Stok tidak berubah, dan tidak ada ledger phantom untuk percobaan gagal.
    const after = (await svc.getWmsProducts()).find((x: any) => x.sku === "SYR-CARAMEL");
    expect(after.onHand).toBe(before);
    const moves = await t
      .getDb()
      .select()
      .from(t.schema.wmsStockMovement)
      .where(eq(t.schema.wmsStockMovement.refDoc, "TEST-NEG"));
    expect(moves.length).toBe(0);
  });

  it("presisi numeric: HPP pecahan round-trip eksak (bukan float drift)", async () => {
    const prod = await svc.createWmsProduct({
      sku: "NUM-TEST",
      name: "Uji Presisi",
      category: "Test",
      unit: "gram",
      hpp: 0.0018,
    });
    const back = (await svc.getWmsProducts({ search: "NUM-TEST" })).find(
      (p: any) => p.sku === "NUM-TEST",
    );
    expect(back.hpp).toBe(0.0018);
    void prod;
  });

  it("dashboard: KPI terisi dari data seed", async () => {
    const dash = await svc.getWmsDashboard();
    expect(dash.kpis.totalProducts).toBeGreaterThan(0);
    expect(dash.kpis.stockValue).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(dash.recentMovements)).toBe(true);
  });
});
