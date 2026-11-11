import { getPartnerSettlement } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const { id } = await context.params;
  return partnerRoute(async () => {
    const detail = await getPartnerSettlement(id, { outletId: session.data.profile.outlet.id });
    if (session.data.profile.role !== "Kasir") return detail;
    // Kasir: tanpa HPP per baris & profit Garage.
    return {
      ...detail,
      settlement: { ...detail.settlement, totalCost: null, garageProfit: null },
      lines: detail.lines.map((line) => ({ ...line, unitCost: null, cost: null })),
    };
  });
}
