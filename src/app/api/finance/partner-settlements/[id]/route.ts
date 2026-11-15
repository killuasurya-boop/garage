import { getPartnerSettlement } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  // Keputusan Owner 15 Nov 2026: Kasir boleh melihat HPP & profit Garage (sama dengan isi PDF mitra).
  return partnerRoute(() => getPartnerSettlement(id, { outletId: session.data.profile.outlet.id }));
}
