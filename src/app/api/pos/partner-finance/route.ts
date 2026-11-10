import { listPartners, partnerFinanceSummary } from "@/lib/partner-hub-service";
import { partnerRoute, periodFromQuery } from "@/lib/partner-hub-route";
import { requireCashierSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keuangan Mitra di POS (kasir, Owner, Manajer — bukan waiter/workstation). Angka dihitung ulang di server.
export async function GET(request: Request) {
  const session = await requireCashierSession();
  if (session.response) return session.response;
  const url = new URL(request.url);
  const { from, to } = periodFromQuery(url);
  const partnerId = url.searchParams.get("partnerId");
  return partnerRoute(async () => {
    const outletId = session.data.profile.outlet.id;
    const all = (await listPartners(session.data)).filter((p) => p.status === "aktif" || p.status === "dibekukan");
    const targets = partnerId ? all.filter((p) => p.id === partnerId) : all;
    const summaries = await Promise.all(
      targets.map(async (partner) => ({ partnerId: partner.id, partnerName: partner.name, partnerCode: partner.code, ...(await partnerFinanceSummary(partner.id, outletId, from, to)) })),
    );
    return { from, to, partners: summaries };
  });
}
