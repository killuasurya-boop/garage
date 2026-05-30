import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createInventoryTransferRequest, listInventoryTransferRequests } from "@/lib/garage-service";
import { requireAnyPermission, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const transferSchema = z.object({
  outletId: z.string().uuid().optional(),
  station: z.enum(["bar", "dapur"]).optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        qty: z.number().positive(),
        note: z.string().trim().max(240).optional(),
      }),
    )
    .min(1),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit"));
  return ok({
    requests: await listInventoryTransferRequests({
      status: url.searchParams.get("status") ?? undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  });
}

export async function POST(request: Request) {
  const session = await requireAnyPermission(["inventory:read", "kitchen:write", "pos:use"]);
  if (session.response) return session.response;

  const body = await readJson(request, transferSchema);
  if (body.error) return body.error;

  try {
    return ok(await createInventoryTransferRequest(body.data, session.data), { status: 201 });
  } catch (error) {
    return fail(
      400,
      "TRANSFER_REQUEST_FAILED",
      error instanceof Error ? error.message : "Request outlet gagal dibuat.",
    );
  }
}
