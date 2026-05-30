import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { createStockOpname, listStockOpnameSessions } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const opnameSchema = z.object({
  locationType: z.enum(["warehouse", "outlet"]).optional(),
  outletId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        systemQty: z.number().nonnegative(),
        physicalQty: z.number().nonnegative(),
        note: z.string().trim().max(240).optional(),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  return ok({
    sessions: await listStockOpnameSessions(session.data, {
      status: url.searchParams.get("status") ?? undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  });
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;

  const body = await readJson(request, opnameSchema);
  if (body.error) return body.error;

  return ok(await createStockOpname(body.data, session.data), { status: 201 });
}
