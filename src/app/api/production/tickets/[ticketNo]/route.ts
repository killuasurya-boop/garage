import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  productionHandover,
  productionPickup,
  productionReadyAndCall,
  productionServeDirect,
  productionTicketAction,
} from "@/lib/garage-production";
import { productionErrorResponse } from "@/lib/garage-production-http";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["start", "ready", "reopen"]),
    // READY wajib konfirmasi QC (item, qty, varian, catatan sudah dicek).
    qcConfirmed: z.boolean().optional(),
    // Kembalikan READY → PROCESSING wajib alasan.
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    // Helper Bar/Dapur ACC serah-terima & panggil waiter (null = siapa saja).
    action: z.literal("handover"),
    waiterUserId: z.string().trim().min(1).max(80).nullable(),
  }),
  z.object({
    // Satu tombol: READY (QC) + panggil semua waiter.
    action: z.literal("ready_call"),
    qcConfirmed: z.boolean().optional(),
  }),
  z.object({
    // Kasir/helper serahkan langsung ke pelanggan (tanpa waiter) → delivered.
    action: z.literal("serve_direct"),
  }),
  z.object({
    // Helper tap nama waiter yang mengambil di meja saji → tiket delivered.
    action: z.literal("pickup"),
    waiterUserId: z.string().trim().min(1).max(80),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketNo: string }> },
) {
  const session = await requirePermission("kitchen:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, actionSchema);
  if (body.error) {
    return body.error;
  }

  const { ticketNo } = await context.params;
  try {
    const data = body.data;
    const ticket =
      data.action === "handover"
        ? await productionHandover(ticketNo, data.waiterUserId, session.data)
        : data.action === "ready_call"
          ? await productionReadyAndCall(ticketNo, session.data, { qcConfirmed: data.qcConfirmed })
          : data.action === "serve_direct"
            ? await productionServeDirect(ticketNo, session.data)
          : data.action === "pickup"
            ? await productionPickup(ticketNo, data.waiterUserId, session.data)
            : await productionTicketAction(ticketNo, data.action, session.data, {
                qcConfirmed: data.qcConfirmed,
                reason: data.reason,
              });
    if (!ticket) {
      return fail(404, "TICKET_NOT_FOUND", "Tiket produksi tidak ditemukan.");
    }
    return ok(ticket);
  } catch (error) {
    const response = productionErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
