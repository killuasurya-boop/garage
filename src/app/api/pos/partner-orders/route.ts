import { getAppSettings } from "@/lib/garage-service";
import { listPartnerOrdersForOutlet } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireStaffSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Monitor pesanan mitra untuk semua staf (tanpa HPP/profit) — termasuk Kasir-bar/dapur & kurir yang boleh
// memproses pesanan mitra atas nama mitra (keputusan Owner 15 Nov 2026). Polling ini juga memicu eskalasi SLA.
export async function GET(request: Request) {
  const session = await requireStaffSession({ agentReadPermission: "pos:use" });
  if (session.response) return session.response;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "today" ? "today" : "active";
  const partnerId = url.searchParams.get("partnerId") || undefined;
  return partnerRoute(async () => {
    const outletId = session.data.profile.outlet.id;
    const settings = await getAppSettings(outletId);
    return listPartnerOrdersForOutlet(outletId, { scope, partnerId, escalateMinutes: settings.partnerSlaEscalateMinutes });
  });
}
