import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { createWmsOpname, getWmsWarehouseType, listWmsOpnames } from "@/lib/wms-service";
import { wmsAllowedWarehouseTypes } from "@/lib/wms-access";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  warehouseId: z.string().uuid(),
  kind: z.enum(["daily", "weekly", "monthly", "incidental"]).optional(),
  scope: z.enum(["full", "partial", "cycle"]).optional(),
  /** Cycle count: bahan prioritas yang dihitung (skor risiko). */
  productIds: z.array(z.string().uuid()).max(500).optional(),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  // Daftar ikut dibatasi lokasi: staf outlet tidak melihat sesi gudang utama.
  return ok(await listWmsOpnames({ allowedTypes: wmsAllowedWarehouseTypes(session.data.profile.role) }));
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
  try {
    const { warehouseId, ...opts } = parsed.data;
    return ok(await createWmsOpname(warehouseId, session.data.user.id, opts), { status: 201 });
  } catch (e) {
    return fail(400, "OPNAME_CREATE_FAILED", e instanceof Error ? e.message : "Gagal membuat sesi opname.");
  }
}
