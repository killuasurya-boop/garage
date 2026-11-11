import { getAppSettings } from "@/lib/garage-service";
import { listPartnerOrdersForOutlet } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Monitor pesanan mitra untuk kasir/waiter/Owner (tanpa HPP/profit). Polling ini juga memicu eskalasi SLA.
export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
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
