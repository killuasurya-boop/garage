import { z } from "zod";

import { fail, ok } from "@/lib/api-response";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { verifySupplierPayment, voidSupplierPayment } from "@/lib/wms-procurement";
import { procActor } from "@/lib/wms-procurement-route";
import { withMasterErrors } from "@/lib/wms-master-route";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** verify = Owner / Manajer lain · void = Owner (wajib alasan). */
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  const { id, action } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "INVALID_ID", "ID pembayaran tidak valid.");
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const actor = procActor(session.data);
  return withMasterErrors(async () => {
    if (action === "verify") return ok(await verifySupplierPayment(id, actor));
    if (action === "void") return ok(await voidSupplierPayment(id, typeof body.reason === "string" ? body.reason : "", actor));
    return fail(404, "ACTION_UNKNOWN", "Aksi tidak dikenal.");
  });
}
