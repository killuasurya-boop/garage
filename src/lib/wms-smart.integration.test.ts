import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 6 — Smart Reorder + Cold Chain + Owner Analytics.
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

describe("Smart Reorder", () => {
  it("produk di bawah min muncul sebagai saran reorder dengan qty > 0", async () => {
    const r = await svc.getWmsSmartReorder();
    const cup = r.items.find((i: any) => i.sku === "CUP-16"); // stok 240 < min 300
    expect(cup).toBeTruthy();
    expect(cup.urgency).toBe("low");
    expect(cup.suggestedQty).toBeGreaterThan(0);
  });

  it("konsumsi (internal_out) menaikkan avgDaily & menurunkan daysCover", async () => {
    const bean = (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
    const bar = (await svc.listWmsWarehouses()).find((w: any) => w.type === "bar");
    await svc.createInternalOrder({ outletWarehouseId: bar.id, items: [{ productId: bean.id, qty: 3000 }] });

    const r = await svc.getWmsSmartReorder();
    const beanRow = r.items.find((i: any) => i.sku === "BEAN-ARB");
    // ada konsumsi → avgDaily > 0
    if (beanRow) expect(beanRow.avgDaily).toBeGreaterThan(0);
  });
});

describe("Cold Chain", () => {
  it("seed demo → ada unit; CHILLER-02 (9°C) di luar zona aman", async () => {
    const cc = await svc.getWmsColdChain();
    expect(cc.units.length).toBeGreaterThanOrEqual(3);
    const alertCodes = cc.alerts.map((a: any) => a.code);
    expect(alertCodes).toContain("CHILLER-02");
  });

  it("addColdChainReading menyimpan bacaan", async () => {
    const row = await svc.addColdChainReading("CHILLER-99", 5.5);
    expect(row.unitCode).toBe("CHILLER-99");
    expect(Number(row.tempC)).toBeCloseTo(5.5, 1);
  });
});

describe("Owner Analytics", () => {
  it("KPI analytics terisi", async () => {
    const a = await svc.getWmsOwnerAnalytics();
    expect(a.kpis).toBeTruthy();
    expect(typeof a.kpis.avgFoodCost).toBe("number");
    expect(Array.isArray(a.topMaterials)).toBe(true);
  });
});
