import { backgroundJobHealth } from "@/lib/background-job-runner";
import { getAppSettings } from "@/lib/garage-service";
import { partnerHealthForOutlet } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Peringatan kesehatan semua mitra outlet (tiket macet, ketersediaan basi, pengajuan menunggu, setoran). Hanya baca.
export async function GET() {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  return partnerRoute(async () => {
    const settings = await getAppSettings(session.data.profile.outlet.id);
    // Kesehatan proses otomatis (jam layanan, eskalasi, pengingat setoran) — Owner 16 Nov 2026.
    const jobs = backgroundJobHealth();
    if (!settings.partnerHubEnabled) return { enabled: false as const, partners: [], jobs };
    const partners = await partnerHealthForOutlet(session.data, {
      acceptSlaMinutes: settings.partnerSlaEscalateMinutes,
      heartbeatMinutes: settings.partnerHeartbeatMinutes,
    });
    return { enabled: true as const, partners, jobs };
  });
}
