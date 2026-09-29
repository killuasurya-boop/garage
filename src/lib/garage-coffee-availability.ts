// Auto-habis: ketersediaan menu diturunkan dari stok bahan RESEP di gudang.
// Menu otomatis "habis" di POS & menu digital bila tidak ada satu varian pun
// yang bisa dibuat 1 porsi dari stok bahan utama — tanpa kasir menandai manual.
//
// Bahan pelengkap (kemasan: cup/sedotan, es batu) sengaja diabaikan supaya menu
// tidak habis gara-gara hal sepele. Aktif hanya bila setting
// `autoSoldOutFromStock` dinyalakan (setelah stock opname pembukaan).
//
// Menggantikan peta ID kopi lama (coffee-*) yang menunjuk bahan dummy terhapus.

export type RecipeLineStock = {
  variantId: string; // "all" = berlaku untuk semua varian
  qty: number; // takaran per porsi, satuan stok bahan
  wastePct: number;
  onHand: number; // stok bahan saat ini (cermin total gudang WMS)
  category: string; // kategori bahan
};

/** Bahan pelengkap yang tidak membuat menu habis. */
export function isMinorIngredientCategory(category: string): boolean {
  return /kemasan|packaging|es batu/i.test(category);
}

/**
 * True bila menu HABIS: tidak ada varian yang bahan utamanya cukup untuk 1 porsi.
 * Menu tanpa baris resep (atau hanya bahan pelengkap) tidak pernah auto-habis.
 */
export function deriveSoldOutFromRecipes(variantIds: string[], lines: RecipeLineStock[]): boolean {
  const keyLines = lines.filter((line) => !isMinorIngredientCategory(line.category));
  if (keyLines.length === 0) return false;
  const ids = variantIds.length ? variantIds : ["all"];
  const canMake = (variantId: string) => {
    const own = keyLines.filter((line) => line.variantId === "all" || line.variantId === variantId);
    if (own.length === 0) return true;
    return own.every((line) => line.onHand >= line.qty * (1 + Math.max(0, line.wastePct) / 100));
  };
  return !ids.some(canMake);
}
