import { ok } from "@/lib/api-response";
import { listAgentTools } from "@/lib/agent-tools";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent/v1/tools — tool yang boleh dipakai key ini (+ JSON Schema argumen). */
export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  return ok({ tools: listAgentTools(session.data) });
}
