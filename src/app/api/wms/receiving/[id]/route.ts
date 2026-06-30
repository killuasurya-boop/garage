import { fail, ok } from "@/lib/api-response";
import { getReceiving } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const rec = await getReceiving(id);
  if (!rec) return fail(404, "RECEIVING_NOT_FOUND", "Dokumen penerimaan tidak ditemukan.");
  return ok(rec);
}
