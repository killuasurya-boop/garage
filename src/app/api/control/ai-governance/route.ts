import { fail, ok } from "@/lib/api-response";
import { AiGovernanceError, getAiGovernance } from "@/lib/ai-governance-server";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** AI Governance: mode AYA, batas risiko tool, operasi & efektivitas kasus. Owner saja, baca-saja. */
export async function GET() {
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  try {
    return ok(await getAiGovernance(session.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AiGovernanceError) return fail(error.status, error.code, error.message);
    throw error;
  }
}
