import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { updateCustomerOrderStatus } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const decisionSchema = z.object({
  action: z.enum([
    "accept",
    "reject",
    "paid",
    "request_bill",
    "whatsapp_sent",
    "waiter_cash_received",
    "waiter_cash_deposited",
  ]),
  reason: z.string().trim().max(240).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  paymentProvider: z.string().trim().max(60).optional(),
  paymentReference: z.string().trim().max(80).optional(),
  cashReceived: z.number().int().nonnegative().optional(),
  cashDeposited: z.number().int().nonnegative().optional(),
  paymentNote: z.string().trim().max(240).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireGarageSession([
    "Owner / CEO",
    "Admin",
    "Manager Operasional",
    "Kasir",
    "Waiter 1",
    "Waiter 2",
    "Supervisor Shift",
  ]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, decisionSchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  try {
    const result = await updateCustomerOrderStatus(id, body.data, session.data);
    if (!result) {
      return fail(404, "CUSTOMER_ORDER_NOT_FOUND", "Customer QR order tidak ditemukan.");
    }

    return ok(result);
  } catch (error) {
    return fail(
      400,
      "CUSTOMER_ORDER_STATUS_FAILED",
      error instanceof Error ? error.message : "Status customer order gagal diproses.",
    );
  }
}
