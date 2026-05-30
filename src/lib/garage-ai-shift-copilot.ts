import { buildSupervisorDecision, recordAiAgentEvents } from "@/lib/garage-ai-agents";
import {
  createSystemAutopilotDrafts,
  type SystemAutopilotDraftInput,
} from "@/lib/garage-ai-alerts";
import { recordAiAgentRun } from "@/lib/garage-ai-runs";
import { buildStaffSupervisionDrafts } from "@/lib/garage-ai-staff-supervision";
import type { Role } from "@/lib/garage-data";
import { isWithinAutopilotHours } from "@/lib/garage-ai-autopilot-policy";
import {
  createAuditLog,
  getAppSettings,
} from "@/lib/garage-service";

const SHIFT_COPILOT_PROMPT =
  "Staff Supervision Copilot: pantau kesalahan operasional karyawan, ingatkan perbaikan, dan eskalasi ke supervisor bila perlu.";

export async function buildShiftCopilotDrafts(): Promise<SystemAutopilotDraftInput[]> {
  return buildStaffSupervisionDrafts();
}

export async function runShiftCopilotJob(
  actor = "GARAGE AI Staff Supervision",
  outletId: string | null = null,
) {
  const startedAt = Date.now();
  const settings = await getAppSettings(outletId);

  if (!isWithinAutopilotHours(settings)) {
    return {
      runId: null,
      signalCount: 0,
      created: 0,
      skipped: 0,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      skippedReason: "outside_autopilot_hours",
      autopilotHours: {
        start: settings.aiAutopilotStartHour,
        end: settings.aiAutopilotEndHour,
      },
    };
  }

  const drafts = await buildShiftCopilotDrafts();
  const supervisorDecision = buildSupervisorDecision({
    intent: "shift_copilot",
    dataAccessLevel: "operational",
    role: "Owner / CEO" as Role,
    message: SHIFT_COPILOT_PROMPT,
    actionDrafts: [],
  });

  const run = await recordAiAgentRun({
    prompt: SHIFT_COPILOT_PROMPT,
    intent: "shift_copilot",
    profile: "manager",
    dataAccessLevel: "operational",
    provider: "system",
    model: "staff_supervision_rules",
    role: "Owner / CEO",
    status: "completed",
    fallbackUsed: false,
    latencyMs: Date.now() - startedAt,
    tokenUsage: null,
    supervisorDecision,
    agentsUsed: supervisorDecision.agentsUsed,
    handoffs: supervisorDecision.handoffs,
    riskLevel: supervisorDecision.riskLevel,
    approvalStatus: supervisorDecision.approvalStatus,
  });

  void recordAiAgentEvents(run.id, supervisorDecision, {
    source: "staff_supervision_job",
    actor,
    signalCount: drafts.length,
  }).catch(() => undefined);

  const persisted = await createSystemAutopilotDrafts(
    drafts.map((draft) => ({
      ...draft,
      source: draft.source ?? "staff_supervision_job",
    })),
    run.id,
    settings,
  );

  const whatsappPrepared = persisted.records.reduce((sum, record) => {
    const targets = record.payload?.whatsappTargets;
    return sum + (Array.isArray(targets) ? targets.length : 0);
  }, 0);

  if (whatsappPrepared > 0) {
    void createAuditLog({
      actor,
      action: "GARAGE AI WhatsApp alert links prepared",
      object: "staff_supervision",
      device: "system-autopilot",
      status: "ready",
      metadata: {
        runId: run.id,
        whatsappPrepared,
        created: persisted.created,
      },
    }).catch(() => undefined);
  }

  return {
    runId: run.id,
    signalCount: drafts.length,
    created: persisted.created,
    skipped: persisted.skipped,
    whatsappPrepared,
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
  };
}
