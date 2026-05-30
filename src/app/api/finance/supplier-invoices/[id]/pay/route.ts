import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { markSupplierInvoicePaid } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const paySchema = z.object({
  paymentRef: z.string().trim().max(120).optional(),
  amount: z.number().int().positive().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, paySchema);
  if (body.error) {
    return body.error;
  }

  const { id } = await context.params;
  const invoice = await markSupplierInvoicePaid({ id, ...body.data }, session.data);
  if (!invoice) {
    return fail(404, "NOT_FOUND", "Supplier invoice tidak ditemukan.");
  }

  return ok(invoice);
}
