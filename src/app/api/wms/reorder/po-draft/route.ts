import { ok } from "@/lib/api-response";
import { generateWmsPoDraft } from "@/lib/wms-service";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Draft PO = keputusan pengadaan → Owner/Manajer (menu Smart Reorder juga khusus mereka).
export async function POST() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await generateWmsPoDraft());
}
