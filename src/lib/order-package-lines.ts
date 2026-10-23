/**
 * Kelompokkan baris order paket event (komponen dengan groupId sama) menjadi satu baris paket
 * berharga final + daftar komponen tanpa harga. Baris non-paket dikembalikan apa adanya.
 */
export type PackageAwareLine = {
  itemName: string;
  variantLabel: string;
  qty: number;
  lineTotal: number;
  menuItemId?: string | null;
  note?: string | null;
  package?: { groupId: string; entryName: string; packagePrice: number; entryQuantity: number } | null;
};

export type GroupedOrderLine<T extends PackageAwareLine> =
  | { kind: "item"; line: T }
  | { kind: "package"; groupId: string; name: string; qty: number; total: number; components: T[] };

export function groupOrderLines<T extends PackageAwareLine>(lines: T[]): Array<GroupedOrderLine<T>> {
  const result: Array<GroupedOrderLine<T>> = [];
  const packages = new Map<string, Extract<GroupedOrderLine<T>, { kind: "package" }>>();
  for (const line of lines) {
    const pkg = line.package;
    if (!pkg) {
      result.push({ kind: "item", line });
      continue;
    }
    let group = packages.get(pkg.groupId);
    if (!group) {
      group = { kind: "package", groupId: pkg.groupId, name: pkg.entryName, qty: pkg.entryQuantity, total: 0, components: [] };
      packages.set(pkg.groupId, group);
      result.push(group);
    }
    group.components.push(line);
    // Jumlah komponen = harga paket × qty (alokasi server selalu pas ke rupiah).
    group.total += line.lineTotal;
  }
  // Jumlah paket dari total ÷ harga paket — tetap benar setelah refund/pisah sebagian paket.
  for (const group of packages.values()) {
    const price = group.components[0]?.package?.packagePrice ?? 0;
    if (price > 0) group.qty = Math.max(1, Math.round(group.total / price));
  }
  return result;
}

/** "Gula Aren Cold" — label komponen tanpa "Regular". */
export function componentLabel(line: Pick<PackageAwareLine, "itemName" | "variantLabel" | "qty">, packageQty = 1) {
  const variant = line.variantLabel && line.variantLabel.toLowerCase() !== "regular" ? ` ${line.variantLabel}` : "";
  const perPackage = packageQty > 0 ? line.qty / packageQty : line.qty;
  return `${perPackage > 1 ? `${perPackage}× ` : ""}${line.itemName}${variant}`;
}
