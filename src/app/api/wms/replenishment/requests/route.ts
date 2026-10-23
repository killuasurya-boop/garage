import { fail, readJson } from "@/lib/api-response";
import { listReplenishments, saveClosing } from "@/lib/wms-replenishment";
import { saveClosingSchema, parseReplenishmentFilters } from "@/lib/wms-replenishment-validation";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const filters = parseReplenishmentFilters(new URL(request.url));
  if (!filters.success) return fail(400, "FILTER_INVALID", filters.error.issues.map((i) => i.message).join("; "));
  try { return replenishmentOk(await listReplenishments(session.actor, filters.data)); }
  catch (error) { return replenishmentFailure(error); }
}
export async function POST(request: Request) {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  const input = await readJson(request, saveClosingSchema);
  if (input.error) return input.error;
  try { return replenishmentOk(await saveClosing(session.actor, input.data), 201); }
  catch (error) { return replenishmentFailure(error); }
}
