import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { returnWmsOpname } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().trim().min(3).max(300) });

// Owner/Manajer mengembalikan opname yang diajukan ke petugas untuk dihitung ulang.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;
  try {
    const op = await returnWmsOpname(id, parsed.data.note, session.data.user.id);
    if (!op) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
    return ok(op);
  } catch (e) {
    return fail(400, "OPNAME_RETURN_FAILED", e instanceof Error ? e.message : "Gagal mengembalikan opname.");
  }
}
