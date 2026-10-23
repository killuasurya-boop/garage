import { getClosingReadiness } from "@/lib/wms-replenishment-readiness";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";

export const runtime = "nodejs";
export async function GET() {
  const session = await replenishmentSession(true);
  if (session.response) return session.response;
  try { return replenishmentOk(await getClosingReadiness(session.actor)); }
  catch (error) { return replenishmentFailure(error); }
}
