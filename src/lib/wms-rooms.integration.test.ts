import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS — Gudang Utama 2 ruang (Bar & Dapur). Receiving auto-sortir per area.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let ruangBar: any;
let ruangDapur: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.getWmsProducts(); // seed
  const whs = await svc.listWmsWarehouses();
  ruangBar = whs.find((w: any) => w.type === "main" && w.area === "bar");
  ruangDapur = whs.find((w: any) => w.type === "main" && w.area === "dapur");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function onHandAt(sku: string, whId: string) {
  return (await svc.getWmsProducts({ warehouseId: whId })).find((p: any) => p.sku === sku)?.onHand ?? 0;
}

describe("Gudang utama 2 ruang", () => {
  it("ada 2 ruang utama (bar & dapur) + 2 outlet", async () => {
    const whs = await svc.listWmsWarehouses();
    expect(whs.filter((w: any) => w.type === "main").length).toBe(2);
    expect(ruangBar).toBeTruthy();
    expect(ruangDapur).toBeTruthy();
    expect(whs.find((w: any) => w.type === "bar")?.area).toBe("bar");
    expect(whs.find((w: any) => w.type === "kitchen")?.area).toBe("dapur");
  });

  it("receiving auto-sortir: bahan bar→Ruang Bar, dapur→Ruang Dapur", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB"); // Bahan Bar
    const rice = prods.find((p: any) => p.sku === "RICE"); // Bahan Dapur
    const beanBefore = await onHandAt("BEAN-ARB", ruangBar.id);
    const riceBefore = await onHandAt("RICE", ruangDapur.id);

    const rec = await svc.createReceiving({
      supplier: "Test",
      items: [
        { productId: bean.id, orderedQty: 100, receivedQty: 100, hpp: 0.12, qc: "pass" },
        { productId: rice.id, orderedQty: 200, receivedQty: 200, hpp: 0.013, qc: "pass" },
      ],
    }, null);
    await svc.completeReceiving(rec.id, null);

    expect(await onHandAt("BEAN-ARB", ruangBar.id)).toBe(beanBefore + 100);
    expect(await onHandAt("RICE", ruangDapur.id)).toBe(riceBefore + 200);
    // Bahan dapur TIDAK masuk ke Ruang Bar.
    expect(await onHandAt("RICE", ruangBar.id)).toBe(0);
  });
});
