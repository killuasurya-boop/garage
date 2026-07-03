import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 3 — Transfer antar-gudang: potong sumber FEFO + tambah tujuan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let main: any;
let outlet: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.getWmsProducts(); // seed contoh
  const whs = await svc.listWmsWarehouses();
  main = whs.find((w: any) => w.isPrimary);
  outlet = whs.find((w: any) => !w.isPrimary);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function onHand(sku: string, whId: string) {
  const rows = await svc.getWmsProducts({ warehouseId: whId });
  return rows.find((p: any) => p.sku === sku)?.onHand ?? 0;
}

describe("transferStock", () => {
  it("pindah 100 BEAN-ARB Utama → outlet: sumber -100, tujuan +100", async () => {
    const bean = (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
    const beforeMain = await onHand("BEAN-ARB", main.id);
    const beforeOutlet = await onHand("BEAN-ARB", outlet.id);

    const res = await svc.transferStock(
      { fromWarehouseId: main.id, toWarehouseId: outlet.id, items: [{ productId: bean.id, qty: 100 }] },
      null,
    );
    expect(res.doc).toMatch(/^TRF-/);
    expect(res.count).toBe(1);

    expect(await onHand("BEAN-ARB", main.id)).toBe(beforeMain - 100);
    expect(await onHand("BEAN-ARB", outlet.id)).toBe(beforeOutlet + 100);
  });

  it("tolak transfer bila stok tidak cukup", async () => {
    const bean = (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
    await expect(
      svc.transferStock({ fromWarehouseId: main.id, toWarehouseId: outlet.id, items: [{ productId: bean.id, qty: 99_999_999 }] }, null),
    ).rejects.toThrow(/tidak cukup/i);
  });

  it("tolak gudang asal = tujuan", async () => {
    const bean = (await svc.getWmsProducts()).find((p: any) => p.sku === "BEAN-ARB");
    await expect(
      svc.transferStock({ fromWarehouseId: main.id, toWarehouseId: main.id, items: [{ productId: bean.id, qty: 1 }] }, null),
    ).rejects.toThrow(/tidak boleh sama/i);
  });
});
