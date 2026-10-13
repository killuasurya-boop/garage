// Helper HTTP bersama endpoint agent (REST v1 & MCP).
import { headers } from "next/headers";

import { fail, ok } from "@/lib/api-response";
import { agentInternalOrigin, AgentToolError, runAgentTool } from "@/lib/agent-tools";
import type { GarageSession } from "@/lib/server-auth";

export async function agentToolContext() {
  const h = await headers();
  const key = h.get("x-garage-agent-key");
  return {
    authorization: h.get("authorization") ?? (key ? `Bearer ${key}` : ""),
    internalOrigin: agentInternalOrigin(),
  };
}

/** Jalankan tool & bungkus hasil { data } / { error }. */
export async function runToolResponse(session: GarageSession, name: string, args: unknown) {
  try {
    const result = await runAgentTool(session, name, args, await agentToolContext());
    return ok(result);
  } catch (error) {
    if (error instanceof AgentToolError) return fail(error.status, error.code, error.message);
    console.error("[agent tool]", name, error);
    return fail(400, "TOOL_FAILED", error instanceof Error ? error.message : "Tool gagal dijalankan.");
  }
}
