import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { createReceivingFromPurchaseOrder, setPurchaseOrderStatus } from "@/lib/wms-purchase";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** send = tandai terkirim · cancel = batalkan · receive = buat penerimaan draft dari sisa PO. */
export async function POST(_request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id, action } = await context.params;
  try {
    const row =
      action === "receive"
        ? await createReceivingFromPurchaseOrder(id, session.data.user.id)
        : action === "send" || action === "cancel"
          ? await setPurchaseOrderStatus(id, action, session.data.user.id)
          : undefined;
    if (row === undefined) return fail(404, "WMS_PO_ACTION_UNKNOWN", "Aksi PO tidak dikenal.");
    if (!row) return fail(404, "WMS_PO_NOT_FOUND", "PO tidak ditemukan.");
    return ok(row);
  } catch (e) {
    return fail(400, "WMS_PO_ACTION_FAILED", e instanceof Error ? e.message : "Aksi PO gagal.");
  }
}
