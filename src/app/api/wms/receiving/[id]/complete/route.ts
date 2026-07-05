import { fail, ok } from "@/lib/api-response";
import { completeReceiving } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  try {
    const actorName = `${session.data.user.name} / ${session.data.profile.role}`;
    const forceApprove = ["Owner / CEO", "Admin", "Manager Operasional"].includes(session.data.profile.role);
    const rec = await completeReceiving(id, session.data.user.id, { forceApprove, actorName });
    if (!rec) return fail(404, "RECEIVING_NOT_FOUND", "Dokumen penerimaan tidak ditemukan.");
    return ok(rec);
  } catch (e) {
    return fail(400, "RECEIVING_COMPLETE_FAILED", e instanceof Error ? e.message : "Gagal menyelesaikan.");
  }
}
