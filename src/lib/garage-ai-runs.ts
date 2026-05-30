import { getDb } from "@/db";
import { aiAgentRuns } from "@/db/schema";
import type {
  AiAgentIntent,
  AiAgentHandoff,
  AiApprovalStatus,
  AiDataAccessLevel,
  AiProviderProfile,
  AiRiskLevel,
  AiSubAgentId,
  AiSupervisorDecision,
  AiTokenUsage,
} from "@/lib/garage-api-types";
import type { Role } from "@/lib/garage-data";

type RecordAiAgentRunInput = {
  prompt: string;
  intent: AiAgentIntent;
  profile: AiProviderProfile;
  dataAccessLevel: AiDataAccessLevel;
  provider?: string | null;
  model?: string | null;
  role: Role;
  status: string;
  fallbackUsed?: boolean;
  latencyMs?: number | null;
  tokenUsage?: AiTokenUsage | null;
  supervisorDecision?: AiSupervisorDecision | null;
  agentsUsed?: AiSubAgentId[];
  handoffs?: AiAgentHandoff[];
  riskLevel?: AiRiskLevel;
  approvalStatus?: AiApprovalStatus;
  error?: string | null;
};

export async function recordAiAgentRun(input: RecordAiAgentRunInput) {
  const [row] = await getDb().insert(aiAgentRuns).values({
    prompt: input.prompt,
    intent: input.intent,
    profile: input.profile,
    dataAccessLevel: input.dataAccessLevel,
    provider: input.provider ?? null,
    model: input.model ?? null,
    role: input.role,
    status: input.status,
    fallbackUsed: input.fallbackUsed ?? false,
    latencyMs: input.latencyMs ?? null,
    tokenUsage: input.tokenUsage ?? null,
    supervisorDecision: input.supervisorDecision ?? null,
    agentsUsed: input.agentsUsed ?? [],
    handoffs: input.handoffs ?? [],
    riskLevel: input.riskLevel ?? "low",
    approvalStatus: input.approvalStatus ?? "not_required",
    error: input.error ?? null,
  }).returning({ id: aiAgentRuns.id });

  return row;
}
