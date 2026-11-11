import { listPartnerApplications } from "@/lib/partner-hub-service";
import { partnerRoute } from "@/lib/partner-hub-route";
import { requireOwnerOrManager } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pendaftar calon mitra dari halaman publik /mitra (Owner/Manajer).
export async function GET() {
  const session = await requireOwnerOrManager();
  if (session.response) return session.response;
  return partnerRoute(() => listPartnerApplications(session.data));
}
