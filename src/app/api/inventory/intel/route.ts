import { and, gte, sql } from "drizzle-orm";

import { fail, ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { inventoryItems, stockMovements } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Inventory Intelligence: wastage %, days-on-hand, fastest depleting.
// Dipakai oleh /control/inventory-intel.
export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  try {
    const url = new URL(request.url);
    const daysParam = Number(url.searchParams.get("days") ?? "30");
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const db = await getDb();

    // Master item.
    const items = await db
      .select({
        sku: inventoryItems.sku,
        name: inventoryItems.name,
        category: inventoryItems.category,
        unit: inventoryItems.unit,
        unitCost: inventoryItems.unitCost,
        onHand: inventoryItems.onHand,
        min: inventoryItems.min,
        status: inventoryItems.status,
      })
      .from(inventoryItems);

    // Agregasi movement per sku per type (out, waste, in).
    const movRows = await db
      .select({
        sku: stockMovements.itemSku,
        type: stockMovements.type,
        totalQty: sql<number>`COALESCE(SUM(${stockMovements.qty}), 0)`,
        eventCount: sql<number>`COUNT(*)`,
      })
      .from(stockMovements)
      .where(and(gte(stockMovements.createdAt, since)))
      .groupBy(stockMovements.itemSku, stockMovements.type);

    type PerSku = { out: number; waste: number; in_: number; wasteEvents: number };
    const bySkú = new Map<string, PerSku>();
    let totalOut = 0;
    let totalWaste = 0;
    let totalWasteEvents = 0;
    for (const r of movRows) {
      if (!r.sku) continue;
      const cur = bySkú.get(r.sku) ?? { out: 0, waste: 0, in_: 0, wasteEvents: 0 };
      const qty = Number(r.totalQty);
      const count = Number(r.eventCount);
      if (r.type === "out" || r.type === "use" || r.type === "sale") cur.out += qty;
      else if (r.type === "waste") {
        cur.waste += qty;
        cur.wasteEvents += count;
        totalWaste += qty;
        totalWasteEvents += count;
      } else if (r.type === "in" || r.type === "receiving" || r.type === "stock_in") cur.in_ += qty;
      totalOut += r.type !== "in" && r.type !== "receiving" && r.type !== "stock_in" ? qty : 0;
      bySkú.set(r.sku, cur);
    }

    // Enrich tiap item + estimasi hari tersisa.
    const enriched = items.map((it) => {
      const mov = bySkú.get(it.sku) ?? { out: 0, waste: 0, in_: 0, wasteEvents: 0 };
      const dailyUse = mov.out / Math.max(days, 1);
      const daysLeft = dailyUse > 0 ? it.onHand / dailyUse : null;
      const wastePctItem = mov.out + mov.waste > 0 ? (mov.waste / (mov.out + mov.waste)) * 100 : 0;
      return {
        sku: it.sku,
        name: it.name,
        category: it.category,
        unit: it.unit,
        unitCost: it.unitCost,
        onHand: it.onHand,
        min: it.min,
        status: it.status,
        outQty: mov.out,
        wasteQty: mov.waste,
        wasteEvents: mov.wasteEvents,
        dailyUse,
        daysLeft,
        wastePctItem,
      };
    });

    const wastePct = totalOut + totalWaste > 0 ? (totalWaste / (totalOut + totalWaste)) * 100 : 0;
    const low = enriched.filter((i) => i.status === "low").length;
    const watch = enriched.filter((i) => i.status === "watch").length;
    const safe = enriched.filter((i) => i.status === "safe" || i.status === "ready").length;

    return ok({
      windowDays: days,
      since: since.toISOString(),
      summary: { low, watch, safe, wastePct, wasteEvents: totalWasteEvents, wasteQty: totalWaste },
      items: enriched,
    });
  } catch (error) {
    console.error("inventory/intel error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal menghitung inventory intel");
  }
}
