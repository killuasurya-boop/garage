import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { CashSessionForbiddenError, reconcileCashSessionQris } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  qrisCounted: z.number().int().nonnegative().max(1_000_000_000),
  note: z.string().trim().max(300).optional(),
});

// Owner/Manajer mencocokkan total QRIS shift dengan mutasi/aplikasi BNI.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("finance:write");
  if (session.response) return session.response;

  const body = await readJson(request, schema);
  if (body.error) return body.error;

  const { id } = await context.params;
  try {
    const updated = await reconcileCashSessionQris(id, body.data, session.data);
    if (!updated) return fail(404, "CASH_SESSION_NOT_FOUND", "Shift tidak ditemukan.");
    return ok(updated);
  } catch (error) {
    if (error instanceof CashSessionForbiddenError) {
      return fail(403, "FORBIDDEN", "Shift ini milik outlet lain.");
    }
    throw error;
  }
}
