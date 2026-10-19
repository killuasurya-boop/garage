import { fail, ok } from "@/lib/api-response";
import { getOrderChangeHistory } from "@/lib/garage-service";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

// Riwayat perubahan satu order (dari Audit Log, hanya-baca) — Owner/Manajer.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    return ok(await getOrderChangeHistory(id, session.data));
  } catch (error) {
    return fail(404, "ORDER_NOT_FOUND", error instanceof Error ? error.message : "Order tidak ditemukan.");
  }
}
