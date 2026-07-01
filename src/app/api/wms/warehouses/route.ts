import { ok } from "@/lib/api-response";
import { listWmsWarehouses } from "@/lib/wms-service";
import { wmsAllowedWarehouseTypes } from "@/lib/wms-access";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  // Staff outlet hanya melihat gudang outlet (bar/dapur); gudang utama khusus elevated.
  const allowedTypes = wmsAllowedWarehouseTypes(session.data.profile.role);
  return ok(await listWmsWarehouses({ allowedTypes }));
}
