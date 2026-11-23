import { listPartnerProductSubmissions } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner/Manajer: antrean pengajuan produk mitra (menunggu Owner + dikembalikan ke mitra). Baca saja.
export async function GET() {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  return partnerRoute(() => listPartnerProductSubmissions(session.data));
}
