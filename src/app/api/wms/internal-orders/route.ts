import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createInternalOrder, listInternalOrders } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  outletWarehouseId: z.string().uuid(),
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().positive() }))
    .min(1)
    .max(100),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listInternalOrders());
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  try {
    return ok(await createInternalOrder(parsed.data, session.data.user.id), { status: 201 });
  } catch (e) {
    return fail(400, "IO_FAILED", e instanceof Error ? e.message : "Gagal membuat internal order.");
  }
}
