import { getAppSettings } from "@/lib/garage-service";
import { requirePartnerSession } from "@/lib/partner-auth";
import { partnerPortalOverview } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { clockLabel, isWithinPartnerServiceHours, partnerServiceHoursText } from "@/lib/partner-hub-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ringkasan Portal Mitra — hanya data mitra yang sedang login (partner_id dari sesi).
export async function GET(request: Request) {
  const session = await requirePartnerSession(request, { allowPinChangePending: true });
  if (session.response) return session.response;
  return partnerRoute(async () => {
    const [overview, settings] = await Promise.all([partnerPortalOverview(session.data), getAppSettings(session.data.partner.outletId)]);
    // Batas "belum diterima" sama dengan yang dilihat kasir, supaya mitra & kasir melihat merah di waktu yang sama.
    const hours = { open: settings.partnerServiceOpen, close: settings.partnerServiceClose };
    return {
      ...overview,
      slaWarnMinutes: settings.partnerSlaAcceptWarnMinutes,
      // Jam layanan produk mitra (Owner 16 Nov 2026): di luar jam ini pesanan baru tidak masuk.
      serviceHours: partnerServiceHoursText(hours),
      serviceOpenNow: isWithinPartnerServiceHours(hours),
      serviceOpensAt: clockLabel(hours.open) || null,
    };
  });
}
