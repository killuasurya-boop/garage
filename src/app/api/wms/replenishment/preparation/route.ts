import { fail } from "@/lib/api-response";
import { getPreparation } from "@/lib/wms-replenishment";
import { parseReplenishmentFilters } from "@/lib/wms-replenishment-validation";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const filters = parseReplenishmentFilters(new URL(request.url));
  if (!filters.success) return fail(400, "FILTER_INVALID", filters.error.issues.map((i) => i.message).join("; "));
  try { return replenishmentOk(await getPreparation(session.actor, filters.data)); }
  catch (error) { return replenishmentFailure(error); }
}
