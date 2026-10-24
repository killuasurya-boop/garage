import { z } from "zod";

import { accountabilityFailure } from "@/lib/accountability-route";
import { ok, readJson } from "@/lib/api-response";
import { decidePettyCashEntry } from "@/lib/cashier-accountability";
import { requireAnyPermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const decideSchema = z.object({
  decision: z.enum(["approve", "reject", "cancel", "pay"]),
  note: z.string().trim().max(500).optional(),
  // Bayar: penerima dana & nomor nota saat uang diserahkan.
  recipient: z.string().trim().max(120).optional(),
  receiptNo: z.string().trim().max(80).optional(),
});

/** Setujui / tolak / bayar (Owner/Manajer) atau batalkan entri petty cash. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(["finance:write", "shift:cash"]);
  if (session.response) return session.response;
  const body = await readJson(request, decideSchema);
  if (body.error) return body.error;
  const { id } = await context.params;
  try {
    return ok(await decidePettyCashEntry(id, body.data, session.data));
  } catch (error) {
    return accountabilityFailure(error);
  }
}
