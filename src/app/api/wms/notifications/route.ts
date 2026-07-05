import { ok } from "@/lib/api-response";
import { getWmsNotifications } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await getWmsNotifications());
}
