import { fail, ok } from "@/lib/api-response";
import { getStockDocumentLines } from "@/lib/wms-purchase";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Baris surat jalan / pick list untuk dokumen pindah stok (TRF-… / IO-…). */
export async function GET(_request: Request, context: { params: Promise<{ doc: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { doc } = await context.params;
  const refDoc = decodeURIComponent(doc);
  if (!/^(TRF|IO)-[A-Z0-9-]{4,40}$/.test(refDoc)) return fail(400, "WMS_DOC_INVALID", "No. dokumen tidak valid.");
  const data = await getStockDocumentLines(refDoc);
  if (!data.lines.length) return fail(404, "WMS_DOC_NOT_FOUND", "Dokumen tidak ditemukan.");
  return ok(data);
}
