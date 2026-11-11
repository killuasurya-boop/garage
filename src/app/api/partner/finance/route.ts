import { requirePartnerSession } from "@/lib/partner-auth";
import { partnerFinanceSummary } from "@/lib/partner-hub-service";
import { partnerRoute, periodFromQuery } from "@/lib/partner-hub-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keuangan milik mitra yang login saja (penjualan, HPP/hak mitra, profit Garage sesuai DEC-09, settlement).
export async function GET(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { from, to } = periodFromQuery(new URL(request.url));
  return partnerRoute(() => partnerFinanceSummary(session.data.partner.id, session.data.partner.outletId, from, to));
}
