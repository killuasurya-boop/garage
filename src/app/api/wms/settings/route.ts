import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { getAppSettings, updateAppSettings } from "@/lib/garage-service";
import { getWmsExtendedConfig, updateWmsExtendedConfig } from "@/lib/wms-service";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  wmsAutoConsume: z.boolean().optional(),
  expiryStrict: z.boolean().optional(),
  defaultPutAway: z.string().trim().max(40).optional(),
  notifyLowStock: z.boolean().optional(),
  notifyColdChain: z.boolean().optional(),
  reorderLeadDays: z.number().int().min(1).max(90).optional(),
});

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const [settings, wmsConfig] = await Promise.all([
    getAppSettings(session.data.profile.outlet.id),
    getWmsExtendedConfig(),
  ]);
  return ok({ wmsAutoConsume: settings.wmsAutoConsume, ...wmsConfig });
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) return session.response;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  const { wmsAutoConsume, ...wmsPatch } = parsed.data;
  if (wmsAutoConsume !== undefined) {
    await updateAppSettings(session.data.profile.outlet.id, { wmsAutoConsume }, session.data);
  }
  const wmsConfig = Object.keys(wmsPatch).length ? await updateWmsExtendedConfig(wmsPatch) : await getWmsExtendedConfig();
  const settings = await getAppSettings(session.data.profile.outlet.id);
  return ok({ wmsAutoConsume: settings.wmsAutoConsume, ...wmsConfig });
}
