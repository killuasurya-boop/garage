import { getClosingNotifications } from "@/lib/wms-replenishment";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";
export const runtime = "nodejs";
export async function GET() {
  const session = await replenishmentSession();
  if (session.response) return session.response;
  try { return replenishmentOk(await getClosingNotifications(session.actor)); }
  catch (error) { return replenishmentFailure(error); }
}
