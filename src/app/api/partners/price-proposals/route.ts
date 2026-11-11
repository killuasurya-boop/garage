import { listPartnerPriceProposals } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);

// Pengajuan harga mitra di outlet staf (Owner/Manajer — berisi HPP & margin, bukan untuk Kasir). ?status=&partnerId=
export async function GET(request: Request) {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const partnerId = url.searchParams.get("partnerId");
  return partnerRoute(() =>
    listPartnerPriceProposals({
      outletId: session.data.profile.outlet.id,
      partnerId: partnerId && /^[0-9a-f-]{36}$/i.test(partnerId) ? partnerId : undefined,
      status: status && STATUSES.has(status) ? status : undefined,
      withImpact: true,
    }),
  );
}
