import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getReceiving, updateReceiving } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  supplier: z.string().trim().max(140).optional(),
  poNumber: z.string().trim().max(60).optional(),
  additionalCost: z.number().nonnegative().max(1_000_000_000).optional(),
  warehouseId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        orderedQty: z.number().nonnegative(),
        receivedQty: z.number().nonnegative(),
        hpp: z.number().nonnegative().max(100_000_000),
        qc: z.enum(["pass", "discrepancy", "reject"]).optional(),
        batchNo: z.string().trim().max(60).optional(),
        expiredAt: z.string().optional().nullable(),
        buyQty: z.number().nonnegative().nullable().optional(),
        packSize: z.number().nonnegative().nullable().optional(),
        buyUnit: z.string().trim().max(24).nullable().optional(),
        discrepancyNote: z.string().trim().max(200).optional(),
        putAwayLocation: z.string().trim().max(60).optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const rec = await getReceiving(id);
  if (!rec) return fail(404, "RECEIVING_NOT_FOUND", "Dokumen penerimaan tidak ditemukan.");
  return ok(rec);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  try {
    const rec = await updateReceiving(id, parsed.data);
    if (!rec) return fail(404, "RECEIVING_NOT_FOUND", "Dokumen penerimaan tidak ditemukan.");
    return ok(rec);
  } catch (e) {
    return fail(400, "RECEIVING_UPDATE_FAILED", e instanceof Error ? e.message : "Gagal update.");
  }
}
