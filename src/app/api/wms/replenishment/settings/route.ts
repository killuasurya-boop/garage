import { readJson } from "@/lib/api-response";
import { getClosingSettings, updateClosingSettings } from "@/lib/wms-replenishment";
import { closingSettingsSchema } from "@/lib/wms-replenishment-validation";
import { replenishmentSession, replenishmentOk, replenishmentFailure } from "@/lib/wms-replenishment-api";

export const runtime = "nodejs";
export async function GET() {
  const session = await replenishmentSession(true);
  if (session.response) return session.response;
  try { return replenishmentOk(await getClosingSettings(session.actor)); }
  catch (error) { return replenishmentFailure(error); }
}
export async function PATCH(request: Request) {
  const session = await replenishmentSession(true);
  if (session.response) return session.response;
  const input = await readJson(request, closingSettingsSchema);
  if (input.error) return input.error;
  try { return replenishmentOk(await updateClosingSettings(session.actor, input.data)); }
  catch (error) { return replenishmentFailure(error); }
}
