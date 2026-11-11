import { getAppSettings } from "@/lib/garage-service";
import { partnerPerformanceSettings } from "@/lib/partner-hub-perf-settings";
import { partnerPerformanceReport } from "@/lib/partner-hub-service";
import { partnerRoute, periodFromQuery } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rapor kinerja satu mitra di outlet staf (Owner/Manajer). ?from=&to= (WIB, inklusif).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const { id } = await context.params;
  const { from, to } = periodFromQuery(new URL(request.url));
  return partnerRoute(async () => {
    const settings = await getAppSettings(session.data.profile.outlet.id);
    return partnerPerformanceReport(id, session.data.profile.outlet.id, from, to, partnerPerformanceSettings(settings));
  });
}
