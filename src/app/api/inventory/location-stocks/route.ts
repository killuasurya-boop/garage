import { ok } from "@/lib/api-response";
import { getInventoryLocationStockData } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { legacyInventoryGone } from "@/lib/legacy-inventory-api";

export const runtime = "nodejs";

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

export async function PATCH() {
  return legacyInventoryGone("Gudang → Penyesuaian (/warehouse/adjustment)");
}
