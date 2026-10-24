import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { wmsWarehouse } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { wmsAllowedWarehouseTypes, wmsIsElevated } from "@/lib/wms-access";
import { listExpiringWmsBatches, listWmsWaste, recordWmsWaste, summarizeWmsWaste, WMS_WASTE_REASONS } from "@/lib/wms-waste";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const createSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().nullable().optional(),
  qty: z.number().positive().max(1_000_000),
  reason: z.enum(Object.keys(WMS_WASTE_REASONS) as [keyof typeof WMS_WASTE_REASONS, ...Array<keyof typeof WMS_WASTE_REASONS>]),
  note: z.string().trim().max(300).optional(),
});

/** Daftar waste 30 hari + ringkasan per alasan + batch kedaluwarsa/hampir (≤3 hari). */
export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const [rows, summary, expiring] = await Promise.all([listWmsWaste({ from, to }), summarizeWmsWaste(from, to), listExpiringWmsBatches(3)]);
  return ok({ rows, summary, expiring });
}

export async function POST(request: Request) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const parsed = await readJson(request, createSchema);
  if (parsed.error) return parsed.error;
  const role = session.data.profile.role;
  const allowed = wmsAllowedWarehouseTypes(role);
  if (allowed !== "all") {
    const [wh] = await getDb().select({ type: wmsWarehouse.type }).from(wmsWarehouse).where(eq(wmsWarehouse.id, parsed.data.warehouseId)).limit(1);
    if (!wh || !allowed.includes(wh.type as never)) return fail(403, "WMS_FORBIDDEN_WAREHOUSE", "Peran ini hanya boleh mencatat waste di Bar/Dapur.");
  }
  try {
    const row = await recordWmsWaste(parsed.data, {
      userId: session.data.user.id,
      name: `${session.data.user.name} / ${role}`,
      elevated: wmsIsElevated(role),
    });
    return ok(row, { status: 201 });
  } catch (e) {
    return fail(400, "WMS_WASTE_FAILED", e instanceof Error ? e.message : "Gagal mencatat waste.");
  }
}
