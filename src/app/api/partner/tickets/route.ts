import { requirePartnerSession } from "@/lib/partner-auth";
import { listTicketsForPartner } from "@/lib/partner-hub-service";
import { partnerRoute, periodFromQuery } from "@/lib/partner-hub-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requirePartnerSession(request);
  if (session.response) return session.response;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "history" ? "history" : "active";
  // Riwayat per tanggal (from/to, WIB). Tanpa from = 50 terakhir.
  const period = scope === "history" && url.searchParams.get("from") ? periodFromQuery(url) : null;
  return partnerRoute(() =>
    listTicketsForPartner(session.data.partner.id, scope, { from: period?.from, to: period?.to, limit: scope === "history" ? 200 : 100 }),
  );
}
