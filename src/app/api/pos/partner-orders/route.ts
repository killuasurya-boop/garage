import { listPartnerOrdersForOutlet } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Monitor pesanan mitra untuk kasir/waiter/Owner (tanpa HPP/profit).
export async function GET(request: Request) {
  const session = await requirePermission("pos:use");
  if (session.response) return session.response;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "today" ? "today" : "active";
  const partnerId = url.searchParams.get("partnerId") || undefined;
  return partnerRoute(() => listPartnerOrdersForOutlet(session.data.profile.outlet.id, { scope, partnerId }));
}
