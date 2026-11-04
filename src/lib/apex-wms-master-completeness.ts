/**
 * APEX WMS — Master Data Completeness audit (R0).
 *
 * Source of truth: existing Garage OS Product/Supplier + UOM.
 * Presence in the database does NOT prove physical / supplier verification.
 * No data is guessed or written. Expiry dates belong to batches, not a
 * fabricated fixed expiry value on the product master.
 */
export type MasterSeverity = "blocker" | "review" | "info";
export type MasterEvidence = "PRESENT" | "MISSING" | "REVIEW" | "NOT_APPLICABLE";

export type ProductMasterInput = {
  id: string;
  sku: string;
  name: string;
  category: string;
  area: "bar" | "dapur" | "umum";
  unit: string;
  brand?: string | null;
  subcategory?: string | null;
  defaultSupplierId?: string | null;
  minStock: number;
  hpp: number;
  packPrice: number;
  packQty: number;
  packageLabel?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  uoms: Array<{ uom: string; factor: number; isPurchase: boolean; isCount: boolean }>;
};

export type SupplierMasterInput = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  picName?: string | null;
  areas?: string[] | null;
  paymentMethod?: string | null;
  productCount: number;
  note?: string | null;
};

export type MasterFinding = {
  code: string;
  severity: MasterSeverity;
  scope: "product" | "supplier";
  id: string;
  sku?: string;
  label: string;
  field: string;
  state: MasterEvidence;
  explanation: string;
  action: string;
};

const nonEmpty = (s: string | null | undefined) => !!s?.trim();
const finitePositive = (v: number) => Number.isFinite(v) && v > 0;
const isRestricted = (category: string) => /(^|[\s·/-])(rokok|tobacco|tembakau)([\s·/-]|$)/i.test(category);

/**
 * Checks source fields only. A PASS cannot authorize PO, price change,
 * inventory movement, accounting entries or approval.
 */
export function assessMasterData(
  products: ProductMasterInput[],
  suppliers: SupplierMasterInput[],
  dataAsOf: string,
) {
  const findings: MasterFinding[] = [];
  const ids = new Set<string>();
  const fieldCoverage = { essentialPresent: 0, essentialExpected: 0 };
  const outOfScopeCount = products.filter((p) => isRestricted(p.category)).length;
  const allowedProducts = products.filter((p) => !isRestricted(p.category));
  // Scope this module to food/beverage/packaging; do not create procurement
  // improvement tasks for age-restricted product suppliers.
  const allowedSuppliers = suppliers.filter((s) => !/djarum|rokok|tembakau|tobacco/i.test(s.name));
  const supplierById = new Map(allowedSuppliers.map((s) => [s.id, s]));
  const supplierUsed = new Map<string, number>();
  const coverage = {
    productsWithSupplier: 0, productsWithPurchaseUom: 0,
    productsWithBrand: 0, productsWithBarcode: 0, productsWithImage: 0,
    productsWithPositiveHpp: 0, suppliersWithContact: 0, suppliersWithAddress: 0,
    suppliersWithFixedPaymentMethod: 0, suppliersLinkedToProducts: 0,
  };

  const add = (f: MasterFinding) => {
    const unique = [f.scope, f.id, f.code].join(":");
    if (ids.has(unique)) return;
    ids.add(unique);
    findings.push(f);
  };

  for (const p of allowedProducts) {
    const fields = [
      ["sku", p.sku], ["name", p.name], ["category", p.category], ["unit", p.unit],
    ] as const;
    for (const [field, value] of fields) {
      fieldCoverage.essentialExpected++;
      if (nonEmpty(value)) fieldCoverage.essentialPresent++;
      else add({
        code: "ESSENTIAL_MISSING", severity: "blocker",
        scope: "product", id: p.id, sku: p.sku, label: p.name, field,
        state: "MISSING", explanation: "Identitas utama barang belum tersedia.",
        action: "Lengkapi dari label barang atau dokumen master terverifikasi.",
      });
    }

    // A stock item may be acquired per base unit (packQty=1); do not insist
    // on invented purchase UOMs, fake GTIN or unknown brand.
    fieldCoverage.essentialExpected += 2;
    if (finitePositive(p.packQty)) fieldCoverage.essentialPresent++;
    else add({
      code: "PACK_QTY_MISSING", severity: "blocker", scope: "product",
      id: p.id, sku: p.sku, label: p.name, field: "packQty", state: "MISSING",
      explanation: "Jumlah satuan dasar per kemasan beli kosong / tidak valid.",
      action: "Cocokkan isi kemasan dengan bukti supplier / label produk.",
    });
    if (finitePositive(p.packPrice)) fieldCoverage.essentialPresent++;
    else add({
      code: "PACK_PRICE_MISSING", severity: "review", scope: "product",
      id: p.id, sku: p.sku, label: p.name, field: "packPrice", state: "MISSING",
      explanation: "Harga kemasan belum positif; HPP pembelian belum dapat diverifikasi.",
      action: "Cocokkan invoice/nota beli; jangan isi harga dengan perkiraan.",
    });

    if (nonEmpty(p.brand)) coverage.productsWithBrand++;
    if (nonEmpty(p.barcode)) coverage.productsWithBarcode++;
    if (nonEmpty(p.imageUrl)) coverage.productsWithImage++;
    if (finitePositive(p.hpp)) coverage.productsWithPositiveHpp++;

    if (p.defaultSupplierId && supplierById.has(p.defaultSupplierId)) {
      coverage.productsWithSupplier++;
      supplierUsed.set(p.defaultSupplierId, (supplierUsed.get(p.defaultSupplierId) ?? 0) + 1);
    } else {
      add({
        code: p.defaultSupplierId ? "SUPPLIER_REFERENCE_INVALID" : "SUPPLIER_NOT_LINKED",
        severity: "review", scope: "product", id: p.id, sku: p.sku,
        label: p.name, field: "defaultSupplierId", state: "REVIEW",
        explanation: "Supplier utama tidak terhubung dengan master supplier aktif.",
        action: "Pilih supplier dari bukti transaksi; tandai pembelian pasar jika tanpa supplier tetap.",
      });
    }

    const expectedArea = /^(?:Bar\s*·|Bahan Bar)/i.test(p.category)
      ? "bar" : /^(?:Dapur\s*·|Bahan Dapur)/i.test(p.category)
      ? "dapur" : null;
    if (expectedArea && p.area !== expectedArea) {
      add({
        code: "AREA_CATEGORY_MISMATCH", severity: "blocker",
        scope: "product", id: p.id, sku: p.sku, label: p.name,
        field: "area", state: "REVIEW",
        explanation: "Area barang tidak selaras dengan kategori.",
        action: "Periksa kategori dan area sebelum menetapkan aturan perpindahan / reorder.",
      });
    }

    const purchaseUoms = p.uoms.filter((u) =>
      u.isPurchase && nonEmpty(u.uom) && finitePositive(u.factor)
    );
    if (purchaseUoms.length) coverage.productsWithPurchaseUom++;
    if (p.packQty > 1 && !purchaseUoms.some((u) =>
      Math.abs(u.factor - p.packQty) < Math.max(0.0001, p.packQty * 0.00001)
    )) {
      add({
        code: "PACKAGE_UOM_MISMATCH", severity: "blocker",
        scope: "product", id: p.id, sku: p.sku, label: p.name,
        field: "uoms", state: "REVIEW",
        explanation: "Konversi satuan beli tidak sama dengan jumlah isi kemasan di master.",
        action: "Verifikasi isi kemasan; cocokkan UOM pembelian dengan packQty.",
      });
    }
    const duplicateUom = new Set<string>();
    for (const u of p.uoms) {
      const k = u.uom.toLowerCase().trim();
      if (k && duplicateUom.has(k)) add({
        code: "DUPLICATE_UOM", severity: "review", scope: "product",
        id: p.id, sku: p.sku, label: p.name, field: "uoms",
        state: "REVIEW", explanation: "Nama satuan alternatif tercatat lebih dari sekali.",
        action: "Cocokkan faktor konversi dan hilangkan duplikasi melalui workflow WMS.",
      });
      if (k) duplicateUom.add(k);
      if (!finitePositive(u.factor)) add({
        code: "INVALID_UOM_FACTOR", severity: "blocker", scope: "product",
        id: p.id, sku: p.sku, label: p.name, field: "uoms",
        state: "REVIEW", explanation: "Faktor satuan alternatif tidak positif.",
        action: "Perbaiki konversi berdasarkan isi kemasan fisik.",
      });
    }

    if (finitePositive(p.packPrice) && finitePositive(p.packQty)) {
      const expected = p.packPrice / p.packQty;
      const tolerance = Math.max(0.01, expected * 0.005);
      if (!Number.isFinite(p.hpp) || Math.abs(expected - p.hpp) > tolerance) {
        add({
          code: "HPP_PACK_CONFLICT", severity: "review", scope: "product",
          id: p.id, sku: p.sku, label: p.name, field: "hpp",
          state: "REVIEW",
          explanation: "HPP tercatat berbeda dari harga/isi kemasan. Bisa sah jika memakai rata-rata tertimbang.",
          action: "Cek histori penerimaan dan metode valuasi; jangan overwrite HPP otomatis.",
        });
      }
    }
    // Explicitly no penalty for missing barcode, image, brand, generic
    // subcategory, or product-level expiry. These are context-dependent.
  }

  for (const s of allowedSuppliers) {
    if (nonEmpty(s.phone)) coverage.suppliersWithContact++;
    if (nonEmpty(s.address)) coverage.suppliersWithAddress++;
    if (["cash", "transfer", "tempo"].includes(s.paymentMethod ?? ""))
      coverage.suppliersWithFixedPaymentMethod++;
    if ((supplierUsed.get(s.id) ?? 0) > 0) coverage.suppliersLinkedToProducts++;

    if (!nonEmpty(s.name)) add({
      code: "SUPPLIER_NAME_MISSING", severity: "blocker",
      scope: "supplier", id: s.id, label: s.name, field: "name",
      state: "MISSING", explanation: "Nama supplier wajib untuk identitas.",
      action: "Periksa nama badan usaha atau kontak sumber asli.",
    });
    if (!nonEmpty(s.phone) && !/tanpa po|beli langsung|pasar|pajak/i.test(s.note ?? "")) {
      add({
        code: "SUPPLIER_CONTACT_REVIEW", severity: "review",
        scope: "supplier", id: s.id, label: s.name, field: "phone",
        state: "REVIEW",
        explanation: "Kontak supplier belum tersedia; tidak selalu wajib untuk supplier pembelian langsung.",
        action: "Periksa apakah supplier memerlukan komunikasi WhatsApp; isi hanya nomor terverifikasi.",
      });
    }
    if ((supplierUsed.get(s.id) ?? 0) === 0 && s.productCount === 0) {
      add({
        code: "SUPPLIER_NO_PRODUCT_LINK", severity: "info",
        scope: "supplier", id: s.id, label: s.name, field: "productCount",
        state: "REVIEW",
        explanation: "Tidak ada produk aktif terhubung; supplier dapat tetap valid untuk pembelian ad hoc.",
        action: "Periksa pemakaian aktual sebelum mengarsipkan supplier.",
      });
    }
    // No forced address, bank account or payment term for direct-market suppliers.
  }

  const severityRank: Record<MasterSeverity, number> = { blocker: 0, review: 1, info: 2 };
  findings.sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    a.scope.localeCompare(b.scope) || a.label.localeCompare(b.label) ||
    a.code.localeCompare(b.code)
  );

  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const reviews = findings.filter((f) => f.severity === "review").length;
  return {
    state: blockers ? "BLOCKED" as const : reviews ? "NEEDS_REVIEW" as const : "PASS" as const,
    dataAsOf, source: "Garage OS verified database records (field presence only)",
    verificationRule: "PRESENT berarti tersedia di DB, bukan tervalidasi label/invoice secara individual.",
    executionAuthorized: false as const,
    masterReady: blockers === 0 && reviews === 0,
    metrics: {
      productsAudited: allowedProducts.length,
      productsExcludedFromThisScope: outOfScopeCount,
      suppliersAudited: allowedSuppliers.length,
      essentialCompletionPct: fieldCoverage.essentialExpected
        ? Math.round(1000 * fieldCoverage.essentialPresent / fieldCoverage.essentialExpected) / 10
        : null,
      ...coverage,
      blockers, reviews,
      findings: findings.length,
    },
    findings,
  };
}
