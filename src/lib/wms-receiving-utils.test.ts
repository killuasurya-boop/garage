import { describe, it, expect } from "vitest";

import {
  isPerishableProduct,
  autoBatchNo,
  discrepancyPct,
  needsDiscrepancyApproval,
  validateReceivingLines,
  WMS_PUTAWAY_ZONES,
} from "@/lib/wms-receiving-utils";

// =============================================================================
// Unit test utilitas Receiving (validasi, batch otomatis, bahan basi).
// =============================================================================

describe("isPerishableProduct", () => {
  it("mendeteksi bahan basi dari nama/kategori", () => {
    expect(isPerishableProduct("Susu Full Cream", "Bahan Bar")).toBe(true);
    expect(isPerishableProduct("Ayam Fillet", "Bahan Dapur")).toBe(true);
    expect(isPerishableProduct("Sayur Selada", "")).toBe(true);
  });
  it("bahan kering tidak dianggap basi", () => {
    expect(isPerishableProduct("Kopi Arabika", "Bahan Bar")).toBe(false);
    expect(isPerishableProduct("Gelas Plastik", "Kemasan")).toBe(false);
  });
});

describe("autoBatchNo", () => {
  it("format doc-tanggal-sku-index, uppercase & bersih simbol", () => {
    const b = autoBatchNo("RCV-20260704-AB12", "bean-arb", 0);
    expect(b).toMatch(/^RCV-20260704-AB12-\d{8}-BEANARB-01$/);
  });
  it("sku kosong → fallback ITEM, index bertambah", () => {
    expect(autoBatchNo("RCV-X", "", 2)).toMatch(/-ITEM-03$/);
  });
});

describe("discrepancyPct", () => {
  it("selisih dihitung sebagai proporsi absolut", () => {
    expect(discrepancyPct(100, 80)).toBeCloseTo(0.2);
    expect(discrepancyPct(100, 120)).toBeCloseTo(0.2);
    expect(discrepancyPct(50, 50)).toBe(0);
  });
  it("ordered 0 → 0 (hindari bagi nol)", () => {
    expect(discrepancyPct(0, 10)).toBe(0);
  });
});

describe("needsDiscrepancyApproval", () => {
  it("selisih >10% dgn qc pass/discrepancy → butuh approval", () => {
    expect(needsDiscrepancyApproval(100, 80, "pass")).toBe(true);
    expect(needsDiscrepancyApproval(100, 85, "discrepancy")).toBe(true);
  });
  it("selisih ≤10% atau qc reject → tidak", () => {
    expect(needsDiscrepancyApproval(100, 95, "pass")).toBe(false);
    expect(needsDiscrepancyApproval(100, 50, "reject")).toBe(false);
  });
});

describe("validateReceivingLines", () => {
  const base = { productId: "p1", orderedQty: 10, receivedQty: 10, qc: "pass" };

  it("bahan basi tanpa tanggal expired → error", () => {
    const errs = validateReceivingLines([{ ...base, productName: "Susu Full Cream", category: "Bahan Bar" }]);
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch(/expired wajib/i);
  });
  it("bahan basi dgn expired → tak ada error", () => {
    const errs = validateReceivingLines([{ ...base, productName: "Susu Full Cream", expiredAt: "2026-12-01" }]);
    expect(errs.length).toBe(0);
  });
  it("strictExpiry=false → bahan basi tanpa tanggal tetap lolos", () => {
    const errs = validateReceivingLines([{ ...base, productName: "Ayam Fillet" }], { strictExpiry: false });
    expect(errs.length).toBe(0);
  });
  it("bahan non-basi & item reject dilewati", () => {
    const errs = validateReceivingLines([
      { ...base, productName: "Kopi Arabika" },
      { ...base, productName: "Susu", qc: "reject", receivedQty: 0 },
    ]);
    expect(errs.length).toBe(0);
  });
});

describe("WMS_PUTAWAY_ZONES", () => {
  it("berisi zona penyimpanan standar", () => {
    expect(WMS_PUTAWAY_ZONES).toContain("DRY");
    expect(WMS_PUTAWAY_ZONES).toContain("CHILLED");
    expect(WMS_PUTAWAY_ZONES).toContain("FROZEN");
  });
});
