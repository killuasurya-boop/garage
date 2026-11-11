import { getAppSettings } from "@/lib/garage-service";
import { requirePartnerSession } from "@/lib/partner-auth";
import { partnerPortalOverview } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ringkasan Portal Mitra — hanya data mitra yang sedang login (partner_id dari sesi).
export async function GET(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  return partnerRoute(async () => {
    const [overview, settings] = await Promise.all([partnerPortalOverview(session.data), getAppSettings(session.data.partner.outletId)]);
    // Batas "belum diterima" sama dengan yang dilihat kasir, supaya mitra & kasir melihat merah di waktu yang sama.
    return { ...overview, slaWarnMinutes: settings.partnerSlaAcceptWarnMinutes };
  });
}
