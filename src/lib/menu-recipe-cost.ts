import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { inventoryItems, menuItems, menuRecipes, menuVariants, wmsProduct } from "@/db/schema";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// HPP menu = Σ(takaran resep × HPP bahan terkini × (1 + susut%)), dibulatkan
// sekali di akhir. Varian yang punya baris resep aktif SELALU dihitung dari
// bahan (bukan angka manual / patokan persen); varian tanpa resep tidak disentuh
// (HPP 0 = belum ada resep). Dipanggil setiap resep disimpan dan setiap HPP bahan
// berubah (edit bahan, barang masuk Kasir Gudang / WMS) supaya HPP selalu live.
export async function syncRecipeBaseCosts(
  db: Db | Tx,
  filter: { itemIds?: string[]; skus?: string[] } = {},
) {
  let itemIds = filter.itemIds;
  if (filter.skus) {
    if (!filter.skus.length) return 0;
    const affected = await db
      .selectDistinct({ itemId: menuRecipes.menuItemId })
      .from(menuRecipes)
      .where(and(inArray(menuRecipes.inventorySku, filter.skus), eq(menuRecipes.status, "active")));
    itemIds = [
      ...(itemIds ?? []),
      ...affected.map((row) => row.itemId).filter((id): id is string => Boolean(id)),
    ];
  }
  if (itemIds && !itemIds.length) return 0;

  const recipeRows = await db
    .select({
      itemId: menuRecipes.menuItemId,
      variantId: menuRecipes.variantId,
      qty: menuRecipes.qty,
      wastePct: menuRecipes.wastePct,
      unitCost: inventoryItems.unitCost,
    })
    .from(menuRecipes)
    .leftJoin(inventoryItems, eq(inventoryItems.sku, menuRecipes.inventorySku))
    .where(
      and(
        eq(menuRecipes.status, "active"),
        itemIds ? inArray(menuRecipes.menuItemId, [...new Set(itemIds)]) : undefined,
      ),
    );

  const linesByItem = new Map<string, typeof recipeRows>();
  for (const row of recipeRows) {
    if (!row.itemId) continue;
    linesByItem.set(row.itemId, [...(linesByItem.get(row.itemId) ?? []), row]);
  }
  if (!linesByItem.size) return 0;

  const variants = await db
    .select({ itemId: menuVariants.itemId, variantId: menuVariants.variantId, baseCost: menuVariants.baseCost })
    .from(menuVariants)
    .where(inArray(menuVariants.itemId, [...linesByItem.keys()]));

  let updated = 0;
  for (const variant of variants) {
    const lines = (linesByItem.get(variant.itemId) ?? []).filter(
      (line) => line.variantId === "all" || line.variantId === variant.variantId,
    );
    if (!lines.length) continue;
    const cost = Math.round(
      lines.reduce(
        (sum, line) =>
          sum +
          Number(line.qty) * Number(line.unitCost ?? 0) * (1 + Math.max(0, Number(line.wastePct ?? 0)) / 100),
        0,
      ),
    );
    if (cost === Number(variant.baseCost)) continue;
    await db
      .update(menuVariants)
      .set({ baseCost: cost, updatedAt: new Date() })
      .where(and(eq(menuVariants.itemId, variant.itemId), eq(menuVariants.variantId, variant.variantId)));
    updated++;
  }
  return updated;
}

/**
 * Produk jadi (retail: rokok, mineral) yang terhubung ke SATU baris stok berharga beli 0:
 * harga modal varian yang diketik owner menjadi harga beli stok itu (per satuan stok),
 * supaya syncRecipeBaseCosts tidak menimpa harga modal menjadi 0. Harga beli stok yang
 * sudah terisi (Receiving / Inventory) tidak pernah ditimpa.
 */
export async function seedRetailStockCosts(db: Db | Tx, itemIds: string[], recipeStatus: "active" | "draft" = "active") {
  if (!itemIds.length) return 0;
  const items = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(inArray(menuItems.id, itemIds), eq(menuItems.productType, "retail")));
  let seeded = 0;
  for (const item of items) {
    const [variants, lines] = await Promise.all([
      db.select({ variantId: menuVariants.variantId, baseCost: menuVariants.baseCost }).from(menuVariants).where(eq(menuVariants.itemId, item.id)),
      db
        .select({ variantId: menuRecipes.variantId, sku: menuRecipes.inventorySku, qty: menuRecipes.qty })
        .from(menuRecipes)
        .where(and(eq(menuRecipes.menuItemId, item.id), eq(menuRecipes.status, recipeStatus))),
    ]);
    for (const variant of variants) {
      const own = lines.filter((line) => line.variantId === "all" || line.variantId === variant.variantId);
      if (own.length !== 1 || !own[0].sku || !(Number(own[0].qty) > 0) || !(Number(variant.baseCost) > 0)) continue;
      const [material] = await db
        .select({ unitCost: inventoryItems.unitCost, packageQty: inventoryItems.packageQty })
        .from(inventoryItems)
        .where(eq(inventoryItems.sku, own[0].sku));
      if (!material || Number(material.unitCost) > 0) continue;
      const unitCost = Math.round((Number(variant.baseCost) / Number(own[0].qty)) * 10_000) / 10_000;
      await db
        .update(inventoryItems)
        .set({ unitCost, purchasePrice: Math.round(unitCost * Math.max(1, Number(material.packageQty)) * 10_000) / 10_000, updatedAt: new Date() })
        .where(eq(inventoryItems.sku, own[0].sku));
      await db.update(wmsProduct).set({ hpp: unitCost, updatedAt: new Date() }).where(eq(wmsProduct.sku, own[0].sku));
      seeded++;
    }
  }
  return seeded;
}
