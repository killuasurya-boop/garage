import { importPrdPartnerCatalog } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";

// Impor katalog awal PRD 05 (Es Krim Pokat Au + Dimsum) sebagai mitra DRAFT & produk NONAKTIF. Owner; idempoten.
export async function POST() {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  return partnerRoute(() => importPrdPartnerCatalog(session.data), 201);
}
