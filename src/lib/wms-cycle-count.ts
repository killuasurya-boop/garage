// Prioritas cycle count per ruang (deterministik, read-only). Skor = rumus riskScores()
// di wms-opname-rules.ts; setiap faktor diambil dari data nyata (ledger, opname, batch).

import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { wmsBatch, wmsOpnameLine, wmsProduct, wmsStockMovement, wmsStockOpname, wmsWarehouseStock } from "@/db/schema";
import { DEFAULT_RISK_WEIGHTS, riskScores, type RiskFactors, type RiskWeights } from "@/lib/wms-opname-rules";

const DAY = 86_400_000;
const USAGE_TYPES = ["out", "internal_out", "transfer"];

export async function getCycleCountPriorities(warehouseId: string, opts: { limit?: number; weights?: RiskWeights; now?: Date } = {}) {
  const db = getDb();
  const now = opts.now ?? new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since90 = new Date(now.getTime() - 90 * DAY);

  const stock = await db
    .select({
      productId: wmsProduct.id,
      sku: wmsProduct.sku,
      name: wmsProduct.name,
      category: wmsProduct.category,
      unit: wmsProduct.unit,
      hpp: wmsProduct.hpp,
      qty: wmsWarehouseStock.qty,
    })
    .from(wmsWarehouseStock)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsWarehouseStock.productId))
    .where(and(eq(wmsWarehouseStock.warehouseId, warehouseId), isNull(wmsProduct.archivedAt)));
  if (!stock.length) return { warehouseId, weights: opts.weights ?? DEFAULT_RISK_WEIGHTS, items: [] };
  const ids = stock.map((s) => s.productId);

  const usage = await db
    .select({ productId: wmsStockMovement.productId, n: sql<number>`count(*)::int` })
    .from(wmsStockMovement)
    .where(
      and(
        eq(wmsStockMovement.warehouseId, warehouseId),
        inArray(wmsStockMovement.productId, ids),
        inArray(wmsStockMovement.type, USAGE_TYPES),
        lt(wmsStockMovement.qty, 0),
        gte(wmsStockMovement.createdAt, since30),
      ),
    )
    .groupBy(wmsStockMovement.productId);

  const counted = await db
    .select({
      productId: wmsOpnameLine.productId,
      systemQty: wmsOpnameLine.systemQty,
      physicalQty: wmsOpnameLine.physicalQty,
      postedValue: wmsOpnameLine.postedValue,
      countedAt: wmsOpnameLine.countedAt,
    })
    .from(wmsOpnameLine)
    .innerJoin(wmsStockOpname, eq(wmsStockOpname.id, wmsOpnameLine.opnameId))
    .where(
      and(
        eq(wmsStockOpname.warehouseId, warehouseId),
        eq(wmsStockOpname.status, "completed"),
        inArray(wmsOpnameLine.productId, ids),
        isNotNull(wmsOpnameLine.countedAt),
      ),
    );

  const expiry = await db
    .select({ productId: wmsBatch.productId, at: sql<Date | null>`min(${wmsBatch.expiredAt})` })
    .from(wmsBatch)
    .where(and(eq(wmsBatch.warehouseId, warehouseId), inArray(wmsBatch.productId, ids), gt(wmsBatch.qty, 0), isNotNull(wmsBatch.expiredAt)))
    .groupBy(wmsBatch.productId);

  const usageBy = new Map(usage.map((u) => [u.productId, Number(u.n)]));
  const expiryBy = new Map(expiry.map((e) => [e.productId, e.at ? new Date(e.at) : null]));
  const hppBy = new Map(stock.map((s) => [s.productId, Number(s.hpp)]));
  const events = new Map<string, { n: number; loss: number; last: number | null }>();
  for (const c of counted) {
    if (!c.productId) continue;
    const e = events.get(c.productId) ?? { n: 0, loss: 0, last: null };
    const at = c.countedAt ? new Date(c.countedAt).getTime() : null;
    if (at !== null && (e.last === null || at > e.last)) e.last = at;
    const variance = Number(c.physicalQty) - Number(c.systemQty);
    if (at !== null && at >= since90.getTime() && Math.abs(variance) > 1e-9) {
      e.n += 1;
      const value = c.postedValue !== null ? Number(c.postedValue) : variance * (hppBy.get(c.productId) ?? 0);
      if (value < 0) e.loss += -value;
    }
    events.set(c.productId, e);
  }

  const items = stock.map((s) => {
    const e = events.get(s.productId);
    const exp = expiryBy.get(s.productId) ?? null;
    const factors: RiskFactors = {
      stockValue: Math.max(0, Number(s.qty)) * Number(s.hpp),
      usageCount30d: usageBy.get(s.productId) ?? 0,
      varianceEvents90d: e?.n ?? 0,
      varianceLoss90d: Math.round(e?.loss ?? 0),
      daysToExpiry: exp ? Math.floor((exp.getTime() - now.getTime()) / DAY) : null,
      daysSinceCount: e?.last ? Math.floor((now.getTime() - e.last) / DAY) : null,
    };
    return { productId: s.productId, sku: s.sku, name: s.name, category: s.category, unit: s.unit, qty: Number(s.qty), factors };
  });

  const weights = opts.weights ?? DEFAULT_RISK_WEIGHTS;
  const ranked = riskScores(items, weights);
  return { warehouseId, weights, items: ranked.slice(0, opts.limit ?? 20) };
}
