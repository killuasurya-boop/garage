import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { rejectWmsOpname } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3, "Alasan penolakan wajib diisi.").max(300) });

/** Tolak hasil opname → kembali draft untuk dihitung ulang. Owner/Manajer. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  try {
    const op = await rejectWmsOpname(id, parsed.data.reason, session.data.user.id);
    if (!op) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
    return ok(op);
  } catch (e) {
    return fail(400, "OPNAME_REJECT_FAILED", e instanceof Error ? e.message : "Gagal menolak opname.");
  }
}
