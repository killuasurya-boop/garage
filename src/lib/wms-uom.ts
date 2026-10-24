import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { inventoryItems, menuItems, menuRecipes, menuVariants, wmsProduct, wmsProductUom } from "@/db/schema";
import { countPack, packNameFromLabel, portionsPerPack, type PackUom } from "@/lib/stock-uom";

// =============================================================================
// GARAGE WMS — kemasan per bahan (ERPNext UOM Conversion). Kemasan tersimpan di
// wms_product_uom menang; bahan tanpa baris memakai default dari katalog OS
// (inventory_items.packageQty + nama di packageSize). Satuan dasar tetap kebenaran.
// =============================================================================

type Db = ReturnType<typeof getDb>;

/** Kemasan per produk WMS (tersimpan, atau default katalog). */
export async function loadProductUoms(productIds: string[], db: Db = getDb()): Promise<Map<string, PackUom[]>> {
  const ids = [...new Set(productIds)];
  const result = new Map<string, PackUom[]>();
  if (!ids.length) return result;
  const stored = await db.select().from(wmsProductUom).where(inArray(wmsProductUom.productId, ids));
  for (const row of stored) {
    const list = result.get(row.productId) ?? [];
    list.push({ uom: row.uom, factor: Number(row.factor), isPurchase: row.isPurchase, isCount: row.isCount });
    result.set(row.productId, list);
  }
  const missing = ids.filter((id) => !result.has(id));
  if (missing.length) {
    const rows = await db
      .select({ id: wmsProduct.id, unit: wmsProduct.unit, packageQty: inventoryItems.packageQty, packageSize: inventoryItems.packageSize })
      .from(wmsProduct)
      .innerJoin(inventoryItems, eq(inventoryItems.sku, wmsProduct.sku))
      .where(inArray(wmsProduct.id, missing));
    for (const r of rows) {
      const factor = Number(r.packageQty);
      if (!(factor > 1)) continue;
      const name = packNameFromLabel(r.packageSize);
      result.set(r.id, [{ uom: name && name !== r.unit.toLowerCase() ? name : "kemasan", factor, isPurchase: true, isCount: true }]);
    }
  }
  return result;
}

export async function listProductUoms(productId: string) {
  const db = getDb();
  const stored = await db.select().from(wmsProductUom).where(eq(wmsProductUom.productId, productId));
  return {
    stored: stored.length > 0,
    uoms: (await loadProductUoms([productId], db)).get(productId) ?? [],
  };
}

/** Ganti daftar kemasan satu bahan (Owner/Manajer). Kosong = pakai default katalog. */
export async function saveProductUoms(productId: string, uoms: PackUom[]) {
  const db = getDb();
  const [prod] = await db.select({ unit: wmsProduct.unit }).from(wmsProduct).where(eq(wmsProduct.id, productId)).limit(1);
  if (!prod) throw new Error("Bahan tidak ditemukan.");
  const seen = new Set<string>();
  const clean = uoms.map((u) => ({ ...u, uom: u.uom.trim().toLowerCase(), factor: Math.round(Number(u.factor) * 10_000) / 10_000 }));
  for (const u of clean) {
    if (!/^[a-z][a-z ]{0,19}$/.test(u.uom)) throw new Error(`Nama kemasan "${u.uom}" tidak valid (huruf saja).`);
    if (u.uom === prod.unit.toLowerCase()) throw new Error(`Kemasan tidak boleh sama dengan satuan dasar (${prod.unit}).`);
    if (!(u.factor > 1)) throw new Error(`Isi ${u.uom} harus lebih dari 1 ${prod.unit}.`);
    if (seen.has(u.uom)) throw new Error(`Kemasan "${u.uom}" ganda.`);
    seen.add(u.uom);
  }
  // Tepat satu default beli & hitung bila ada kemasan.
  if (clean.length && !clean.some((u) => u.isPurchase)) clean[0].isPurchase = true;
  if (clean.length && !clean.some((u) => u.isCount)) clean[clean.length - 1].isCount = true;
  return db.transaction(async (tx) => {
    await tx.delete(wmsProductUom).where(eq(wmsProductUom.productId, productId));
    if (clean.length) {
      await tx.insert(wmsProductUom).values(
        clean.map((u, i) => ({
          productId,
          uom: u.uom,
          factor: u.factor,
          isPurchase: !!u.isPurchase && clean.findIndex((x) => x.isPurchase) === i,
          isCount: !!u.isCount && clean.findIndex((x) => x.isCount) === i,
        })),
      );
    }
    return (await loadProductUoms([productId], tx as unknown as Db)).get(productId) ?? [];
  });
}

/**
 * Hasil porsi per kemasan dari resep aktif: "1 kotak ≈ 4 porsi Es Teh (Ice)".
 * Qty resep termasuk % susut (sama dengan potong stok penjualan).
 */
export async function getPortionYield(productId: string) {
  const db = getDb();
  const [prod] = await db.select({ sku: wmsProduct.sku, unit: wmsProduct.unit }).from(wmsProduct).where(eq(wmsProduct.id, productId)).limit(1);
  if (!prod) return [];
  const pack = countPack((await loadProductUoms([productId], db)).get(productId));
  const rows = await db
    .select({
      menuName: menuItems.name,
      variantId: menuRecipes.variantId,
      variantLabel: menuVariants.label,
      qty: menuRecipes.qty,
      unit: menuRecipes.unit,
      wastePct: menuRecipes.wastePct,
    })
    .from(menuRecipes)
    .innerJoin(menuItems, eq(menuItems.id, menuRecipes.menuItemId))
    .leftJoin(menuVariants, and(eq(menuVariants.itemId, menuRecipes.menuItemId), eq(menuVariants.variantId, menuRecipes.variantId)))
    .where(and(eq(menuRecipes.inventorySku, prod.sku), eq(menuRecipes.status, "active")));
  return rows
    .map((r) => {
      const perPortion = Math.round(Number(r.qty) * (1 + Number(r.wastePct ?? 0) / 100) * 10_000) / 10_000;
      return {
        menu: r.variantId === "all" || !r.variantLabel ? r.menuName : `${r.menuName} (${r.variantLabel})`,
        perPortion,
        unit: r.unit,
        pack: pack?.uom ?? null,
        portions: pack ? portionsPerPack(perPortion, pack.factor) : null,
      };
    })
    .sort((a, b) => a.menu.localeCompare(b.menu, "id"));
}
