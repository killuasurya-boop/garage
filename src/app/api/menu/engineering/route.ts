import { and, gte, sql } from "drizzle-orm";

import { fail, ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { menuItems, menuVariants, orderItems, orders } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Agregasi 30 hari per varian: qty terjual + total revenue + margin.
// Dipakai oleh /control/menu-engineering untuk klasifikasi kuadran
// Star/Puzzle/Plowhorse/Dog.
export async function GET(request: Request) {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  try {
    const url = new URL(request.url);
    const daysParam = Number(url.searchParams.get("days") ?? "30");
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const db = await getDb();

    // Agregasi per (menuItemId, variantId): jumlah qty + total revenue.
    const soldRows = await db
      .select({
        menuItemId: orderItems.menuItemId,
        variantId: orderItems.variantId,
        qty: sql<number>`COALESCE(SUM(${orderItems.qty}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${orderItems.lineTotal}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
      .where(and(gte(orders.createdAt, since), sql`${orders.status} != 'void'`))
      .groupBy(orderItems.menuItemId, orderItems.variantId);

    // Index lookup cepat.
    const soldByKey = new Map<string, { qty: number; revenue: number }>();
    for (const r of soldRows) {
      const key = `${r.menuItemId ?? ""}::${r.variantId}`;
      soldByKey.set(key, { qty: Number(r.qty), revenue: Number(r.revenue) });
    }

    // Master menu + varian dengan harga & cost.
    const variantRows = await db
      .select({
        itemId: menuItems.id,
        itemName: menuItems.name,
        category: menuItems.category,
        status: menuItems.status,
        variantKey: menuVariants.variantId,
        variantLabel: menuVariants.label,
        price: menuVariants.price,
        baseCost: menuVariants.baseCost,
      })
      .from(menuVariants)
      .innerJoin(menuItems, sql`${menuItems.id} = ${menuVariants.itemId}`);

    const variants = variantRows.map((v) => {
      const key = `${v.itemId}::${v.variantKey}`;
      const sold = soldByKey.get(key) ?? { qty: 0, revenue: 0 };
      const marginPerUnit = v.price - v.baseCost;
      const marginPct = v.price > 0 ? (marginPerUnit / v.price) * 100 : 0;
      const totalMargin = marginPerUnit * sold.qty;
      return {
        itemId: v.itemId,
        itemName: v.itemName,
        category: v.category,
        status: v.status,
        variantId: v.variantKey,
        variantLabel: v.variantLabel,
        price: v.price,
        baseCost: v.baseCost,
        marginPerUnit,
        marginPct,
        soldQty: sold.qty,
        revenue: sold.revenue,
        totalMargin,
      };
    });

    // Median dihitung server-side biar klasifikasi konsisten.
    const sortedMargin = [...variants.map((v) => v.marginPct)].sort((a, b) => a - b);
    const sortedVolume = [...variants.map((v) => v.soldQty)].sort((a, b) => a - b);
    const median = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };
    const medMargin = median(sortedMargin);
    const medVolume = median(sortedVolume);

    return ok({
      windowDays: days,
      since: since.toISOString(),
      medMargin,
      medVolume,
      variants,
    });
  } catch (error) {
    console.error("menu/engineering error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal menghitung menu engineering");
  }
}
