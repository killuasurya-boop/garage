import { createHash } from "node:crypto";

import { asc } from "drizzle-orm";

import { getDb } from "@/db";
import { menuItems, menuVariants } from "@/db/schema";

// Data POS yang DILINDUNGI dari upgrade gudang/WMS (owner, Okt 2026):
// identitas produk + varian, harga jual per varian, kategori penjualan.
// Snapshot + hash dipakai sebagai baseline sebelum/sesudah perubahan; HPP
// (baseCost), stok, foto, urutan dan flag tampilan sengaja tidak ikut karena
// boleh berubah tanpa melanggar aturan.
export type PosBaselineItem = {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  section: string;
  productType: string;
  status: string;
  variants: Array<{ variantId: string; label: string; price: number; sku: string | null }>;
};

export type PosBaseline = {
  takenAt: string;
  itemCount: number;
  variantCount: number;
  hash: string;
  items: PosBaselineItem[];
};

export async function getPosBaseline(): Promise<PosBaseline> {
  const db = getDb();
  const items = await db
    .select({
      id: menuItems.id,
      sku: menuItems.sku,
      name: menuItems.name,
      category: menuItems.category,
      section: menuItems.section,
      productType: menuItems.productType,
      status: menuItems.status,
    })
    .from(menuItems)
    .orderBy(asc(menuItems.id));
  const variants = await db
    .select({
      itemId: menuVariants.itemId,
      variantId: menuVariants.variantId,
      label: menuVariants.label,
      price: menuVariants.price,
      sku: menuVariants.sku,
    })
    .from(menuVariants)
    .orderBy(asc(menuVariants.itemId), asc(menuVariants.variantId));

  const byItem = new Map<string, PosBaselineItem["variants"]>();
  for (const v of variants) {
    if (!v.itemId) continue;
    const list = byItem.get(v.itemId) ?? [];
    list.push({ variantId: v.variantId, label: v.label, price: Number(v.price), sku: v.sku });
    byItem.set(v.itemId, list);
  }
  const rows: PosBaselineItem[] = items.map((item) => ({ ...item, variants: byItem.get(item.id) ?? [] }));
  const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  return {
    takenAt: new Date().toISOString(),
    itemCount: rows.length,
    variantCount: rows.reduce((sum, row) => sum + row.variants.length, 0),
    hash,
    items: rows,
  };
}

/** Bandingkan dua baseline; daftar perbedaan kosong = data POS terlindungi utuh. */
export function diffPosBaseline(before: PosBaseline, after: PosBaseline): string[] {
  const diffs: string[] = [];
  const afterById = new Map(after.items.map((item) => [item.id, item]));
  for (const item of before.items) {
    const next = afterById.get(item.id);
    if (!next) {
      diffs.push(`Produk ${item.id} (${item.name}) hilang.`);
      continue;
    }
    for (const key of ["sku", "name", "category", "section", "productType", "status"] as const) {
      if (item[key] !== next[key]) diffs.push(`Produk ${item.id}: ${key} "${item[key]}" → "${next[key]}".`);
    }
    const nextVariants = new Map(next.variants.map((v) => [v.variantId, v]));
    for (const v of item.variants) {
      const nv = nextVariants.get(v.variantId);
      if (!nv) diffs.push(`Varian ${item.id}/${v.variantId} hilang.`);
      else if (nv.price !== v.price || nv.label !== v.label || nv.sku !== v.sku) {
        diffs.push(`Varian ${item.id}/${v.variantId}: ${v.label} Rp${v.price} → ${nv.label} Rp${nv.price}.`);
      }
    }
    for (const v of next.variants) {
      if (!item.variants.some((x) => x.variantId === v.variantId)) diffs.push(`Varian baru ${item.id}/${v.variantId}.`);
    }
  }
  const beforeIds = new Set(before.items.map((item) => item.id));
  for (const item of after.items) if (!beforeIds.has(item.id)) diffs.push(`Produk baru ${item.id} (${item.name}).`);
  return diffs;
}
