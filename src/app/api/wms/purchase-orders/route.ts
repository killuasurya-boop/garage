import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createPurchaseOrder, listPurchaseOrders, ProcurementError } from "@/lib/wms-procurement";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  supplierName: z.string().trim().max(120).optional(),
  area: z.enum(["bar", "dapur", "umum"]).optional(),
  paymentTerm: z.enum(["cash", "tempo"]).optional(),
  dueDays: z.number().int().min(0).max(180).optional(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
        unitCost: z.number().nonnegative(),
        requestItemId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function GET(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const status = new URL(request.url).searchParams.get("status")?.split(",").filter(Boolean);
  return ok(await listPurchaseOrders({ status }));
}

// PO = komitmen pembelian, TIDAK menambah stok. Owner/Manajer saja.
export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  try {
    const actor = { id: session.data.user.id, name: session.data.user.name, role: session.data.profile.role };
    return ok(await createPurchaseOrder(parsed.data, actor), { status: 201 });
  } catch (e) {
    if (e instanceof ProcurementError) return fail(409, "PURCHASE_ORDER_INVALID", e.message);
    return fail(400, "PURCHASE_ORDER_FAILED", e instanceof Error ? e.message : "Gagal membuat PO.");
  }
}
