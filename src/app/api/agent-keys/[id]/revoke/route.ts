import { fail, ok } from "@/lib/api-response";
import { revokeAgentKey } from "@/lib/agent-api-key";
import { requireHumanSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/** POST /api/agent-keys/{id}/revoke — cabut key (langsung tidak berlaku). */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireHumanSession(["Owner"]);
  if (session.response) return session.response;
  const { id } = await ctx.params;
  try {
    return ok(await revokeAgentKey(id, session.data));
  } catch (error) {
    return fail(400, "AGENT_KEY_REVOKE_FAILED", error instanceof Error ? error.message : "Gagal mencabut API key.");
  }
}
