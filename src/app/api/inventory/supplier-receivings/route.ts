import { ok } from "@/lib/api-response";
import { listSupplierReceivings } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { legacyInventoryGone } from "@/lib/legacy-inventory-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit"));
  return ok({ receivings: await listSupplierReceivings({ limit: Number.isFinite(limit) ? limit : undefined }) });
}

export async function POST() {
  return legacyInventoryGone("Gudang → Penerimaan (/warehouse/receiving)");
}
