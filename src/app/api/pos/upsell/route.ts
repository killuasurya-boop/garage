import { fail, ok, serviceErrorResponse } from "@/lib/api-response";
import { getPosPairings } from "@/lib/pos-insights";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

/** "Sering dibeli bersama" (Fase 5): pasangan item dari order lunas outlet staf, 30 hari. */
export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const menuItemId = url.searchParams.get("menuItemId")?.trim();
  if (!menuItemId || menuItemId.length > 120) {
    return fail(400, "MISSING_PARAM", "menuItemId wajib diisi.");
  }
  const rawDays = Number(url.searchParams.get("days"));
  const rawLimit = Number(url.searchParams.get("limit"));
  try {
    return ok(
      await getPosPairings({
        outletId: session.data.profile.outlet.id,
        menuItemId,
        days: Number.isFinite(rawDays) && rawDays > 0 ? rawDays : undefined,
        limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined,
      }),
    );
  } catch (error) {
    return serviceErrorResponse(error, "UPSELL_FAILED", "Saran item gagal dimuat.");
  }
}
