import { describe, expect, it } from "vitest";
import { assessMasterData, type ProductMasterInput, type SupplierMasterInput } from "@/lib/apex-wms-master-completeness";

const supplier: SupplierMasterInput = {
  id: "s1", name: "Pemasok Bar", phone: "0812345678", address: "",
  picName: "", areas: ["bar"], paymentMethod: "transfer", productCount: 1, note: "",
};

const product: ProductMasterInput = {
  id: "p1", sku: "BAR-018", name: "Fresh Milk",
  category: "Bar · Susu & Krimer", area: "bar", unit: "ml",
  brand: "", subcategory: "", defaultSupplierId: "s1", minStock: 22704,
  hpp: 12.1785, packPrice: 276500, packQty: 22704,
  packageLabel: "dus 24 × 946 ml", barcode: null, imageUrl: null,
  uoms: [
    { uom: "dus", factor: 22704, isPurchase: true, isCount: false },
    { uom: "botol", factor: 946, isPurchase: false, isCount: true },
  ],
};

const check = (p: ProductMasterInput[] = [product], s: SupplierMasterInput[] = [supplier]) =>
  assessMasterData(p, s, "2026-11-01T10:00:00Z");

describe("APEX WMS Master Data Completion audit", () => {
  it("accepts well-formed packaging with rounding, even without barcode or photo", () => {
    const r = check();
    expect(r.state).toBe("PASS");
    expect(r.executionAuthorized).toBe(false);
    expect(r.metrics.productsAudited).toBe(1);
    expect(r.metrics.essentialCompletionPct).toBe(100);
    expect(r.findings).toHaveLength(0);
  });

  it("flags unlinked supplier as a review, not a fictitious new supplier", () => {
    const r = check([{ ...product, defaultSupplierId: null }]);
    expect(r.state).toBe("NEEDS_REVIEW");
    expect(r.findings.some((f) => f.code === "SUPPLIER_NOT_LINKED")).toBe(true);
    expect(r.executionAuthorized).toBe(false);
  });

  it("rejects inconsistent purchase conversion", () => {
    const r = check([{ ...product, packQty: 1000 }]);
    expect(r.findings.some((f) => f.code === "PACKAGE_UOM_MISMATCH")).toBe(true);
    expect(r.state).toBe("BLOCKED");
  });

  it("identifies invalid essentials but does not fabricate replacement", () => {
    const r = check([{ ...product, sku: "", packPrice: 0, packQty: 0 }]);
    expect(r.metrics.essentialCompletionPct).toBe(50);
    expect(r.findings.map((f) => f.code)).toContain("ESSENTIAL_MISSING");
    expect(r.findings.map((f) => f.code)).toContain("PACK_QTY_MISSING");
    expect(r.findings.map((f) => f.code)).toContain("PACK_PRICE_MISSING");
  });

  it("does not auto-overwrite HPP on weighted average valuation differences", () => {
    const r = check([{ ...product, hpp: 11 }]);
    expect(r.findings.some((f) => f.code === "HPP_PACK_CONFLICT")).toBe(true);
    expect(r.executionAuthorized).toBe(false);
  });

  it("keeps direct-market supplier without WhatsApp as valid", () => {
    const r = check([product], [{ ...supplier, phone: "", note: "BELI LANGSUNG TANPA PO dari pasar" }]);
    expect(r.findings.some((f) => f.code === "SUPPLIER_CONTACT_REVIEW")).toBe(false);
    expect(r.metrics.suppliersWithContact).toBe(0);
  });

  it("allows a product to be purchased in base unit without any alternative UOM", () => {
    const r = check([{
      ...product, packQty: 1, packPrice: 1500, hpp: 1500,
      unit: "pcs", uoms: [], packageLabel: "pcs",
    }]);
    expect(r.findings.some((f) => f.code === "PACKAGE_UOM_MISMATCH")).toBe(false);
  });

  it("flags wrong area and duplicated UOM labels deterministically", () => {
    const r = check([{ ...product, area: "dapur", uoms: [
      { uom: "dus", factor: 22704, isPurchase: true, isCount: true },
      { uom: "DUS", factor: 22704, isPurchase: true, isCount: true },
    ] }]);
    expect(r.findings.map((f) => f.code)).toContain("AREA_CATEGORY_MISMATCH");
    expect(r.findings.map((f) => f.code)).toContain("DUPLICATE_UOM");
  });

  it("excludes age-restricted categories and their associated supplier improvement tasks", () => {
    const r = check([
      product,
      { ...product, id: "restricted", name: "Restricted", category: "Retail · Rokok" },
    ], [supplier, { ...supplier, id: "s2", name: "DJARUM", productCount: 1 }]);
    expect(r.metrics.productsAudited).toBe(1);
    expect(r.metrics.productsExcludedFromThisScope).toBe(1);
    expect(r.metrics.suppliersAudited).toBe(1);
    expect(r.findings.every((f) => f.id !== "restricted" && f.id !== "s2")).toBe(true);
  });
});
