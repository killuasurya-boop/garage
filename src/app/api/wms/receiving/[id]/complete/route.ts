import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { completeReceiving, ReceivingDiscrepancyError } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// confirmDiscrepancy: Owner/Manajer sudah melihat & menyetujui selisih qty >10%.
const schema = z.object({ confirmDiscrepancy: z.boolean().optional() }).optional();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => undefined));
  const confirmDiscrepancy = body.success ? body.data?.confirmDiscrepancy === true : false;
  try {
    const actorName = `${session.data.user.name} / ${session.data.profile.role}`;
    const rec = await completeReceiving(id, session.data.user.id, { forceApprove: confirmDiscrepancy, actorName });
    if (!rec) return fail(404, "RECEIVING_NOT_FOUND", "Dokumen penerimaan tidak ditemukan.");
    return ok(rec);
  } catch (e) {
    if (e instanceof ReceivingDiscrepancyError) return fail(409, "RECEIVING_DISCREPANCY", e.message);
    return fail(400, "RECEIVING_COMPLETE_FAILED", e instanceof Error ? e.message : "Gagal menyelesaikan.");
  }
}
