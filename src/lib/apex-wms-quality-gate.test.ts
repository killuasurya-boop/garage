import { describe, expect, it } from "vitest";
import { assessApexWmsSnapshot, type ApexSnapshot } from "@/lib/apex-wms-quality-gate";

const base: ApexSnapshot = {
  dataAsOf: "2026-11-01T00:00:00.000Z",
  materials: [{ id: "p1", sku: "BAR-031", name: "Cup", onHand: 50020, unit: "pcs" }],
  reorderSuggestions: [],
  purchaseOrders: [],
  margins: [{ menuItemId: "latte", variantId: "cold", menuName: "Latte", ingredients: 2, recipeCost: 5600 }],
  expiringBatches: [],
  batchIntegrityGaps: [],
  lossSummary: { grossShortage: 0, grossSurplus: 0, accuracyPct: 100, coveragePct: 100 },
};

describe("APEX WMS data integrity gate (R0)", () => {
  it("returns PASS for a complete snapshot without authorizing execution", () => {
    const r = assessApexWmsSnapshot(base);
    expect(r.state).toBe("PASS");
    expect(r.dataGatePass).toBe(true);
    expect(r.executionAuthorized).toBe(false);
    expect(r.findings).toHaveLength(0);
  });

  it("blocks auto procurement for missing supplier, price, and location mismatch", () => {
    const r = assessApexWmsSnapshot({
      ...base,
      reorderSuggestions: [{
        productId: "p1", sku: "BAR-031", name: "Cup",
        warehouseId: "wh-main", warehouseName: "Gudang Utama Bar", onHand: 0,
        purchaseQty: 1200, supplierId: null, lastPrice: null,
      }],
    });
    expect(r.state).toBe("BLOCKED");
    expect(r.metrics.autoProcurementBlockers).toBe(3);
    expect(new Set(r.findings.map((x) => x.code))).toEqual(new Set([
      "SUPPLIER_MISSING", "PRICE_UNVERIFIED", "CROSS_WAREHOUSE_REVIEW",
    ]));
    expect(r.executionAuthorized).toBe(false);
  });

  it("blocks zero-priced open PO but not cancelled/received PO", () => {
    const orders = [
      { id: "a", doc: "PO-A", status: "draft", total: 0, items: 1 },
      { id: "b", doc: "PO-B", status: "cancelled", total: 0, items: 1 },
      { id: "c", doc: "PO-C", status: "received", total: 0, items: 1 },
    ];
    const r = assessApexWmsSnapshot({ ...base, purchaseOrders: orders });
    expect(r.findings.filter((x) => x.code === "PO_VALUE_UNVERIFIED")).toHaveLength(1);
    expect(r.dataGatePass).toBe(false);
  });

  it("does not assume zero recipe cost is a valid 100% margin", () => {
    const r = assessApexWmsSnapshot({
      ...base,
      margins: [
        { menuItemId: "a", variantId: "hot", menuName: "Americano", ingredients: 0, recipeCost: 0 },
        { menuItemId: "b", variantId: "cold", menuName: "Latte", ingredients: 3, recipeCost: 7400 },
      ],
    });
    expect(r.metrics.missingRecipeVariants).toBe(1);
    expect(r.findings.some((x) => x.code === "RECIPE_COST_UNVERIFIED")).toBe(true);
    expect(r.state).toBe("WARN");
  });

  it("never treats gross opname variance as confirmed theft or loss", () => {
    const r = assessApexWmsSnapshot({
      ...base,
      lossSummary: { grossShortage: 58326900, grossSurplus: 147599553, accuracyPct: 6.8, coveragePct: 34.7 },
    });
    const issue = r.findings.find((x) => x.code === "OPNAME_GROSS_VARIANCE");
    expect(issue?.explanation).toContain("BUKAN kerugian yang sudah dikonfirmasi");
    expect(issue?.blocksAutoProcurement).toBe(false);
  });

  it("flags an expired INIT batch for physical review without altering stock", () => {
    const r = assessApexWmsSnapshot({
      ...base,
      expiringBatches: [{
        batchId: "b1", batchNo: "INIT-DAP-002", productId: "p2", sku: "DAP-002",
        expiredAt: "2026-10-31T16:59:59.000Z", qty: 60,
      }],
    });
    expect(r.findings[0].code).toBe("BATCH_EXPIRY_REVIEW");
    expect(r.executionAuthorized).toBe(false);
  });

  it("blocks batch integrity anomalies and deduplicates issue ids", () => {
    const r = assessApexWmsSnapshot({
      ...base,
      batchIntegrityGaps: [
        { productId: "p1", warehouseId: "main", gap: 15 },
        { productId: "p1", warehouseId: "main", gap: 15 },
      ],
    });
    expect(r.findings.filter((x) => x.code === "BATCH_LEDGER_GAP")).toHaveLength(1);
    expect(r.dataGatePass).toBe(false);
  });
});
