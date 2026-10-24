import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { getPurchaseOrder } from "@/lib/wms-purchase";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const po = await getPurchaseOrder(id);
  if (!po) return fail(404, "WMS_PO_NOT_FOUND", "PO tidak ditemukan.");
  return ok(po);
}
