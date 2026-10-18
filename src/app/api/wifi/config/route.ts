import { ok } from "@/lib/api-response";
import { getWifiSettings } from "@/lib/wifi-hotspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publik: info WiFi member untuk halaman /wifi (tanpa password).
export async function GET() {
  const settings = await getWifiSettings();
  return ok({
    enabled: settings.enabled && settings.configured,
    ssid: settings.ssid,
    sessionHours: settings.sessionHours,
  });
}
