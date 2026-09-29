import { fail, ok } from "@/lib/api-response";
import {
  HandoverRequiredError,
  KitchenTransitionError,
  TicketClaimError,
  claimKitchenTicket,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Waiter klaim tiket "Saya antar" (soft-lock) supaya tidak bentrok dengan
// waiter lain. Pengklaim yang nantinya dapat fee antar.
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
    const ticket = await claimKitchenTicket(ticketNo, session.data);
    if (!ticket) {
      return fail(404, "TICKET_NOT_FOUND", "Ticket tidak ditemukan.");
    }
    return ok(ticket);
  } catch (error) {
    if (error instanceof TicketClaimError) {
      return fail(409, "TICKET_CLAIMED", `Sudah diambil oleh ${error.claimedByName}.`);
    }
    if (error instanceof KitchenTransitionError) {
      return fail(422, "NOT_READY", "Belum READY dari Bar/Dapur — belum bisa diambil.");
    }
    if (error instanceof HandoverRequiredError) {
      return fail(422, "HANDOVER_REQUIRED", error.message);
    }
    throw error;
  }
}
