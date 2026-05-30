import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import {
  createStockMovement,
  getStockMovementsSummary,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const movementSchema = z.object({
  itemSku: z.string().min(1).optional(),
  type: z.string().min(1),
  note: z.string().min(1),
  qty: z.number().optional(),
  applyToStock: z.boolean().optional(),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const daysRaw = url.searchParams.get("days");
  const days = Number(daysRaw);
  const summary = await getStockMovementsSummary(
    {
      days:
        Number.isFinite(days) && days > 0 && days <= 90
          ? Math.round(days)
          : 7,
    },
    session.data,
  );
  return ok(summary);
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, movementSchema);
  if (body.error) {
    return body.error;
  }

  return ok(await createStockMovement(body.data, session.data), { status: 201 });
}
