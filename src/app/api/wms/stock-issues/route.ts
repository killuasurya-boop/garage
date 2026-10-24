import { ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { listOpenWmsStockIssues } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Masalah stok terbuka (bahan belum di WMS, satuan beda, terjual melebihi stok). */
export async function GET() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await listOpenWmsStockIssues());
}
