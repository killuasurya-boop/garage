import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS — Penjualan POS = KONSUMSI bahan per area: bahan bar diambil dari ruang
// Bar, bahan dapur dari ruang Dapur, umum mengikuti area mayoritas resep.
// (Dulu penjualan memakai Internal Order = transfer gudang→outlet sehingga total
// stok tidak pernah berkurang; test lama mengunci perilaku salah itu.)
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

async function totalOnHand(sku: string) {
  return onHandAt(sku, "all");
}

describe("processPosSale — penjualan mengonsumsi stok per area", () => {
  let before: Record<string, number> = {};

  it("menu campur → total stok berkurang sesuai resep, tidak ada transfer ke outlet", async () => {
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

    before = {
      bean: await totalOnHand("BEAN-ARB"),
      rice: await totalOnHand("RICE"),
      cup: await totalOnHand("CUP-16"),
    };

    const res = await svc.processPosSale({ ref: "ORDER-AREA-1", items: [{ name: "Menu Campur", qty: 1 }] }, null);
    expect(res.processed.length).toBe(1);

    // Total stok benar-benar berkurang (dulu hanya pindah ruang).
    expect(await totalOnHand("BEAN-ARB")).toBe(before.bean - 10);
    expect(await totalOnHand("RICE")).toBe(before.rice - 20);
    expect(await totalOnHand("CUP-16")).toBe(before.cup - 1);
    // Tidak ada bahan yang "dipindah" ke outlet.
    expect(await onHandAt("BEAN-ARB", barWh.id)).toBe(0);
    expect(await onHandAt("RICE", kitWh.id)).toBe(0);
    expect(await onHandAt("RICE", barWh.id)).toBe(0);
    expect(await onHandAt("BEAN-ARB", kitWh.id)).toBe(0);
  });

  it("idempotensi: ulang sale ref sama → tidak dobel potong", async () => {
    const beanBefore = await totalOnHand("BEAN-ARB");
    const res = await svc.processPosSale({ ref: "ORDER-AREA-1", items: [{ name: "Menu Campur", qty: 1 }] }, null);
    expect(res.processed.length).toBe(1);
    expect(await totalOnHand("BEAN-ARB")).toBe(beanBefore); // tak berubah
  });
});
