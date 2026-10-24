import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { createPurchaseOrder, listPurchaseOrders } from "@/lib/wms-purchase";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().max(300).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        orderedQty: z.number().positive().max(10_000_000), // satuan dasar
        unitPrice: z.number().nonnegative().max(100_000_000), // Rp per satuan dasar
        uom: z.string().trim().max(20).nullable().optional(),
        uomFactor: z.number().positive().max(10_000_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function GET() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await listPurchaseOrders());
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    return ok(await createPurchaseOrder(parsed.data, session.data.user.id), { status: 201 });
  } catch (e) {
    return fail(400, "WMS_PO_FAILED", e instanceof Error ? e.message : "Gagal membuat PO.");
  }
}
