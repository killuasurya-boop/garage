import { ok } from "@/lib/api-response";
import { getWmsRecipeCoverage } from "@/lib/wms-bridge";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await getWmsRecipeCoverage());
}
