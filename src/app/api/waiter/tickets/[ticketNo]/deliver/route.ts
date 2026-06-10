import { fail, ok } from "@/lib/api-response";
import {
  KitchenTransitionError,
  TicketClaimError,
  deliverClaimedTicket,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Endpoint waiter-only untuk transisi ticket → "delivered".
// Memakai permission "orders:manage" (dimiliki Waiter 1/2, Kasir, Manager+)
// bukan "kitchen:write" supaya waiter tidak punya kontrol penuh atas KDS.
export async function POST(
  _request: Request,
  context: { params: Promise<{ ticketNo: string }> },
) {
  const session = await requirePermission("orders:manage");
  if (session.response) {
    return session.response;
  }

  const { ticketNo } = await context.params;
  if (!ticketNo) {
    return fail(400, "TICKET_REQUIRED", "Ticket number wajib diisi.");
  }

  try {
    const ticket = await deliverClaimedTicket(ticketNo, session.data);
    if (!ticket) {
      return fail(404, "TICKET_NOT_FOUND", "Ticket tidak ditemukan.");
    }
    return ok(ticket);
  } catch (error) {
    if (error instanceof TicketClaimError) {
      return fail(409, "TICKET_CLAIMED", `Tiket sudah diambil oleh ${error.claimedByName}.`);
    }
    if (error instanceof KitchenTransitionError) {
      return fail(
        422,
        "INVALID_TRANSITION",
        "Order belum ready — tidak bisa ditandai sudah diantar.",
      );
    }
    throw error;
  }
}
