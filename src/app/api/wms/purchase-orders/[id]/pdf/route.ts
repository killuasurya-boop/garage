import { z } from "zod";

import { fail } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { getPoDocument, recordPoPdfGenerated } from "@/lib/wms-procurement";
import { procActor } from "@/lib/wms-procurement-route";
import { renderPurchaseOrderPdf } from "@/lib/wms-po-pdf";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * PDF Purchase Order (A4). Hanya Owner/Manajer — tidak ada tautan publik; petugas mengunduh
 * lalu melampirkannya sendiri di WhatsApp (Mode 1). ?download=1 → attachment, lainnya inline (pratinjau).
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "WMS_PO_INVALID", "ID PO tidak valid.");
  const data = await getPoDocument(id);
  if (!data) return fail(404, "WMS_PO_NOT_FOUND", "PO tidak ditemukan.");
  const { buffer, sha256 } = await renderPurchaseOrderPdf(data);
  await recordPoPdfGenerated(id, sha256, procActor(session.data));
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${data.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Po-Revision": String(data.po.revision),
      "X-Po-Sha256": sha256,
    },
  });
}
