import { fail, ok } from "@/lib/api-response";
import { submitWmsOpname } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Petugas mengajukan hasil hitung opname untuk disetujui Owner/Manajer.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("inventory:write");
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    const op = await submitWmsOpname(id, session.data.user.id);
    if (!op) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
    return ok(op);
  } catch (e) {
    return fail(400, "OPNAME_SUBMIT_FAILED", e instanceof Error ? e.message : "Gagal mengajukan opname.");
  }
}
