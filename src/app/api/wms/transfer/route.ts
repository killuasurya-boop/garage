import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { listWmsTransfers, transferStock } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().positive() }))
    .min(1)
    .max(100),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listWmsTransfers());
}

export async function POST(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    return ok(await transferStock(parsed.data, session.data.user.id), { status: 201 });
  } catch (e) {
    return fail(400, "TRANSFER_FAILED", e instanceof Error ? e.message : "Gagal transfer stok.");
  }
}
