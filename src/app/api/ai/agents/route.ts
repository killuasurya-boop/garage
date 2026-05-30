import { z } from "zod";

import { ok, readJson } from "@/lib/api-response";
import {
  aiAutonomyModes,
  aiRiskLevels,
  listAiAgents,
  saveAiAgentConfigs,
} from "@/lib/garage-ai-agents";
import { createAuditLog } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const agentConfigSchema = z.object({
  agents: z
    .array(
      z.object({
        agentId: z.enum([
          "supervisor",
          "pos_agent",
          "inventory_agent",
          "kitchen_agent",
          "finance_guard_agent",
          "approval_agent",
          "sop_knowledge_agent",
          "daily_brief_agent",
        ]),
        enabled: z.boolean(),
        autonomyMode: z.enum(aiAutonomyModes),
        maxRiskLevel: z.enum(aiRiskLevels),
      }),
    )
    .min(1)
    .max(12),
});

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  return ok({
    agents: await listAiAgents(),
    autonomyModes: [...aiAutonomyModes],
    riskLevels: [...aiRiskLevels],
  });
}

export async function PUT(request: Request) {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const body = await readJson(request, agentConfigSchema);
  if (body.error) {
    return body.error;
  }

  const agents = await saveAiAgentConfigs(body.data.agents);

  void createAuditLog({
    actor: session.data.user.name ?? session.data.user.email,
    action: "GARAGE AI agents updated",
    object: "ai_agent_configs",
    device: session.data.profile.deviceLabel,
    status: "recorded",
    metadata: {
      updatedAgents: body.data.agents.map((agent) => agent.agentId),
    },
  }).catch(() => undefined);

  return ok({
    agents,
    autonomyModes: [...aiAutonomyModes],
    riskLevels: [...aiRiskLevels],
  });
}
