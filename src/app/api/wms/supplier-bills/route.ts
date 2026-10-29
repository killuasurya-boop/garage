import { ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { listSupplierBills } from "@/lib/wms-procurement";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const STATUSES = new Set(["unpaid", "partial", "paid", "void"]);

/** Tagihan supplier (penerimaan tempo) + pembayarannya. ?status=unpaid,partial */
export async function GET(request: Request) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "").split(",").filter((s) => STATUSES.has(s));
  return ok(await listSupplierBills({ status, supplierId: url.searchParams.get("supplier") ?? undefined }));
}
