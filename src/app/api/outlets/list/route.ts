import { and, gte, lt, sql } from "drizzle-orm";

import { ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { listOutlets } from "@/lib/garage-service";
import { jakartaDayRange } from "@/lib/attendance";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission("dashboard:read");
  if (session.response) return session.response;

  const outletList = await listOutlets();

  // Agregasi revenue & orderCount hari ini per outlet.
  const { start, end } = jakartaDayRange();
  const db = await getDb();
  const todayRows = await db
    .select({
      outletId: orders.outletId,
      revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
      orderCount: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
        sql`${orders.status} = 'paid'`,
      ),
    )
    .groupBy(orders.outletId);

  const byOutlet = new Map<string, { revenue: number; orderCount: number }>();
  for (const r of todayRows) {
    if (!r.outletId) continue;
    byOutlet.set(r.outletId, {
      revenue: Number(r.revenue),
      orderCount: Number(r.orderCount),
    });
  }

  const enriched = outletList.map((o) => {
    const stats = byOutlet.get(o.id) ?? { revenue: 0, orderCount: 0 };
    return {
      ...o,
      revenueToday: stats.revenue,
      orderCountToday: stats.orderCount,
      aovToday: stats.orderCount > 0 ? Math.round(stats.revenue / stats.orderCount) : 0,
    };
  });

  return ok({ outlets: enriched });
}
