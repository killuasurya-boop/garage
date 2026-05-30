import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createSupplierInvoice } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const invoiceSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  invoiceNo: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(180).optional(),
  amount: z.number().int().positive(),
  dueDate: z.string().datetime({ offset: true }),
  issuedAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, invoiceSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createSupplierInvoice(body.data, session.data), { status: 201 });
}
