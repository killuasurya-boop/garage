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

  it("varian menu (Hot/Cold) tetap cocok ke resep dasar", async () => {
    const beanBefore = (await bySku("BEAN-ARB")).onHand;
    const res = await svc.processPosSale({ items: [{ name: "Kopi Susu Garage (Hot)", qty: 1 }] });
    expect(res.processed.length).toBe(1);
    expect((await bySku("BEAN-ARB")).onHand).toBe(beanBefore - 18);
  });

  it("idempotensi: ref penjualan sama diproses ulang → tidak dobel potong", async () => {
    const beanBefore = (await bySku("BEAN-ARB")).onHand;
    const first = await svc.processPosSale({ ref: "ORDER-XYZ", items: [{ name: "Kopi Susu Garage", qty: 1 }] });
    expect(first.processed.length).toBe(1);
    const beanAfterFirst = (await bySku("BEAN-ARB")).onHand;
    expect(beanAfterFirst).toBe(beanBefore - 18);

    // Retry webhook dengan ref yang sama → stok TIDAK berubah lagi.
    const second = await svc.processPosSale({ ref: "ORDER-XYZ", items: [{ name: "Kopi Susu Garage", qty: 1 }] });
    expect(second.processed.length).toBe(1); // dikembalikan order lama (idempoten)
    expect((await bySku("BEAN-ARB")).onHand).toBe(beanAfterFirst);
  });
});
