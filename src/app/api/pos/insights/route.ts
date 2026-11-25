import { ok, serviceErrorResponse } from "@/lib/api-response";
import { getPosBestsellers } from "@/lib/pos-insights";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Terlaris 7 hari dari penjualan lunas outlet staf (Fase 5) — dipakai tile "Terlaris 7 hari" & urutan Favorit POS. */
export async function GET() {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;
  try {
    return ok(await getPosBestsellers({ outletId: session.data.profile.outlet.id }));
  } catch (error) {
    return serviceErrorResponse(error, "POS_INSIGHTS_FAILED", "Data terlaris gagal dimuat.");
  }
}
