import { ok } from "@/lib/api-response";
import { listSupplierPayables } from "@/lib/wms-procurement";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Hutang supplier (pembelian tempo) — bayar lewat Keuangan → invoice supplier.
export async function GET(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const includePaid = new URL(request.url).searchParams.get("all") === "1";
  return ok(await listSupplierPayables({ includePaid }));
}
