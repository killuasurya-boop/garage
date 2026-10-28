// Quick Retail Sale / Penjualan Langsung (PRD V4.0 §09.3, POS-05).
// Produk kemasan (air mineral, rokok, snack) dijual tanpa meja & tanpa label
// take away; bayar saat itu juga, tanpa tiket Bar/Dapur. Kanal disimpan di
// `orders.channel` (order_source tetap "pos" supaya alur koreksi/void sama).

import { isDirectHandoverMenu } from "@/lib/garage-production-rules";

export const QUICK_RETAIL_CHANNEL = "Penjualan Langsung";

/** Produk yang boleh dijual lewat Penjualan Langsung. */
export function isQuickRetailProduct(menu: {
  productType?: string | null;
  station?: string | null;
  category?: string | null;
}) {
  return menu.productType === "retail" || isDirectHandoverMenu(menu);
}

export function isQuickRetailChannel(channel: string | null | undefined) {
  return (channel ?? "").trim().toLowerCase() === QUICK_RETAIL_CHANNEL.toLowerCase();
}

/**
 * Cari produk dari input kasir/scanner: barcode & SKU (produk atau varian)
 * persis dulu, lalu nama mengandung kata kunci. Hasil exact = kandidat
 * "Enter langsung masuk keranjang".
 */
export function matchQuickRetail<
  T extends {
    name: string;
    sku?: string | null;
    barcode?: string | null;
    variants: Array<{ id: string; sku?: string | null; barcode?: string | null }>;
  },
>(items: T[], query: string): { exact: { item: T; variantId: string } | null; results: T[] } {
  const raw = query.trim();
  if (!raw) return { exact: null, results: items };
  const code = raw.toUpperCase();
  for (const item of items) {
    for (const variant of item.variants) {
      if (
        (variant.barcode && variant.barcode.toUpperCase() === code) ||
        (variant.sku && variant.sku.toUpperCase() === code)
      ) {
        return { exact: { item, variantId: variant.id }, results: [item] };
      }
    }
    if (
      ((item.barcode && item.barcode.toUpperCase() === code) || (item.sku && item.sku.toUpperCase() === code)) &&
      item.variants.length === 1
    ) {
      return { exact: { item, variantId: item.variants[0].id }, results: [item] };
    }
  }
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  const results = items.filter((item) => {
    const haystack = `${item.name} ${item.sku ?? ""} ${item.barcode ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  return { exact: null, results };
}
