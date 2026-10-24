import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { resolveWmsStockIssue } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const row = await resolveWmsStockIssue(id, session.data.user.id);
  if (!row) return fail(404, "WMS_ISSUE_NOT_FOUND", "Masalah stok tidak ditemukan atau sudah beres.");
  return ok(row);
}
