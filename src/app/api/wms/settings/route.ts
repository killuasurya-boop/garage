import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import { getAppSettings, updateAppSettings } from "@/lib/garage-service";
import { getWmsExtendedConfig, updateWmsExtendedConfig } from "@/lib/wms-service";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Potong stok WMS dari penjualan POS kini selalu aktif (lewat potong stok resep
// order) — toggle yang tersisa di sini: auto-habis dari stok gudang.
const patchSchema = z.object({
  inventoryBaselinePending: z.boolean().optional(),
  inventoryBaselineTargetDate: z.string().date().nullable().optional(),
  autoSoldOutFromStock: z.boolean().optional(),
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
  return ok({ autoSoldOutFromStock: settings.autoSoldOutFromStock, ...wmsConfig });
}

export async function POST(request: Request) {
  const session = await requireGarageSession(["Owner", "Manajer"]);
  if (session.response) return session.response;
  const parsed = await readJson(request, patchSchema);
  if (parsed.error) return parsed.error;
  const { autoSoldOutFromStock, ...wmsPatch } = parsed.data;
  if (autoSoldOutFromStock !== undefined) {
    await updateAppSettings(session.data.profile.outlet.id, { autoSoldOutFromStock }, session.data);
  }
  const wmsConfig = Object.keys(wmsPatch).length ? await updateWmsExtendedConfig(wmsPatch) : await getWmsExtendedConfig();
  const settings = await getAppSettings(session.data.profile.outlet.id);
  return ok({ autoSoldOutFromStock: settings.autoSoldOutFromStock, ...wmsConfig });
}
