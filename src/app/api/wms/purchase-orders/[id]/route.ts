import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { getPurchaseOrder } from "@/lib/wms-purchase";
import { getPoWhatsappCapabilities, listPoDispatch, listPoPayments, revisePurchaseOrder } from "@/lib/wms-procurement";
import { procActor } from "@/lib/wms-procurement-route";
import { withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "WMS_PO_INVALID", "ID PO tidak valid.");
  const po = await getPurchaseOrder(id);
  if (!po) return fail(404, "WMS_PO_NOT_FOUND", "PO tidak ditemukan.");
  const [dispatch, payments] = await Promise.all([listPoDispatch(id), listPoPayments(id)]);
  return ok({ ...po, dispatch, payments, whatsapp: getPoWhatsappCapabilities() });
}

const reviseSchema = z.object({
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().max(500).optional(),
  deliveryNote: z.string().trim().max(300).optional(),
  paymentTerms: z.string().trim().max(200).optional(),
  showPrices: z.boolean().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        orderedQty: z.number().positive().max(10_000_000),
        unitPrice: z.number().nonnegative().max(100_000_000),
        uom: z.string().trim().max(20).nullable().optional(),
        uomFactor: z.number().positive().max(10_000_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(100)
    .optional(),
});

/** Ubah PO. Setelah pernah dikirim ke supplier → REVISI baru + wajib disetujui & dikirim ulang. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, reviseSchema);
  if (parsed.error) return parsed.error;
  return withMasterErrors(async () => ok(await revisePurchaseOrder(id, parsed.data, procActor(session.data))));
}
