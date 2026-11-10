import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { wmsIsElevated } from "@/lib/wms-access";
import { cancelMaterialRequest, receiveMaterialRequest, sendMaterialRequest } from "@/lib/wms-material-request";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const sendSchema = z.object({ lines: z.array(z.object({ itemId: z.string().uuid(), qty: z.number().nonnegative().max(1_000_000) })).max(100) });
// M6: lines = jumlah yang benar-benar diterima per baris (opsional; tanpa lines = sesuai kiriman).
const receiveSchema = z.object({
  note: z.string().trim().max(300).optional(),
  lines: z.array(z.object({ itemId: z.string().uuid(), receivedQty: z.number().nonnegative().max(1_000_000) })).max(100).optional(),
});

/** send = gudang kirim (pindah stok) · receive = divisi konfirmasi terima · cancel = batal sebelum dikirim. */
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  // Mengirim memindahkan stok gudang → butuh izin tulis stok; terima/batal cukup izin produksi.
  const session = await requirePermission(action === "send" ? "inventory:write" : "kitchen:write");
  if (session.response) return session.response;
  try {
    let row;
    if (action === "send") {
      const parsed = await readJson(request, sendSchema);
      if (parsed.error) return parsed.error;
      row = await sendMaterialRequest(id, parsed.data.lines, { userId: session.data.user.id, outletId: session.data.profile.outlet?.id ?? null });
    } else if (action === "receive") {
      const parsed = await readJson(request, receiveSchema);
      if (parsed.error) return parsed.error;
      row = await receiveMaterialRequest(id, parsed.data, { userId: session.data.user.id, outletId: session.data.profile.outlet?.id ?? null });
    } else if (action === "cancel") {
      row = await cancelMaterialRequest(id, { userId: session.data.user.id, elevated: wmsIsElevated(session.data.profile.role) });
    } else {
      return fail(404, "MATERIAL_ACTION_UNKNOWN", "Aksi tidak dikenal.");
    }
    if (!row) return fail(404, "MATERIAL_REQUEST_NOT_FOUND", "Permintaan bahan tidak ditemukan.");
    return ok(row);
  } catch (e) {
    return fail(400, "MATERIAL_ACTION_FAILED", e instanceof Error ? e.message : "Aksi gagal.");
  }
}
