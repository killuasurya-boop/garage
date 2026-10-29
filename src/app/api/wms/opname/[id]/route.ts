import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { wmsIsElevated } from "@/lib/wms-access";
import { opnameAccessError } from "@/lib/wms-opname-access";
import { getWmsOpname, saveWmsOpnameLine } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  lineId: z.string().uuid(),
  physicalQty: z.number().nonnegative().max(100_000_000),
  /** Autosave idempoten: id unik per input; kiriman ulang tidak menambah percobaan. */
  clientRequestId: z.string().trim().min(8).max(80).optional(),
  /** Rincian konversi kemasan (mis. { packs, factor, loose, uom }) — dicatat di riwayat hitung. */
  breakdown: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const { id } = await context.params;
  const denied = await opnameAccessError(id, session.data.profile.role);
  if (denied) return denied;
  // Hitung buta: non-Owner/Manajer tidak melihat stok sistem/selisih/nilai, dan hanya melihat hitungannya sendiri.
  const elevated = wmsIsElevated(session.data.profile.role);
  const op = await getWmsOpname(id, { blind: !elevated, viewerId: elevated ? null : session.data.user.id });
  if (!op) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
  return ok(op);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  const denied = await opnameAccessError(id, session.data.profile.role);
  if (denied) return denied;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  let row: Awaited<ReturnType<typeof saveWmsOpnameLine>>;
  try {
    row = await saveWmsOpnameLine(parsed.data.lineId, parsed.data.physicalQty, id, session.data.user.id, {
      clientRequestId: parsed.data.clientRequestId ?? null,
      breakdown: parsed.data.breakdown ?? null,
    });
  } catch (error) {
    return fail(409, "OPNAME_LOCKED", error instanceof Error ? error.message : "Opname tidak bisa diubah.");
  }
  if (!row) return fail(404, "LINE_NOT_FOUND", "Baris opname tidak ditemukan.");
  // Respons sengaja tidak berisi stok sistem / klasifikasi (tetap blind untuk penghitung).
  return ok({ id: row.id, savedAt: row.countedAt });
}
