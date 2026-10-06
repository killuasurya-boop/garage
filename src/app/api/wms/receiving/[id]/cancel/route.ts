import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { cancelReceiving } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi.").max(200) });

/** Batalkan penerimaan selesai (salah input): stok keluar lagi + belanja di-void. Owner/Manajer. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  try {
    const actorName = `${session.data.user.name} / ${session.data.profile.role}`;
    const rec = await cancelReceiving(id, { userId: session.data.user.id, reason: parsed.data.reason, actorName });
    if (!rec) return fail(404, "RECEIVING_NOT_FOUND", "Dokumen penerimaan tidak ditemukan.");
    return ok(rec);
  } catch (e) {
    return fail(400, "RECEIVING_CANCEL_FAILED", e instanceof Error ? e.message : "Gagal membatalkan penerimaan.");
  }
}
