import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createReceiving, listReceivings } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  supplier: z.string().trim().max(140).optional(),
  warehouseId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        orderedQty: z.number().nonnegative(),
        receivedQty: z.number().nonnegative(),
        hpp: z.number().nonnegative().max(100_000_000),
        qc: z.enum(["pass", "discrepancy", "reject"]).optional(),
        batchNo: z.string().trim().max(60).optional(),
        expiredAt: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(100),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listReceivings());
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  return ok(await createReceiving(parsed.data, session.data.user.id), { status: 201 });
}
