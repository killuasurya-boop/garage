import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createWmsOpname, getWmsWarehouseType, listWmsOpnames } from "@/lib/wms-service";
import { wmsAllowedWarehouseTypes } from "@/lib/wms-access";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({ warehouseId: z.string().uuid() });

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  return ok(await listWmsOpnames());
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  // Staff outlet hanya boleh opname ruang Bar/Dapur; gudang utama khusus Owner/Manajer.
  const type = await getWmsWarehouseType(parsed.data.warehouseId);
  if (!type) return fail(404, "WAREHOUSE_NOT_FOUND", "Ruang gudang tidak ditemukan.");
  const allowed = wmsAllowedWarehouseTypes(session.data.profile.role);
  if (allowed !== "all" && !allowed.includes(type)) {
    return fail(403, "WAREHOUSE_FORBIDDEN", "Opname gudang utama hanya untuk Owner/Manajer.");
  }
  return ok(await createWmsOpname(parsed.data.warehouseId, session.data.user.id), { status: 201 });
}
