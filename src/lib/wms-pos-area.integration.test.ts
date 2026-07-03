import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS — Auto-consume POS PER AREA: bahan bar→gudang Bar, dapur→Dapur, umum→utama.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let barWh: any;
let kitWh: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.listWmsCategories(); // seed kategori (Bahan Bar→bar, Bahan Dapur→dapur, Kemasan→umum)
  await svc.getWmsProducts(); // seed produk contoh
  const whs = await svc.listWmsWarehouses();
  barWh = whs.find((w: any) => w.type === "bar");
  kitWh = whs.find((w: any) => w.type === "kitchen");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function onHandAt(sku: string, whId: string) {
  return (await svc.getWmsProducts({ warehouseId: whId })).find((p: any) => p.sku === sku)?.onHand ?? 0;
}

describe("processPosSale routing per area", () => {
  it("menu campur → bahan bar ke gudang Bar, bahan dapur ke gudang Dapur", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB"); // Bahan Bar → bar
    const rice = prods.find((p: any) => p.sku === "RICE"); // Bahan Dapur → dapur
    const cup = prods.find((p: any) => p.sku === "CUP-16"); // Kemasan → umum

    await svc.createWmsRecipe({
      name: "Menu Campur",
      category: "Coffee",
      sellPrice: 25000,
      bom: [
        { productId: bean.id, qty: 10 },
        { productId: rice.id, qty: 20 },
        { productId: cup.id, qty: 1 },
      ],
    });

    const res = await svc.processPosSale({ ref: "ORDER-AREA-1", items: [{ name: "Menu Campur", qty: 1 }] }, null);
    expect(res.processed.length).toBe(1);

    // Bahan bar (kopi) masuk ke gudang Bar; bahan dapur (beras) ke gudang Dapur.
    expect(await onHandAt("BEAN-ARB", barWh.id)).toBe(10);
    expect(await onHandAt("RICE", kitWh.id)).toBe(20);
    // Beras TIDAK masuk ke Bar; kopi TIDAK masuk ke Dapur.
    expect(await onHandAt("RICE", barWh.id)).toBe(0);
    expect(await onHandAt("BEAN-ARB", kitWh.id)).toBe(0);
    // Kemasan (umum) ikut outlet utama (bar; tie bar>=dapur).
    expect(await onHandAt("CUP-16", barWh.id)).toBe(1);
  });

  it("idempotensi: ulang sale ref sama → tidak dobel potong", async () => {
    const beanBarBefore = await onHandAt("BEAN-ARB", barWh.id);
    const res = await svc.processPosSale({ ref: "ORDER-AREA-1", items: [{ name: "Menu Campur", qty: 1 }] }, null);
    expect(res.processed.length).toBe(1);
    expect(await onHandAt("BEAN-ARB", barWh.id)).toBe(beanBarBefore); // tak berubah
  });
});
