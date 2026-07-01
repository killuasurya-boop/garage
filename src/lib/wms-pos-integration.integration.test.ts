import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 7 — Integrasi POS: processPosSale → baca BOM resep → potong bahan.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  const prods = await svc.getWmsProducts();
  const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
  const milk = prods.find((p: any) => p.sku === "MILK-FC");
  await svc.createWmsRecipe({
    name: "Kopi Susu Garage",
    category: "Coffee",
    sellPrice: 18000,
    bom: [
      { productId: bean.id, qty: 18 },
      { productId: milk.id, qty: 150 },
    ],
  });
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function bySku(sku: string) {
  return (await svc.getWmsProducts()).find((p: any) => p.sku === sku);
}

describe("POS sale → WMS consume", () => {
  it("jual 2 Kopi Susu → BEAN -36, MILK -300 (BOM × qty)", async () => {
    const beanBefore = (await bySku("BEAN-ARB")).onHand;
    const milkBefore = (await bySku("MILK-FC")).onHand;

    const res = await svc.processPosSale({ items: [{ name: "Kopi Susu Garage", qty: 2 }] });
    expect(res.processed.length).toBe(1);
    expect(res.processed[0].menu).toBe("Kopi Susu Garage");

    expect((await bySku("BEAN-ARB")).onHand).toBe(beanBefore - 36);
    expect((await bySku("MILK-FC")).onHand).toBe(milkBefore - 300);
  });

  it("menu tanpa resep WMS → dilewati, tidak error", async () => {
    const res = await svc.processPosSale({ items: [{ name: "Menu Tak Terdaftar", qty: 1 }] });
    expect(res.processed.length).toBe(0);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].reason).toMatch(/tanpa resep/i);
  });
});
