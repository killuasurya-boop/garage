import { ok } from "@/lib/api-response";
import { AGENT_SCOPE_LABEL } from "@/lib/agent-api-key";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent/v1/me — identitas key agent (scope, outlet, bertindak atas nama). */
export async function GET() {
  const session = await requireGarageSession();
  if (session.response) return session.response;
  const agent = session.data.profile.agentKey ?? null;
  return ok({
    agent: agent ? { ...agent, scopeLabel: AGENT_SCOPE_LABEL[agent.scope] } : null,
    actingAs: session.data.user.name,
    role: session.data.profile.role,
    outlet: session.data.profile.outlet,
    endpoints: { tools: "/api/agent/v1/tools", mcp: "/api/mcp", openapi: "/api/agent/v1/openapi.json" },
  });
}
