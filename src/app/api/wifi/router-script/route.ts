import { fail } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { secretsMatch } from "@/lib/secret-compare";
import { buildRouterScript, dailyWifiPassword, getWifiSettings, recordRouterSync, wifiDateKey, wifiSecret } from "@/lib/wifi-hotspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dipanggil scheduler MikroTik (/tool fetch ... ; /import): skrip RouterOS yang
// mengeset password harian user hotspot member. Dilindungi GARAGE_WIFI_ROUTER_KEY.
export async function GET(request: Request) {
  const limited = rateLimit(request, "wifi-router-script", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const expected = process.env.GARAGE_WIFI_ROUTER_KEY?.trim();
  const secret = wifiSecret();
  if (!expected || expected.length < 16 || !secret) {
    return fail(503, "WIFI_NOT_CONFIGURED", "Set GARAGE_WIFI_SECRET dan GARAGE_WIFI_ROUTER_KEY (min 16 karakter) di server.");
  }
  const key = new URL(request.url).searchParams.get("key");
  if (!secretsMatch(key, expected)) return fail(401, "WIFI_ROUTER_KEY_INVALID", "Key router salah.");
  const settings = await getWifiSettings();
  const dateKey = wifiDateKey();
  const script = settings.enabled
    ? buildRouterScript({
        password: dailyWifiPassword(secret, dateKey),
        sessionHours: settings.sessionHours,
        sharedUsers: settings.maxDevices,
        dateKey,
      })
    : `# Garage OS - WiFi member nonaktif\n:if ([:len [/ip hotspot user find name="garage-member"]] > 0) do={ /ip hotspot user set [find name="garage-member"] disabled=yes }\n`;
  // Owner bisa melihat "sinkron terakhir" di panel WiFi. Gagal mencatat tidak boleh menggagalkan skrip router.
  await recordRouterSync().catch(() => undefined);
  return new Response(script, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
