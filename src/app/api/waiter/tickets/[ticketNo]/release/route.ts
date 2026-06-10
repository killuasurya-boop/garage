import { fail, ok } from "@/lib/api-response";
import { TicketClaimError, releaseKitchenTicket } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Lepas klaim tiket (batal antar). Hanya pengklaim atau manager.
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
    const ticket = await releaseKitchenTicket(ticketNo, session.data);
    if (!ticket) {
      return fail(404, "TICKET_NOT_FOUND", "Ticket tidak ditemukan.");
    }
    return ok(ticket);
  } catch (error) {
    if (error instanceof TicketClaimError) {
      return fail(409, "TICKET_CLAIMED", `Tiket diambil oleh ${error.claimedByName}.`);
    }
    throw error;
  }
}
