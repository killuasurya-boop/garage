import { ok } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { syncOsToWms } from "@/lib/wms-bridge";

export const runtime = "nodejs";

/** Sinkron manual Garage OS → WMS (produk + resep). Owner/Admin/Manager only. */
export async function POST() {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) return session.response;
  const result = await syncOsToWms({ bootstrapStock: false });
  return ok(result);
}
