import { ok } from "@/lib/api-response";
import { requireAnyPermission } from "@/lib/server-auth";
import { getRouterSync, getWifiSettings, getWifiUsage, wifiJoinQrPayload } from "@/lib/wifi-hotspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pemakaian WiFi member (Owner/Manajer): login hari ini + 30 terakhir.
export async function GET() {
  const session = await requireAnyPermission(["crm:read", "staff:manage"]);
  if (session.response) return session.response;
  const [settings, usage, routerSync] = await Promise.all([getWifiSettings(), getWifiUsage(), getRouterSync()]);
  return ok({
    ...usage,
    enabled: settings.enabled,
    configured: settings.configured,
    ssid: settings.ssid,
    joinQr: wifiJoinQrPayload(settings.ssid),
    routerSync,
  });
}
