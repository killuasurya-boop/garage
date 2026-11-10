import { requirePartnerSession } from "@/lib/partner-auth";
import { listTicketsForPartner } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const scope = new URL(request.url).searchParams.get("scope") === "history" ? "history" : "active";
  return partnerRoute(() => listTicketsForPartner(session.data.partner.id, scope, { limit: scope === "history" ? 50 : 100 }));
}
