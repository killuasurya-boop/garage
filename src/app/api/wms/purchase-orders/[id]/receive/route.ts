import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ProcurementError, receivePurchaseOrder } from "@/lib/wms-procurement";
import { ReceivingDiscrepancyError } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  warehouseId: z.string().uuid().nullable().optional(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  invoiceNo: z.string().trim().max(80).optional(),
  additionalCost: z.number().nonnegative().optional(),
  paymentMethod: z.enum(["Cash", "Transfer", "QRIS"]).optional(),
  confirmDiscrepancy: z.boolean().optional(),
  items: z
    .array(
      z.object({
        poItemId: z.string().uuid(),
        receivedQty: z.number().nonnegative(),
        unitCost: z.number().nonnegative().optional(),
        qc: z.enum(["pass", "reject"]).optional(),
        batchNo: z.string().trim().max(60).optional(),
        expiredAt: z.string().nullable().optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(100),
});

// Terima barang dari PO (parsial/penuh) → stok, HPP, belanja/hutang tercatat.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  try {
    const actor = { id: session.data.user.id, name: session.data.user.name, role: session.data.profile.role };
    return ok(await receivePurchaseOrder(id, parsed.data, actor), { status: 201 });
  } catch (e) {
    if (e instanceof ReceivingDiscrepancyError) return fail(409, "RECEIVING_DISCREPANCY", e.message);
    if (e instanceof ProcurementError) return fail(409, "PURCHASE_ORDER_CONFLICT", e.message);
    return fail(400, "PURCHASE_ORDER_RECEIVE_FAILED", e instanceof Error ? e.message : "Gagal menerima barang.");
  }
}
