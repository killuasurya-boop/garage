import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { updateOrderInfo } from "@/lib/garage-service";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

// Edit info order (Owner/Manajer): nama, HP, catatan. Nominal & item tidak bisa diubah.
const editSchema = z.object({
  customerName: z.string().trim().max(80).nullable().optional(),
  customerPhone: z.string().trim().max(30).nullable().optional(),
  customerNote: z.string().trim().max(240).nullable().optional(),
  reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(200),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const body = await readJson(request, editSchema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await updateOrderInfo(id, body.data, session.data));
  } catch (error) {
    return fail(400, "ORDER_EDIT_FAILED", error instanceof Error ? error.message : "Gagal mengubah order.");
  }
}
