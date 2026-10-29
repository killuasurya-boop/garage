import { ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { getProcurementDashboard } from "@/lib/wms-procurement";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Ringkasan Procurement Command Center (Owner/Manajer). */
export async function GET() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await getProcurementDashboard());
}
