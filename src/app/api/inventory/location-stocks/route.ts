import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { adjustInventoryLocationStock, getInventoryLocationStockData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const locationStockAdjustSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["add", "subtract", "clear"]),
  qty: z.number().positive().optional(),
  note: z.string().trim().min(3).max(240),
});

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const locationType = url.searchParams.get("locationType");
  return ok({
    stocks: await getInventoryLocationStockData({
      locationType:
        locationType === "warehouse" || locationType === "outlet" ? locationType : undefined,
      outletId: url.searchParams.get("outletId") ?? undefined,
    }),
  });
}

export async function PATCH(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;

  const body = await readJson(request, locationStockAdjustSchema);
  if (body.error) return body.error;

  try {
    return ok(await adjustInventoryLocationStock(body.data, session.data));
  } catch (error) {
    return fail(
      400,
      "LOCATION_STOCK_ADJUST_FAILED",
      error instanceof Error ? error.message : "Adjustment stok lokasi gagal.",
    );
  }
}
