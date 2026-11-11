import { requirePartnerSession } from "@/lib/partner-auth";
import { cancelPartnerPriceProposal } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";

export const runtime = "nodejs";

// Mitra membatalkan pengajuan harganya sendiri selama masih menunggu Owner.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const { id } = await context.params;
  return partnerRoute(() => cancelPartnerPriceProposal(session.data, id));
}
