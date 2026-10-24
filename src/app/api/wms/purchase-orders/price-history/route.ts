import { ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { getSupplierPriceHistory } from "@/lib/wms-purchase";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ?productIds=a,b → harga beli terakhir & rata-rata per supplier. */
export async function GET(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const ids = (new URL(request.url).searchParams.get("productIds") ?? "").split(",").filter((id) => UUID.test(id)).slice(0, 200);
  return ok(await getSupplierPriceHistory(ids));
}
