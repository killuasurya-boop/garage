import { fail, ok } from "@/lib/api-response";
import { CourierError, claimDeliveryOrder } from "@/lib/garage-courier";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Kurir Tersedia mengambil sendiri pesanan delivery yang siap antar.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    return ok(await claimDeliveryOrder(id, session.data));
  } catch (error) {
    if (error instanceof CourierError) return fail(error.status, "COURIER_CLAIM_FAILED", error.message);
    return fail(500, "COURIER_CLAIM_FAILED", "Pesanan gagal diambil.");
  }
}
