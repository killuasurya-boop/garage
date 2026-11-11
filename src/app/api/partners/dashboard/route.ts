import { getAppSettings } from "@/lib/garage-service";
import { partnerDashboardSummary } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Widget Dashboard Owner/Manajer: penjualan & kewajiban mitra (berisi profit → bukan untuk Kasir).
export async function GET() {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  return partnerRoute(async () => {
    const settings = await getAppSettings(session.data.profile.outlet.id);
    if (!settings.partnerHubEnabled) return { enabled: false as const };
    return { enabled: true as const, ...(await partnerDashboardSummary(session.data)) };
  });
}
