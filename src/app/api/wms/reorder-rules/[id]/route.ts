import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { deleteReorderRule } from "@/lib/wms-purchase";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const row = await deleteReorderRule(id);
  if (!row) return fail(404, "WMS_REORDER_RULE_NOT_FOUND", "Aturan tidak ditemukan.");
  return ok(row);
}
