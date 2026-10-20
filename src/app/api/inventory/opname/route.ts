import { ok } from "@/lib/api-response";
import { listStockOpnameSessions } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { legacyInventoryGone } from "@/lib/legacy-inventory-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  return ok({
    sessions: await listStockOpnameSessions(session.data, {
      status: url.searchParams.get("status") ?? undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  });
}

export async function POST() {
  return legacyInventoryGone("Gudang → Stok Opname (/warehouse/opname)");
}
