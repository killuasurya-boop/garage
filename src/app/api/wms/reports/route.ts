import { ok } from "@/lib/api-response";
import { getWmsReports } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  return ok(
    await getWmsReports({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      warehouseId: url.searchParams.get("warehouse") ?? undefined,
      limit: limitRaw ? Number(limitRaw) : undefined,
      offset: offsetRaw ? Number(offsetRaw) : undefined,
    }),
  );
}
