import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  seedGarageBasics,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// HAPUS BAHAN GUDANG — guard hard-delete: hanya boleh jika belum pernah dipakai
// (tanpa histori stok & tidak dipakai resep). Kalau dipakai → ditolak.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

async function addInventory(sku: string, name: string) {
  await t.getDb().insert(t.schema.inventoryItems).values({
    sku,
    name,
    alternativeName: "-",
    category: "Bar",
    usageArea: "bar",
    unit: "gram",
    packageSize: "1000 gram",
    onHand: 1000,
    min: 100,
    status: "safe",
    movement: "stabil",
  });
}

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t);
  svc = await import("@/lib/garage-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("deleteInventoryItem — guard hard-delete", () => {
  it("bahan bersih (belum pernah dipakai) → terhapus", async () => {
    await addInventory("ING-CLEAN", "Bahan Bersih");
    const res = await svc.deleteInventoryItem("ING-CLEAN");
    expect(res).toEqual({ sku: "ING-CLEAN" });

    const { eq } = await import("drizzle-orm");
    const rows = await t
      .getDb()
      .select()
      .from(t.schema.inventoryItems)
      .where(eq(t.schema.inventoryItems.sku, "ING-CLEAN"));
    expect(rows.length).toBe(0);
  });

  it("bahan yang punya histori stok → DITOLAK (sarankan arsipkan)", async () => {
    await addInventory("ING-USED", "Bahan Terpakai");
    await t.getDb().insert(t.schema.stockMovements).values({
      itemSku: "ING-USED",
      type: "stock_in",
      note: "Stok masuk 1kg",
      qty: 1000,
    });
    await expect(svc.deleteInventoryItem("ING-USED")).rejects.toThrow(/histori stok/i);
  });

  it("bahan yang dipakai di resep → DITOLAK", async () => {
    await addInventory("ING-RECIPE", "Bahan Resep");
    await t.getDb().insert(t.schema.menuRecipes).values({
      menuItemId: "itm-coffee",
      variantId: "all",
      inventorySku: "ING-RECIPE",
      qty: 18,
      unit: "gram",
    });
    await expect(svc.deleteInventoryItem("ING-RECIPE")).rejects.toThrow(/resep/i);
  });

  it("sku tidak ada → null", async () => {
    expect(await svc.deleteInventoryItem("TIDAK-ADA")).toBeNull();
  });
});
