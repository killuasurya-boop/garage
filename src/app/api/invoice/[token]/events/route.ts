import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { recordCxEvent, resolveInvoiceOrder } from "@/lib/customer-experience-service";
import { isClientCxEvent } from "@/lib/cx-events";
import { requireMemberAuth } from "@/lib/member-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({ event: z.string().max(64) });

// Event funnel invoice → member (CX Engine V4). Tanpa PII: token tidak disimpan,
// hanya order id hasil resolusi server + customer dari sesi member (bila ada).
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, "invoice-cx-events", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(await request.text()));
  } catch {
    return fail(400, "INVALID_EVENT", "Event tidak valid.");
  }
  if (!isClientCxEvent(parsed.event)) return fail(400, "INVALID_EVENT", "Event tidak dikenal.");

  const { token } = await context.params;
  const order = await resolveInvoiceOrder(token);
  if (!order) return fail(404, "INVOICE_NOT_FOUND", "Invoice tidak ditemukan.");

  const session = await requireMemberAuth(request);
  const result = await recordCxEvent({
    event: parsed.event,
    orderId: order.id,
    customerId: session.data?.customer.id ?? null,
  });
  return ok(result);
}
