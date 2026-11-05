import { fail, ok } from "@/lib/api-response";
import { DecisionCenterError, getDecisionOverview } from "@/lib/decision-center-server";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner Decision Center: KPI nyata + antrean prioritas + riwayat keputusan. */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  try {
    return ok(await getDecisionOverview(session.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DecisionCenterError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
