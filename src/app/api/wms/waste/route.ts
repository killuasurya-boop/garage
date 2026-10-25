import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { ProcurementError, recordWaste, roomArea, WASTE_KINDS } from "@/lib/wms-procurement";
import { wmsAllowedWarehouseTypes } from "@/lib/wms-access";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qty: z.number().positive(),
  kind: z.enum(WASTE_KINDS),
  reason: z.string().trim().min(3).max(300),
});

// Catat bahan rusak/kedaluwarsa/tumpah (ledger "waste", alasan wajib, tidak boleh minus).
export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const room = await roomArea(parsed.data.warehouseId);
  if (!room) return fail(404, "WAREHOUSE_NOT_FOUND", "Ruang tidak ditemukan.");
  const allowed = wmsAllowedWarehouseTypes(session.data.profile.role);
  if (allowed !== "all" && !allowed.includes(room.type as never)) {
    return fail(403, "WAREHOUSE_FORBIDDEN", "Waste gudang utama dicatat Owner/Manajer.");
  }
  try {
    const actor = { id: session.data.user.id, name: session.data.user.name, role: session.data.profile.role };
    return ok(await recordWaste(parsed.data, actor), { status: 201 });
  } catch (e) {
    if (e instanceof ProcurementError) return fail(409, "WASTE_INVALID", e.message);
    return fail(400, "WASTE_FAILED", e instanceof Error ? e.message : "Gagal mencatat waste.");
  }
}
