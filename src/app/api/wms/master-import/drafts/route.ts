import { ok } from "@/lib/api-response";
import { listDraftRecipes } from "@/lib/master-import";
import { WMS_ELEVATED_ROLES } from "@/lib/wms-access";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

// Resep draft (belum memotong stok) + HPP referensi — untuk ditinjau Owner/Manajer.
export async function GET() {
  const session = await requireGarageSession([...WMS_ELEVATED_ROLES]);
  if (session.response) return session.response;
  return ok(await listDraftRecipes());
}
