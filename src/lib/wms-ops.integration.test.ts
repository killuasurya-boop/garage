import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 5 — Adjustment, Stock Opname (variance → reconcile), Reports.
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
async function mainWh() {
  return (await svc.listWmsWarehouses()).find((w: any) => w.isPrimary);
}

describe("Adjustment & Opname & Reports", () => {
  it("adjustment: koreksi stok tercatat di ledger", async () => {
    const p = await bean(); // 8000
    const main = await mainWh();
    await svc.adjustWmsStock({ productId: p.id, warehouseId: main.id, deltaQty: -500, note: "rusak" });
    const after = await bean();
    expect(after.onHand).toBe(7500);
  });

  it("opname: variance fisik direkonsiliasi ke stok saat finalize", async () => {
    const main = await mainWh();
    const op = await svc.createWmsOpname(main.id);
    const detail = await svc.getWmsOpname(op.id);
    const beanLine = detail.lines.find((l: any) => l.productName === "Kopi Arabika");
    expect(beanLine.systemQty).toBe(7500);

    // hitung fisik 7000 (selisih -500)
    await svc.saveWmsOpnameLine(beanLine.id, 7000);
    const reread = await svc.getWmsOpname(op.id);
    expect(reread.lines.find((l: any) => l.id === beanLine.id).variance).toBe(-500);

    await svc.finalizeWmsOpname(op.id);
    const after = await bean();
    expect(after.onHand).toBe(7000); // stok = fisik
  });

  it("reports: KPI & movements terisi dari ledger", async () => {
    const rep = await svc.getWmsReports();
    expect(rep.kpis.total).toBeGreaterThan(0);
    expect(Array.isArray(rep.movements)).toBe(true);
    expect(rep.movements.length).toBeGreaterThan(0);
  });
});
