import { parseCsv } from "@/lib/bulk-import";
import { excelKeyToGarageSku } from "@/lib/master-import-plan";

export type MaterialReferenceRow = {
  row: number;
  sourceSku: string;
  sourceName: string;
  sourceCategory: "Bar" | "Dapur";
  sourceUnit: string;
  sourceMin: number | null;
  sourceHpp: number | null;
  sourceBarcode: string;
  sourceStock: number | null;
  /** Exact decoded CSV cell values, including original whitespace. */
  raw: Record<string, string>;
};
export type MaterialReferenceConfirmation = {
  sourceSku: string;
  canonicalUnit: string;
  /** Confirmed contents in canonical stock units; never inferred from Min Stok. */
  packageQty: number;
  /** Explicitly declare CSV HPP to be a package purchase price. */
  costBasis: "package";
};
export type ReferenceMaterial = {
  sku: string; name: string; alternativeName: string; category: string;
  usageArea: string; unit: string; min: number; unitCost: number;
  purchasePrice: number; packageQty: number; stage: string;
};
export type ReferenceWmsProduct = {
  id: string; sku: string; name: string; unit: string; category: string; archived: boolean; minStock?: number;
};
export type MaterialRecipeLink = {
  menuItemId: string; menuName: string; variantId: string; status: string;
  qty: number; unit: string; wmsRecipeId: string | null;
};
export type MaterialReferencePlannedRow = MaterialReferenceRow & {
  canonicalSku: string;
  status: "matched" | "ready_create" | "needs_validation" | "conflict";
  target: (ReferenceMaterial & { wmsProductId: string | null }) | null;
  issues: Array<{ code: string; message: string }>;
  metadata: { alias: string | null; minStock: number | null; canApply: boolean };
  creation: { unit: string; packageQty: number; packagePrice: number; unitCost: number; minStock: number } | null;
  recipes: MaterialRecipeLink[];
};
export type MaterialReferencePlan = {
  rows: MaterialReferencePlannedRow[];
  summary: { total: number; bar: number; dapur: number; matched: number; readyCreate: number; needsValidation: number; conflicts: number; blankStock: number; linkedActiveRecipes: number };
  warnings: string[];
};
export type MaterialReferenceResult = {
  fileName: string; fileHash: string; plan: MaterialReferencePlan;
  importId?: string; materialsCreated?: number; metadataUpdated?: number; alreadyApplied?: boolean;
};
export type MaterialReferenceStored = {
  fileName: string | null; fileHash: string | null; importedAt: string | null;
  plan: MaterialReferencePlan | null;
};

export class MaterialReferenceError extends Error {}

const HEADERS = ["SKU", "Nama", "Kategori", "Satuan", "Min Stok", "HPP", "Barcode", "Stok"];
function numberCell(value: string, field: string, row: number): number | null {
  const v = value.trim();
  if (!v) return null;
  // Uploaded source uses quoted comma thousands ("110,000"). Do not guess
  // ambiguous decimal/thousands combinations, currency symbols, or negatives.
  const normalized = /^\d{1,3}(,\d{3})+$/.test(v) ? v.replaceAll(",", "") : v;
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new MaterialReferenceError(`Baris ${row}: ${field} bukan angka nonnegatif yang dikenali.`);
  const n = Number(normalized);
  if (!Number.isFinite(n) || n > 1_000_000_000) throw new MaterialReferenceError(`Baris ${row}: ${field} di luar batas.`);
  return n;
}

export function parseMaterialReferenceCsv(text: string): MaterialReferenceRow[] {
  if (text.length > 2 * 1024 * 1024) throw new MaterialReferenceError("CSV maksimal 2 MB.");
  const grid = parseCsv(text);
  const headers = grid.shift()?.map((v) => v.trim()) ?? [];
  if (headers.length !== HEADERS.length || HEADERS.some((h, i) => h !== headers[i])) {
    throw new MaterialReferenceError(`Header CSV harus: ${HEADERS.join(", ")}.`);
  }
  const rows: MaterialReferenceRow[] = [];
  const seen = new Set<string>();
  for (const [i, cells] of grid.entries()) {
    if (cells.every((v) => !v.trim())) continue;
    const row = i + 2;
    if (rows.length >= 2000) throw new MaterialReferenceError("Maksimal 2.000 bahan.");
    if (cells.length !== HEADERS.length) throw new MaterialReferenceError(`Baris ${row}: jumlah kolom tidak sesuai.`);
    const raw = Object.fromEntries(HEADERS.map((h, j) => [h, cells[j]]));
    const sourceSku = raw.SKU.trim().toUpperCase();
    if (!/^(BAR-\d{3}|KIT-\d{3})$/.test(sourceSku) || seen.has(sourceSku)) throw new MaterialReferenceError(`Baris ${row}: SKU tidak valid atau duplikat (${sourceSku}).`);
    const category = raw.Kategori.trim();
    if (category !== "Bar" && category !== "Dapur") throw new MaterialReferenceError(`Baris ${row}: kategori harus Bar atau Dapur.`);
    if ((category === "Bar") !== sourceSku.startsWith("BAR-")) throw new MaterialReferenceError(`Baris ${row}: area dan SKU tidak sesuai.`);
    if (!raw.Nama.trim() || raw.Nama.length > 200 || !raw.Satuan.trim() || raw.Satuan.length > 30) throw new MaterialReferenceError(`Baris ${row}: nama atau satuan tidak valid.`);
    seen.add(sourceSku);
    rows.push({ row, sourceSku, sourceName: raw.Nama.trim(), sourceCategory: category,
      sourceUnit: raw.Satuan.trim(), sourceMin: numberCell(raw["Min Stok"], "Min Stok", row),
      sourceHpp: numberCell(raw.HPP, "HPP", row), sourceBarcode: raw.Barcode.trim(),
      sourceStock: numberCell(raw.Stok, "Stok", row), raw });
  }
  if (!rows.length) throw new MaterialReferenceError("CSV tidak berisi bahan.");
  return rows;
}

/** Units are compared dimensionally only where the conversion is explicit. */
function unitShape(unit: string) {
  const u = unit.trim().toLowerCase();
  if (["g", "gr", "gram"].includes(u)) return { canonical: "gr", factor: 1 };
  if (u === "kg") return { canonical: "gr", factor: 1000 };
  if (u === "ml") return { canonical: "ml", factor: 1 };
  if (["l", "liter", "litre"].includes(u)) return { canonical: "ml", factor: 1000 };
  if (["pc", "pcs"].includes(u)) return { canonical: "pcs", factor: 1 };
  return { canonical: u, factor: 1 };
}
export function referenceUnitQuantity(qty: number, sourceUnit: string, targetUnit: string): number | null {
  const a = unitShape(sourceUnit); const b = unitShape(targetUnit);
  return a.canonical === b.canonical ? qty * a.factor / b.factor : null;
}

export function planMaterialReference(
  rows: MaterialReferenceRow[],
  current: { materials: ReferenceMaterial[]; wmsProducts: ReferenceWmsProduct[]; recipesBySku?: Record<string, MaterialRecipeLink[]> },
  confirmations: MaterialReferenceConfirmation[] = [],
): MaterialReferencePlan {
  const bySku = new Map(current.materials.map((m) => [m.sku, m]));
  const wms = new Map(current.wmsProducts.map((m) => [m.sku, m]));
  const confirmed = new Map(confirmations.map((c) => [c.sourceSku, c]));
  if (confirmed.size !== confirmations.length || confirmations.some((c) => !rows.some((r) => r.sourceSku === c.sourceSku))) throw new MaterialReferenceError("Konfirmasi bahan duplikat atau SKU tidak ada dalam CSV.");
  const planned: MaterialReferencePlannedRow[] = rows.map((r) => {
    const canonicalSku = excelKeyToGarageSku(r.sourceSku);
    const existing = bySku.get(canonicalSku); const product = wms.get(canonicalSku);
    const issues: MaterialReferencePlannedRow["issues"] = [];
    const add = (code: string, message: string) => issues.push({ code, message });
    let status: MaterialReferencePlannedRow["status"] = existing ? "matched" : "needs_validation";
    let canApply = Boolean(existing && product && !product.archived && existing.stage === "active");
    let minStock: number | null = existing && r.sourceMin !== null ? referenceUnitQuantity(r.sourceMin, r.sourceUnit, existing.unit) : null;
    let creation: MaterialReferencePlannedRow["creation"] = null;
    // A legacy BAR-9NN row would be a duplicate identity, never a new material.
    const duplicateAlias = canonicalSku !== r.sourceSku && (bySku.has(r.sourceSku) || wms.has(r.sourceSku));
    if (duplicateAlias) {
      status = "conflict"; canApply = false; add("duplicate_alias", "SKU sumber dan SKU kanonik sama-sama ada. Rekonsiliasi manual; tidak dibuat bahan baru.");
    }
    if (existing) {
      if (existing.usageArea !== r.sourceCategory.toLowerCase()) { status = "conflict"; canApply = false; add("area_conflict", "Area bahan berbeda dari sumber; area Garage dipertahankan."); }
      if (referenceUnitQuantity(1, r.sourceUnit, existing.unit) === null) { status = "conflict"; canApply = false; minStock = null; add("unit_conflict", `Satuan sumber ${r.sourceUnit} belum setara dengan ${existing.unit}; minimum tidak diubah.`); }
      if (!product) { canApply = false; add("missing_wms", "Bahan belum terhubung ke master WMS; perlu sinkronisasi terverifikasi."); }
      if (product && unitShape(product.unit).canonical !== unitShape(existing.unit).canonical) { status = "conflict"; canApply = false; add("wms_unit_conflict", "Satuan WMS dan inventaris berbeda; rekonsiliasi manual."); }
      if (existing.stage !== "active" || product?.archived) { canApply = false; add("archived", "Bahan draft/arsip tidak diaktifkan kembali oleh impor."); }
      if (r.sourceHpp !== null && Math.abs(r.sourceHpp - existing.purchasePrice) > 0.0001) add("price_conflict", "HPP sumber berbeda dari harga kemasan Garage. Biaya Garage tetap dipertahankan.");
    } else if (product) {
      status = "conflict"; canApply = false; add("missing_inventory", "SKU sudah ada di WMS tetapi belum terhubung inventaris; jangan buat duplikat.");
    } else {
      // Names alone never create aliases; only stable known SKU crosswalk does.
      const sameName = current.materials.find((m) => m.usageArea === r.sourceCategory.toLowerCase() && m.name.trim().toLowerCase() === r.sourceName.toLowerCase());
      const c = confirmed.get(r.sourceSku);
      if (sameName) { status = "conflict"; add("name_conflict", `Nama sama dengan ${sameName.sku}; cocokkan identitas manual.`); }
      else if (c) {
        const unit = c.canonicalUnit.trim().toLowerCase();
        if (!/^[a-z]{1,20}$/.test(unit) || !Number.isFinite(c.packageQty) || c.packageQty <= 0 || c.packageQty > 1_000_000_000 || c.costBasis !== "package" || r.sourceHpp === null || r.sourceHpp <= 0) throw new MaterialReferenceError(`Konfirmasi isi/harga/satuan ${r.sourceSku} tidak valid.`);
        if (["kg", "g", "gram", "l", "liter", "pc"].includes(unit)) throw new MaterialReferenceError(`Gunakan satuan stok kanonik gr, ml, pcs atau satuan kemasan eksplisit untuk ${r.sourceSku}.`);
        const normalizedMin = r.sourceMin === null ? null : referenceUnitQuantity(r.sourceMin, r.sourceUnit, unit);
        if (r.sourceMin !== null && normalizedMin === null) add("minimum_unverified", "Satuan minimum sumber belum setara; minimum operasional baru tetap 0.");
        creation = { unit, packageQty: c.packageQty, packagePrice: r.sourceHpp, unitCost: Math.round(r.sourceHpp / c.packageQty * 10_000) / 10_000, minStock: normalizedMin ?? 0 };
        status = "ready_create";
      } else add("package_unverified", "HPP CSV belum memiliki basis biaya/isi kemasan. Konfirmasi satuan stok dan isi kemasan sebelum membuat bahan.");
    }
    if (duplicateAlias) { status = "conflict"; canApply = false; creation = null; }
    if (r.sourceStock === null) add("stock_unknown", "Stok sumber kosong, bukan nol; impor tidak membuat stok awal.");
    else add("stock_reference_only", "Angka stok sumber disimpan sebagai referensi; stok fisik tetap melalui penerimaan/opname.");
    if (r.sourceHpp !== null) add("cost_reference_only", "HPP sumber adalah angka referensi; Min Stok bukan isi kemasan.");
    return { ...r, canonicalSku, status, target: existing ? { ...existing, wmsProductId: product?.id ?? null } : null,
      issues, metadata: { alias: existing && r.sourceName !== existing.name ? r.sourceName : null, minStock, canApply }, creation,
      recipes: current.recipesBySku?.[canonicalSku] ?? [] };
  });
  return { rows: planned, summary: { total: planned.length, bar: planned.filter((r) => r.sourceCategory === "Bar").length,
    dapur: planned.filter((r) => r.sourceCategory === "Dapur").length,
    matched: planned.filter((r) => r.status === "matched").length, readyCreate: planned.filter((r) => r.status === "ready_create").length,
    needsValidation: planned.filter((r) => r.status === "needs_validation").length, conflicts: planned.filter((r) => r.status === "conflict").length,
    blankStock: planned.filter((r) => r.sourceStock === null).length,
    linkedActiveRecipes: planned.reduce((sum, r) => sum + r.recipes.filter((l) => l.status === "active").length, 0) },
    warnings: ["CSV tidak memuat takaran resep. Resep aktif tetap dipertahankan; bahan tanpa resep ditandai belum terhubung.", "Kolom HPP dan Min Stok disimpan persis sebagai referensi, tidak dipakai menebak isi kemasan atau stok awal."] };
}
