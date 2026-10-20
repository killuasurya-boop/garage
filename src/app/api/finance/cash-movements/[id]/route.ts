import { fail, ok } from "@/lib/api-response";
import { getCashMovementDetail } from "@/lib/garage-service";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Detail transaksi kas laci + riwayat perubahan. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  const detail = await getCashMovementDetail(id, session.data);
  if (!detail) return fail(404, "NOT_FOUND", "Transaksi kas tidak ditemukan.");
  return ok(detail);
}
