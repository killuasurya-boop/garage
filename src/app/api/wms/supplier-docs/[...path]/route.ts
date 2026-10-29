import { fail } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { readSupplierDoc } from "@/lib/wms-supplier-docs";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Lihat invoice / bukti bayar supplier — hanya Owner/Manajer, tidak pernah publik. */
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { path } = await context.params;
  const doc = await readSupplierDoc(path.join("/"));
  if (!doc) return fail(404, "DOC_NOT_FOUND", "Berkas tidak ditemukan.");
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
