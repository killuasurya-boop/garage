import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { inventoryItems, menuRecipes, menuVariants } from "@/db/schema";

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
