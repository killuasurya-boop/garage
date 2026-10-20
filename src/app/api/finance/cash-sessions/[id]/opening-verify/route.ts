import { accountabilityFailure } from "@/lib/accountability-route";
import { ok } from "@/lib/api-response";
import { verifyOpeningCash } from "@/lib/cashier-accountability";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Manajer/Owner memverifikasi hitungan modal awal shift. */
export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    return ok(await verifyOpeningCash(id, session.data));
  } catch (error) {
    return accountabilityFailure(error);
  }
}
