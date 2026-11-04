import { ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { assessApexWmsSnapshot } from "@/lib/apex-wms-quality-gate";
import { getWmsBatchIntegrity, getWmsProducts } from "@/lib/wms-service";
import { getReorderSuggestions, listPurchaseOrders } from "@/lib/wms-purchase";
import { listExpiringWmsBatches } from "@/lib/wms-waste";
import { getWmsLossReport } from "@/lib/wms-loss";
import { resolveLossPeriod } from "@/lib/wms-opname-report";
import { getMenuMarginReport } from "@/lib/garage-service";

export const runtime = "nodejs";

/**
 * Owner-only R0 diagnostic. Computes findings from existing official services;
 * never modifies ledger, POS, PO, supplier, budget or approval state.
 * This endpoint is NOT an authorization service for financial actions.
 */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;

  const now = new Date();
  const todayWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const range = resolveLossPeriod("weekly", todayWib);

  const [products, suggestions, orders, margins, expiry, gaps, loss] = await Promise.all([
    getWmsProducts({ warehouseId: "all" }),
    getReorderSuggestions(),
    listPurchaseOrders(50),
    getMenuMarginReport(session.data),
    listExpiringWmsBatches(7),
    getWmsBatchIntegrity(),
    getWmsLossReport({ from: range.from, to: range.to }),
  ]);

  const report = assessApexWmsSnapshot({
    dataAsOf: now.toISOString(),
    materials: products.map((p) => ({
      id: p.id, sku: p.sku, name: p.name, onHand: Number(p.onHand), unit: p.unit,
    })),
    reorderSuggestions: suggestions.map((s) => ({
      productId: s.productId, sku: s.sku, name: s.name,
      warehouseId: s.warehouseId, warehouseName: s.warehouseName,
      onHand: Number(s.onHand), purchaseQty: Number(s.purchaseQty),
      supplierId: s.supplierId ?? null,
      lastPrice: s.lastPrice == null ? null : Number(s.lastPrice),
    })),
    purchaseOrders: orders.map((p) => ({
      id: p.id, doc: p.doc, status: p.status,
      total: Number(p.total), items: Number(p.items),
    })),
    margins: margins.map((m) => ({
      menuItemId: m.menuItemId, variantId: m.variantId, menuName: m.menuName,
      ingredients: Number(m.ingredients), recipeCost: Number(m.recipeCost),
    })),
    expiringBatches: expiry.map((b) => ({
      batchId: b.batchId, batchNo: b.batchNo, productId: b.productId,
      sku: b.sku, qty: Number(b.qty),
      expiredAt: b.expiredAt ? new Date(b.expiredAt).toISOString() : null,
    })),
    batchIntegrityGaps: gaps.map((g) => ({
      productId: g.productId, warehouseId: g.warehouseId, gap: Number(g.gap),
    })),
    lossSummary: {
      grossShortage: loss.summary.grossShortage,
      grossSurplus: loss.summary.grossSurplus,
      accuracyPct: loss.summary.accuracyPct,
      coveragePct: loss.summary.coveragePct,
    },
  });
  // Bound the response size. Full issue count is always returned, never silently truncated.
  const maxIssues = 100;
  return ok({
    ...report,
    period: { from: range.fromKey, to: range.toKey },
    findings: report.findings.slice(0, maxIssues),
    findingsReturned: Math.min(report.findings.length, maxIssues),
    findingsTruncated: report.findings.length > maxIssues,
  });
}
