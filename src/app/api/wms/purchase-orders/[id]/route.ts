import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  markPurchaseOrderSent,
  ProcurementError,
} from "@/lib/wms-procurement";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["approve", "send", "cancel", "close"]), reason: z.string().trim().max(300).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  const actor = { id: session.data.user.id, name: session.data.user.name, role: session.data.profile.role };
  try {
    const { action, reason = "" } = parsed.data;
    if (action === "approve") return ok(await approvePurchaseOrder(id, actor));
    if (action === "send") return ok(await markPurchaseOrderSent(id, actor));
    if (action === "cancel") return ok(await cancelPurchaseOrder(id, reason, actor));
    return ok(await closePurchaseOrder(id, reason, actor));
  } catch (e) {
    if (e instanceof ProcurementError) return fail(409, "PURCHASE_ORDER_CONFLICT", e.message);
    return fail(400, "PURCHASE_ORDER_FAILED", e instanceof Error ? e.message : "Gagal memproses PO.");
  }
}
