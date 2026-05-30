import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createSupplier } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const supplierSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(80).optional(),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
});

export async function POST(request: Request) {
  const session = await requirePermission("finance:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, supplierSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createSupplier(body.data, session.data), { status: 201 });
}
