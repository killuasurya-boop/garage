import { ok } from "@/lib/api-response";
import { getWmsDashboard } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  return ok(await getWmsDashboard({ warehouseId: url.searchParams.get("warehouse") ?? undefined }));
}
