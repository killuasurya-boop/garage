import { ok } from "@/lib/api-response";
import { getIntelligenceSnapshot } from "@/lib/intelligence-network-server";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Living Intelligence Dashboard: sinyal nyata per domain (koneksi ≠ kesehatan ≠ aktivitas). Owner saja. */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  return ok(await getIntelligenceSnapshot(session.data), { headers: { "Cache-Control": "no-store" } });
}
