import { desc, eq } from "drizzle-orm";

import { ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { marketingBroadcastDeliveries } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/marketing/broadcasts/[id]/deliveries
// Daftar catatan pengiriman per-penerima untuk sebuah broadcast.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("marketing:read");
  if (session.response) return session.response;

  const { id } = await params;
  const db = await getDb();

  const rows = await db
    .select()
    .from(marketingBroadcastDeliveries)
    .where(eq(marketingBroadcastDeliveries.broadcastId, id))
    .orderBy(desc(marketingBroadcastDeliveries.createdAt))
    .limit(500);

  const summary = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.status === "sent") acc.sent += 1;
      else if (r.status === "simulated") acc.simulated += 1;
      else if (r.status === "failed") acc.failed += 1;
      return acc;
    },
    { total: 0, sent: 0, simulated: 0, failed: 0 },
  );

  return ok({ summary, deliveries: rows });
}
