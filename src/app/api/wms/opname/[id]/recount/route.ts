import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { requestOpnameRecount } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Minta hitung ulang: hanya peran elevated; sesi kembali ke draft agar penghitung mengisi ulang.
const OPNAME_ROLES = ["Owner", "Manajer"] as const;

const schema = z.object({
  lineIds: z.array(z.string().uuid()).min(1).max(500),
  reason: z.string().trim().min(3).max(300),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...OPNAME_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const parsed = await readJson(request, schema);
  if (parsed.error) return parsed.error;
  try {
    const op = await requestOpnameRecount(id, parsed.data.lineIds, parsed.data.reason, session.data.user.id);
    if (!op) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
    return ok(op);
  } catch (e) {
    return fail(400, "OPNAME_RECOUNT_FAILED", e instanceof Error ? e.message : "Gagal meminta hitung ulang.");
  }
}
