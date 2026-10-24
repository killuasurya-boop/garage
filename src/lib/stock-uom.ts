// Satuan kemasan bertingkat (konsep ERPNext UOM Conversion). Satuan dasar (ml/gr/pcs)
// tetap kebenaran stok & HPP; kemasan (kotak/botol/dus) hanya untuk input & tampilan.
// Client-safe: tanpa akses database.

export type PackUom = { uom: string; factor: number; isPurchase?: boolean; isCount?: boolean };

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

/** Kemasan valid (factor > 1), terbesar dulu. */
export function sortedPacks(uoms: PackUom[] | null | undefined): PackUom[] {
  return (uoms ?? []).filter((u) => Number(u.factor) > 1).sort((a, b) => Number(b.factor) - Number(a.factor));
}

/** Kemasan default untuk hitung/minta (is_count), jatuh ke kemasan terkecil > 1. */
export function countPack(uoms: PackUom[] | null | undefined): PackUom | null {
  const packs = sortedPacks(uoms);
  return packs.find((u) => u.isCount) ?? packs[packs.length - 1] ?? null;
}

/** Kemasan default untuk beli/terima (is_purchase), jatuh ke kemasan terbesar. */
export function purchasePack(uoms: PackUom[] | null | undefined): PackUom | null {
  const packs = sortedPacks(uoms);
  return packs.find((u) => u.isPurchase) ?? packs[0] ?? null;
}

/**
 * Pecah qty dasar ke kemasan (terbesar dulu) + sisa satuan dasar.
 * 3250 ml dengan kotak=1000 → [{kotak,3}], sisa 250. Qty minus dipecah dari nilai absolut.
 */
export function splitPacks(qty: number, uoms: PackUom[] | null | undefined) {
  const sign = qty < 0 ? -1 : 1;
  let rest = Math.abs(Number(qty) || 0);
  const packs: Array<{ uom: string; count: number }> = [];
  for (const u of sortedPacks(uoms)) {
    const count = Math.floor(round4(rest / Number(u.factor)) + 1e-9);
    if (count > 0) {
      packs.push({ uom: u.uom, count });
      rest = round4(rest - count * Number(u.factor));
    }
  }
  return { sign, packs, rest: round4(rest) };
}

/** "3 kotak + 250 ml" · "1 dus + 5 botol" · "750 ml" · "−1 kotak" (tanpa kemasan → satuan dasar). */
export function formatPacks(qty: number, baseUnit: string, uoms: PackUom[] | null | undefined): string {
  const { sign, packs, rest } = splitPacks(qty, uoms);
  const parts = packs.map((p) => `${qtyFormat.format(p.count)} ${p.uom}`);
  if (rest > 0 || parts.length === 0) parts.push(`${qtyFormat.format(rest)} ${baseUnit}`);
  return `${sign < 0 ? "−" : ""}${parts.join(" + ")}`;
}

/** Jumlah kemasan + sisa satuan dasar → qty dasar. */
export function toBaseQty(input: { count?: number | null; factor?: number | null; rest?: number | null }): number {
  const count = Number(input.count ?? 0) || 0;
  const factor = Number(input.factor ?? 0) || 0;
  const rest = Number(input.rest ?? 0) || 0;
  return round4(count * factor + rest);
}

/** Porsi per kemasan: 1 kotak 1000 ml ÷ 250 ml/porsi = 4. Pakai qty resep termasuk susut. */
export function portionsPerPack(recipeQty: number, factor: number): number {
  if (!(recipeQty > 0) || !(factor > 0)) return 0;
  return Math.floor(round4(factor / recipeQty) + 1e-9);
}

/** Nama kemasan dari teks katalog ("kotak 1000 ml", "botol 760 ml") → "kotak". */
export function packNameFromLabel(label: string | null | undefined): string {
  const word = (label ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /^[a-z]+$/.test(word) ? word : "";
}
