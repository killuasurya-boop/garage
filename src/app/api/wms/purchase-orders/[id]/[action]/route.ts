import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { createReceivingFromPurchaseOrder, setPurchaseOrderStatus } from "@/lib/wms-purchase";
import {
  approvePurchaseOrder,
  confirmPoSent,
  openPoWhatsapp,
  recordSupplierResponse,
  rejectPurchaseOrder,
  submitPurchaseOrder,
} from "@/lib/wms-procurement";
import { procActor } from "@/lib/wms-procurement-route";
import { WmsMasterError } from "@/lib/wms-master-data";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    reason: z.string().trim().max(300).optional(),
    note: z.string().trim().max(300).optional(),
    revision: z.number().int().min(0).optional(),
  })
  .default({});

/**
 * Alur PO: submit → approve/reject → wa-open (Mode 1: buka WhatsApp) → confirm-sent (konfirmasi manual)
 * → supplier-confirmed → supplier-processing → receive. cancel kapan saja sebelum selesai.
 * "send" = cara lama menandai terkirim (kini hanya setelah disetujui).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id, action } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "WMS_PO_INVALID", "ID PO tidak valid.");
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Data aksi PO tidak valid.");
  const body = parsed.data;
  const actor = procActor(session.data);
  try {
    let row: unknown;
    switch (action) {
      case "submit":
        row = await submitPurchaseOrder(id, actor);
        break;
      case "approve":
        row = await approvePurchaseOrder(id, actor);
        break;
      case "reject":
        row = await rejectPurchaseOrder(id, body.reason ?? "", actor);
        break;
      case "wa-open":
        row = await openPoWhatsapp(id, actor);
        break;
      case "confirm-sent":
        if (body.revision === undefined) return fail(400, "REVISION_REQUIRED", "Revisi dokumen yang dikirim wajib disertakan.");
        row = await confirmPoSent(id, { revision: body.revision, note: body.note }, actor);
        break;
      case "supplier-confirmed":
        row = await recordSupplierResponse(id, { status: "confirmed", note: body.note }, actor);
        break;
      case "supplier-processing":
        row = await recordSupplierResponse(id, { status: "processing", note: body.note }, actor);
        break;
      case "receive":
        row = await createReceivingFromPurchaseOrder(id, actor.userId);
        break;
      case "send":
      case "cancel":
        row = await setPurchaseOrderStatus(id, action, actor.userId);
        break;
      default:
        return fail(404, "WMS_PO_ACTION_UNKNOWN", "Aksi PO tidak dikenal.");
    }
    if (!row) return fail(404, "WMS_PO_NOT_FOUND", "PO tidak ditemukan.");
    return ok(row);
  } catch (e) {
    if (e instanceof WmsMasterError) return fail(e.status, e.code, e.message);
    return fail(400, "WMS_PO_ACTION_FAILED", e instanceof Error ? e.message : "Aksi PO gagal.");
  }
}
