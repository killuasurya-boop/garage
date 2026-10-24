/** Satuan stok Garage (gr/ml/pcs) — konversi hanya dalam dimensi yang sama, tanpa menebak densitas. */

/** Satuan resep/bahan Excel → satuan Garage. */
export function garageUnit(unit: string) {
  const u = unit.trim().toLowerCase().replace(/\*$/, "");
  if (u === "g" || u === "gram" || u === "gr") return "gr";
  if (u === "ml") return "ml";
  if (u === "pcs" || u === "pc") return "pcs";
  return u;
}

/** Convert only known units of the same dimension; never infer density. */
export function recipeQuantity(qty: number, from: string, to: string): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const source = garageUnit(from);
  const target = garageUnit(to);
  const scales: Record<string, { dimension: string; factor: number }> = {
    gr: { dimension: "mass", factor: 1 }, kg: { dimension: "mass", factor: 1000 },
    ml: { dimension: "volume", factor: 1 }, l: { dimension: "volume", factor: 1000 },
    liter: { dimension: "volume", factor: 1000 }, litre: { dimension: "volume", factor: 1000 },
    pcs: { dimension: "count", factor: 1 },
  };
  if (!source || !target) return null;
  if (source === target) return qty;
  const a = scales[source], b = scales[target];
  return a && b && a.dimension === b.dimension ? qty * a.factor / b.factor : null;
}
