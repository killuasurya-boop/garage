import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// HARGA SUPPLIER DI INVENTORY WMS — owner ubah harga beli per kemasan →
// HPP per satuan = harga ÷ isi, tersimpan ke katalog bahan (inventory_items),
// dan HPP menu yang memakai bahan ikut dihitung ulang. Bahan baru dari WMS
// langsung masuk katalog (bisa dipakai resep).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let wms: any;

async function osItem(sku: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t.getDb().select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, sku));
  return row;
}

async function menuCost(itemId: string) {
  const { eq } = await import("drizzle-orm");
  const [row] = await t
    .getDb()
    .select({ baseCost: t.schema.menuVariants.baseCost })
    .from(t.schema.menuVariants)
    .where(eq(t.schema.menuVariants.itemId, itemId));
  return Number(row?.baseCost);
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t);
  wms = await import("@/lib/wms-service");
  await t.getDb().insert(t.schema.wmsCategory).values({ name: "Bar · Syrup", area: "bar" }).onConflictDoNothing();
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Harga beli per kemasan di Inventory WMS", () => {
  let productId = "";

  it("tambah bahan dengan harga kemasan → HPP/ml otomatis & masuk katalog bahan", async () => {
    const prod = await wms.createWmsProduct({
      sku: "T-SYR",
      name: "Sirup Test",
      category: "Bar · Syrup",
      unit: "ml",
      packPrice: 110_000,
      packQty: 760,
      packName: "botol",
    });
    productId = prod.id;
    expect(Number(prod.hpp)).toBeCloseTo(144.7368, 4);

    const item = await osItem("T-SYR");
    expect(item).toBeTruthy();
    expect(Number(item.unitCost)).toBeCloseTo(144.7368, 4);
    expect(Number(item.purchasePrice)).toBe(110_000);
    expect(Number(item.packageQty)).toBe(760);
    expect(item.packageSize).toBe("botol 760 ml");
    expect(item.usageArea).toBe("bar");

    const rows = await wms.getWmsProducts();
    const row = rows.find((r: any) => r.sku === "T-SYR");
    expect(row.packPrice).toBe(110_000);
    expect(row.packQty).toBe(760);
    expect(row.packageLabel).toBe("botol 760 ml");
  });

  it("harga supplier naik → HPP bahan & HPP menu ikut naik", async () => {
    await t.getDb().insert(t.schema.menuRecipes).values({
      menuItemId: "itm-coffee",
      variantId: "all",
      inventorySku: "T-SYR",
      qty: 20,
      unit: "ml",
    });
    const { syncRecipeBaseCosts } = await import("@/lib/menu-recipe-cost");
    await syncRecipeBaseCosts(t.getDb(), { skus: ["T-SYR"] });
    expect(await menuCost("itm-coffee")).toBe(Math.round(20 * (110_000 / 760)));

    await wms.updateWmsProduct(productId, { packPrice: 125_000, packQty: 760 });
    const item = await osItem("T-SYR");
    expect(Number(item.purchasePrice)).toBe(125_000);
    expect(Number(item.unitCost)).toBeCloseTo(125_000 / 760, 4);
    expect(await menuCost("itm-coffee")).toBe(Math.round(20 * (125_000 / 760)));
  });

  it("edit nama/min di WMS tersimpan ke katalog (tidak tertimpa sinkron)", async () => {
    await wms.updateWmsProduct(productId, { name: "Sirup Test Baru", minStock: 1520 });
    const item = await osItem("T-SYR");
    expect(item.name).toBe("Sirup Test Baru");
    expect(Number(item.min)).toBe(1520);
    // HPP tidak berubah bila harga tidak diubah.
    expect(Number(item.unitCost)).toBeCloseTo(125_000 / 760, 4);
  });
});
