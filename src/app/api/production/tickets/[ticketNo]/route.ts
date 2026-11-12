import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  productionHandover,
  productionPickup,
  productionReadyAndCall,
  productionServeDirect,
  productionTicketAction,
  setFifoOverride,
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
    // V7: Owner/Manajer mendahulukan tiket dari FIFO / mengembalikannya (alasan wajib, tercatat di audit).
    action: z.enum(["prioritize", "unprioritize"]),
    reason: z.string().trim().min(3, "Alasan wajib diisi.").max(200),
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
    let ticket: unknown;
    if (data.action === "prioritize" || data.action === "unprioritize") {
      ticket = await setFifoOverride(ticketNo, { prioritize: data.action === "prioritize", reason: data.reason }, session.data);
    } else if (data.action === "handover") {
      ticket = await productionHandover(ticketNo, data.waiterUserId, session.data);
    } else if (data.action === "ready_call") {
      ticket = await productionReadyAndCall(ticketNo, session.data, { qcConfirmed: data.qcConfirmed });
    } else if (data.action === "serve_direct") {
      ticket = await productionServeDirect(ticketNo, session.data);
    } else if (data.action === "pickup") {
      ticket = await productionPickup(ticketNo, data.waiterUserId, session.data);
    } else {
      const basic = data as { action: "start" | "ready" | "reopen"; qcConfirmed?: boolean; reason?: string };
      ticket = await productionTicketAction(ticketNo, basic.action, session.data, { qcConfirmed: basic.qcConfirmed, reason: basic.reason });
    }
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
