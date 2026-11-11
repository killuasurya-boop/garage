import { getAppSettings } from "@/lib/garage-service";
import { requirePartnerSession } from "@/lib/partner-auth";
import { partnerPerformanceSettings } from "@/lib/partner-hub-perf-settings";
import { partnerPerformanceReport } from "@/lib/partner-hub-service";
import { partnerRoute, periodFromQuery } from "@/lib/partner-hub-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rapor kinerja milik mitra yang login (?from=&to= WIB). Tanpa HPP/profit Garage: hanya waktu layanan & qty.
export async function GET(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { from, to } = periodFromQuery(new URL(request.url));
  return partnerRoute(async () => {
    const settings = await getAppSettings(session.data.partner.outletId);
    return partnerPerformanceReport(session.data.partner.id, session.data.partner.outletId, from, to, partnerPerformanceSettings(settings));
  });
}
