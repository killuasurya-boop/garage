import { fail, ok } from "@/lib/api-response";
import { finalizeWmsOpname } from "@/lib/wms-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Finalisasi opname mengubah stok resmi → hanya peran elevated.
const OPNAME_ROLES = ["Owner", "Manajer"] as const;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...OPNAME_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    const op = await finalizeWmsOpname(id, session.data.user.id, {
      allowSelfApproval: session.data.profile.role === "Owner",
      // Baris "eskalasi Owner" (nilai kritis / berulang) hanya boleh disetujui Owner.
      approverRole: session.data.profile.role,
    });
    if (!op) return fail(404, "OPNAME_NOT_FOUND", "Sesi opname tidak ditemukan.");
    return ok(op);
  } catch (e) {
    return fail(400, "OPNAME_FINALIZE_FAILED", e instanceof Error ? e.message : "Gagal finalisasi.");
  }
}
