import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { cancelPurchaseRequest, decidePurchaseRequest, ProcurementError } from "@/lib/wms-procurement";
import { wmsIsElevated } from "@/lib/wms-access";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "revise", "reject", "cancel"]),
  note: z.string().trim().max(300).optional(),
  items: z.array(z.object({ itemId: z.string().uuid(), approvedQty: z.number().nonnegative() })).max(100).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  const actor = { id: session.data.user.id, name: session.data.user.name, role: session.data.profile.role };
  try {
    if (parsed.data.action === "cancel") return ok(await cancelPurchaseRequest(id, parsed.data.note ?? "", actor));
    // Persetujuan hanya Owner/Manajer (dicek di server, bukan hanya tombol).
    if (!wmsIsElevated(actor.role)) return fail(403, "FORBIDDEN", "Hanya Owner/Manajer yang bisa memutuskan permintaan belanja.");
    return ok(await decidePurchaseRequest(id, { action: parsed.data.action, note: parsed.data.note, items: parsed.data.items }, actor));
  } catch (e) {
    if (e instanceof ProcurementError) return fail(409, "PURCHASE_REQUEST_CONFLICT", e.message);
    return fail(400, "PURCHASE_REQUEST_FAILED", e instanceof Error ? e.message : "Gagal memproses permintaan.");
  }
}
