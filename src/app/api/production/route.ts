import { getProductionBoard } from "@/lib/garage-production";
import { okWithEtag } from "@/lib/http-etag";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Papan Production Hub: tiket aktif Bar + Dapur, batch berjalan, saran Smart
// Batch, dan beban per station. Di-poll workspace produksi.
export async function GET(request: Request) {
  const session = await requirePermission("kitchen:read");
  if (session.response) {
    return session.response;
  }

  return okWithEtag(request, await getProductionBoard(session.data));
}
