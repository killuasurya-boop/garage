import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import {
  actionRecordToAiDraft,
  buildSupervisorDecision,
  createActionDraftRecords,
  recordAiAgentEvents,
} from "@/lib/garage-ai-agents";
import {
  GarageAiProviderError,
  runGarageAiAgent,
} from "@/lib/garage-ai-providers";
import {
  buildGarageAiContext,
  buildGarageOwnerCeoContext,
  type GarageAiContextResult,
} from "@/lib/garage-ai-context";
import {
  createOwnerChatHistory,
  getCompactOwnerChatHistory,
} from "@/lib/garage-owner-chat-history";
import { recordAiAgentRun } from "@/lib/garage-ai-runs";
import { createAuditLog, getAppSettings } from "@/lib/garage-service";
import { roles } from "@/lib/garage-data";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

const ownerChatContextSchema = z.object({
  planMode: z.boolean().optional(),
  profile: z.enum(["auto", "fast", "manager", "finance", "deep"]).optional(),
  tool: z
    .enum([
      "none",
      "pos_agent",
      "inventory_agent",
      "kitchen_agent",
      "finance_guard_agent",
      "approval_agent",
      "sop_knowledge_agent",
      "report_builder",
      "ssh_codex_bridge",
    ])
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(1200),
      }),
    )
    .max(10)
    .optional(),
  historyId: z.string().uuid().optional(),
  conversationId: z.string().max(120).optional(),
});

const posAgentSchema = z.object({
  mode: z.enum(["operational", "owner_free_chat"]).optional(),
  message: z.string().min(2).max(20000),
  orderType: z.enum(["dine-in", "takeaway", "delivery"]),
  cart: z
    .array(
      z.object({
        itemId: z.string().min(1),
        variantId: z.string().min(1),
        qty: z.number().int().positive().max(99),
      }),
    )
    .max(80),
  ownerChatContext: ownerChatContextSchema.optional(),
});

export async function POST(request: Request) {
  const session = await requireGarageSession(roles);
  if (session.response) {
    return session.response;
  }

  // Wire: aiAssistantEnabled & aiAutonomyMode dari /control/settings → AI Assistant
  const aiPolicy = await getAppSettings(session.data.profile.outlet.id);
  if (!aiPolicy.aiAssistantEnabled) {
    return fail(
      503,
      "AI_DISABLED",
      "AI Assistant dinonaktifkan oleh admin. Aktifkan di /control/settings → AI Assistant.",
    );
  }
  if (aiPolicy.aiAutonomyMode === "off") {
    return fail(
      503,
      "AI_READ_ONLY",
      "AI Assistant lagi di mode read-only (autonomy=off). Ubah di /control/settings.",
    );
  }

  const body = await readJson(request, posAgentSchema);
  if (body.error) {
    return body.error;
  }

  const startedAt = Date.now();
  const aiMode = body.data.mode ?? "operational";
  const isOwnerFreeChat = aiMode === "owner_free_chat";

  if (isOwnerFreeChat && session.data.profile.role !== "Owner / CEO") {
    return fail(403, "FORBIDDEN", "Chat bebas hanya tersedia untuk Owner / CEO.");
  }

  const compactOwnerHistory = isOwnerFreeChat
    ? await getCompactOwnerChatHistory({
        ownerId: session.data.user.id,
        selectedHistoryId: body.data.ownerChatContext?.historyId,
      })
    : undefined;
  const ownerChatContext = isOwnerFreeChat
    ? {
        ...body.data.ownerChatContext,
        history: compactOwnerHistory,
      }
    : body.data.ownerChatContext;

  const contextResult: GarageAiContextResult = isOwnerFreeChat
    ? await buildGarageOwnerCeoContext({
        message: body.data.message,
        orderType: body.data.orderType,
        cart: body.data.cart,
        session: session.data,
        ownerChatContext,
      })
    : await buildGarageAiContext({
        message: body.data.message,
        orderType: body.data.orderType,
        cart: body.data.cart,
        session: session.data,
      });
  const businessFreshness =
    contextResult.context.businessFreshness &&
    typeof contextResult.context.businessFreshness === "object"
      ? contextResult.context.businessFreshness
      : undefined;
  const initialSupervisorDecision = buildSupervisorDecision({
    intent: contextResult.intent,
    dataAccessLevel: contextResult.dataAccessLevel,
    role: session.data.profile.role,
    message: contextResult.decisionMessage,
  });
  contextResult.context.supervisor = initialSupervisorDecision;

  if (contextResult.deterministicResponse) {
    const deterministic = {
      ...contextResult.deterministicResponse,
      mode: aiMode,
      latencyMs: Date.now() - startedAt,
      agentsUsed: initialSupervisorDecision.agentsUsed,
      handoffs: initialSupervisorDecision.handoffs,
      agentPlan: initialSupervisorDecision.agentPlan,
      riskLevel: initialSupervisorDecision.riskLevel,
      approvalRequired: initialSupervisorDecision.approvalRequired,
      approvalStatus: initialSupervisorDecision.approvalStatus,
      businessFreshness,
    };

    const run = await recordAiAgentRun({
      prompt: body.data.message,
      intent: contextResult.intent,
      profile: contextResult.profile,
      dataAccessLevel: contextResult.dataAccessLevel,
      provider: "system",
      model: "deterministic",
      role: session.data.profile.role,
      status: "deterministic",
      fallbackUsed: false,
      latencyMs: deterministic.latencyMs,
      tokenUsage: null,
      supervisorDecision: initialSupervisorDecision,
      agentsUsed: initialSupervisorDecision.agentsUsed,
      handoffs: initialSupervisorDecision.handoffs,
      riskLevel: initialSupervisorDecision.riskLevel,
      approvalStatus: initialSupervisorDecision.approvalStatus,
    });
    void recordAiAgentEvents(run.id, initialSupervisorDecision, {
      source: "deterministic",
    }).catch(() => undefined);
    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "GARAGE AI assist",
      object: deterministic.intent,
      device: session.data.profile.deviceLabel,
      status: deterministic.requiresApproval ? "approval_required" : "recorded",
      metadata: {
        runId: run.id,
        mode: aiMode,
        urgency: deterministic.urgency,
        confidence: deterministic.confidence,
        intent: contextResult.intent,
        profile: contextResult.profile,
        dataAccessLevel: contextResult.dataAccessLevel,
        agentsUsed: initialSupervisorDecision.agentsUsed,
        riskLevel: initialSupervisorDecision.riskLevel,
        approvalStatus: initialSupervisorDecision.approvalStatus,
        contextModules: contextResult.contextModules,
        snapshotUsed: contextResult.snapshotUsed,
        cartLines: body.data.cart.length,
        provider: deterministic.providerUsed,
        model: deterministic.modelUsed,
        fallbackUsed: deterministic.fallbackUsed,
        latencyMs: deterministic.latencyMs,
        tokenUsage: deterministic.tokenUsage,
        actionDraftCount: deterministic.actionDrafts?.length ?? 0,
        source: "deterministic",
      },
    }).catch(() => undefined);
    const ownerHistory = isOwnerFreeChat
      ? await createOwnerChatHistory({
          ownerId: session.data.user.id,
          runId: run.id,
          prompt: body.data.message,
          response: deterministic.response,
          provider: deterministic.providerUsed,
          model: deterministic.modelUsed,
          profile: contextResult.profile,
          tool: body.data.ownerChatContext?.tool ?? null,
          dataAccessLevel: contextResult.dataAccessLevel,
          latencyMs: deterministic.latencyMs,
          tokenUsage: deterministic.tokenUsage,
          metadata: {
            mode: aiMode,
            intent: contextResult.intent,
            source: "deterministic",
          },
        })
      : null;

    return ok({
      ...deterministic,
      runId: run.id,
      ownerChatHistoryId: ownerHistory?.id,
    });
  }

  try {
    const parsedResult = await runGarageAiAgent({
      context: contextResult.context,
      intent: contextResult.intent,
      profile: contextResult.profile,
      dataAccessLevel: contextResult.dataAccessLevel,
    });
    const supervisorDecision = buildSupervisorDecision({
      intent: contextResult.intent,
      dataAccessLevel: contextResult.dataAccessLevel,
      role: session.data.profile.role,
      message: contextResult.decisionMessage,
      actionDrafts: parsedResult.actionDrafts ?? [],
    });
    const parsed = {
      ...parsedResult,
      mode: aiMode,
      requiresApproval:
        parsedResult.requiresApproval || supervisorDecision.approvalRequired,
      requiresHumanApproval:
        parsedResult.requiresHumanApproval || supervisorDecision.approvalRequired,
      agentsUsed: supervisorDecision.agentsUsed,
      handoffs: supervisorDecision.handoffs,
      agentPlan: supervisorDecision.agentPlan,
      riskLevel: supervisorDecision.riskLevel,
      approvalRequired: supervisorDecision.approvalRequired,
      approvalStatus: supervisorDecision.approvalStatus,
      businessFreshness,
    };
    const run = await recordAiAgentRun({
      prompt: body.data.message,
      intent: contextResult.intent,
      profile: contextResult.profile,
      dataAccessLevel: contextResult.dataAccessLevel,
      provider: parsed.providerUsed ?? null,
      model: parsed.modelUsed ?? null,
      role: session.data.profile.role,
      status: "completed",
      fallbackUsed: parsed.fallbackUsed ?? false,
      latencyMs: parsed.latencyMs ?? Date.now() - startedAt,
      tokenUsage: parsed.tokenUsage ?? null,
      supervisorDecision,
      agentsUsed: supervisorDecision.agentsUsed,
      handoffs: supervisorDecision.handoffs,
      riskLevel: supervisorDecision.riskLevel,
      approvalStatus: supervisorDecision.approvalStatus,
    });
    void recordAiAgentEvents(run.id, supervisorDecision, {
      source: "provider",
      provider: parsed.providerUsed,
      model: parsed.modelUsed,
    }).catch(() => undefined);

    const draftRecords = await createActionDraftRecords({
      runId: run.id,
      drafts: parsed.actionDrafts ?? [],
      session: session.data,
    });
    const responsePayload = {
      ...parsed,
      runId: run.id,
      actionDrafts: draftRecords.length
        ? draftRecords.map(actionRecordToAiDraft)
        : parsed.actionDrafts,
    };
    const ownerHistory = isOwnerFreeChat
      ? await createOwnerChatHistory({
          ownerId: session.data.user.id,
          runId: run.id,
          prompt: body.data.message,
          response: responsePayload.response,
          provider: responsePayload.providerUsed ?? null,
          model: responsePayload.modelUsed ?? null,
          profile: contextResult.profile,
          tool: body.data.ownerChatContext?.tool ?? null,
          dataAccessLevel: contextResult.dataAccessLevel,
          latencyMs: responsePayload.latencyMs ?? null,
          tokenUsage: responsePayload.tokenUsage ?? null,
          metadata: {
            mode: aiMode,
            intent: contextResult.intent,
            fallbackUsed: responsePayload.fallbackUsed ?? false,
          },
        })
      : null;
    const responseWithHistory = {
      ...responsePayload,
      ownerChatHistoryId: ownerHistory?.id,
    };

    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "GARAGE AI assist",
      object: responseWithHistory.intent,
      device: session.data.profile.deviceLabel,
      status: responseWithHistory.requiresApproval ? "approval_required" : "recorded",
      metadata: {
        runId: run.id,
        mode: aiMode,
        ownerChatHistoryId: ownerHistory?.id ?? null,
        urgency: responseWithHistory.urgency,
        confidence: responseWithHistory.confidence,
        intent: contextResult.intent,
        profile: contextResult.profile,
        dataAccessLevel: contextResult.dataAccessLevel,
        agentsUsed: supervisorDecision.agentsUsed,
        riskLevel: supervisorDecision.riskLevel,
        approvalStatus: supervisorDecision.approvalStatus,
        contextModules: contextResult.contextModules,
        snapshotUsed: contextResult.snapshotUsed,
        cartLines: body.data.cart.length,
        provider: responseWithHistory.providerUsed,
        model: responseWithHistory.modelUsed,
        fallbackUsed: responseWithHistory.fallbackUsed,
        latencyMs: responseWithHistory.latencyMs,
        tokenUsage: responseWithHistory.tokenUsage,
        actionDraftCount: draftRecords.length,
      },
    }).catch(() => undefined);

    return ok(responseWithHistory);
  } catch (error) {
    if (error instanceof GarageAiProviderError) {
      const run = await recordAiAgentRun({
        prompt: body.data.message,
        intent: contextResult.intent,
        profile: contextResult.profile,
        dataAccessLevel: contextResult.dataAccessLevel,
        provider: error.provider ?? null,
        model: null,
        role: session.data.profile.role,
        status: error.providerStatus === "limited" ? "limited" : "error",
        fallbackUsed: false,
        latencyMs: error.latencyMs ?? Date.now() - startedAt,
        tokenUsage: null,
        supervisorDecision: initialSupervisorDecision,
        agentsUsed: initialSupervisorDecision.agentsUsed,
        handoffs: initialSupervisorDecision.handoffs,
        riskLevel: initialSupervisorDecision.riskLevel,
        approvalStatus: initialSupervisorDecision.approvalStatus,
        error: error.message,
      });
      void recordAiAgentEvents(run.id, initialSupervisorDecision, {
        source: "provider_error",
        provider: error.provider,
        error: error.message,
      }).catch(() => undefined);
      void createAuditLog({
        actor: session.data.user.name ?? session.data.user.email,
        action: "GARAGE AI assist failed",
        object: contextResult.intent,
        device: session.data.profile.deviceLabel,
        status: error.providerStatus === "limited" ? "limited" : "error",
        metadata: {
          runId: run.id,
          mode: aiMode,
          intent: contextResult.intent,
          profile: contextResult.profile,
          dataAccessLevel: contextResult.dataAccessLevel,
          agentsUsed: initialSupervisorDecision.agentsUsed,
          riskLevel: initialSupervisorDecision.riskLevel,
          approvalStatus: initialSupervisorDecision.approvalStatus,
          contextModules: contextResult.contextModules,
          snapshotUsed: contextResult.snapshotUsed,
          cartLines: body.data.cart.length,
          provider: error.provider,
          providerStatus: error.providerStatus,
          fallbackUsed: false,
          latencyMs: error.latencyMs ?? Date.now() - startedAt,
          error: error.message,
          source: "provider_error",
        },
      }).catch(() => undefined);

      return fail(error.status, error.code, error.message);
    }

    const fallbackErrorMessage =
      error instanceof Error ? error.message : "Unknown AI error";
    const run = await recordAiAgentRun({
      prompt: body.data.message,
      intent: contextResult.intent,
      profile: contextResult.profile,
      dataAccessLevel: contextResult.dataAccessLevel,
      provider: null,
      model: null,
      role: session.data.profile.role,
      status: "error",
      fallbackUsed: false,
      latencyMs: Date.now() - startedAt,
      tokenUsage: null,
      supervisorDecision: initialSupervisorDecision,
      agentsUsed: initialSupervisorDecision.agentsUsed,
      handoffs: initialSupervisorDecision.handoffs,
      riskLevel: initialSupervisorDecision.riskLevel,
      approvalStatus: initialSupervisorDecision.approvalStatus,
      error: fallbackErrorMessage,
    });
    void recordAiAgentEvents(run.id, initialSupervisorDecision, {
      source: "unknown_error",
      error: fallbackErrorMessage,
    }).catch(() => undefined);
    void createAuditLog({
      actor: session.data.user.name ?? session.data.user.email,
      action: "GARAGE AI assist failed",
      object: contextResult.intent,
      device: session.data.profile.deviceLabel,
      status: "error",
      metadata: {
        runId: run.id,
        mode: aiMode,
        intent: contextResult.intent,
        profile: contextResult.profile,
        dataAccessLevel: contextResult.dataAccessLevel,
        agentsUsed: initialSupervisorDecision.agentsUsed,
        riskLevel: initialSupervisorDecision.riskLevel,
        approvalStatus: initialSupervisorDecision.approvalStatus,
        contextModules: contextResult.contextModules,
        snapshotUsed: contextResult.snapshotUsed,
        cartLines: body.data.cart.length,
        provider: null,
        fallbackUsed: false,
        latencyMs: Date.now() - startedAt,
        error: fallbackErrorMessage,
        source: "unknown_error",
      },
    }).catch(() => undefined);

    return fail(
      502,
      "AI_POS_AGENT_FAILED",
      fallbackErrorMessage === "Unknown AI error"
        ? "GARAGE AI gagal memproses request."
        : fallbackErrorMessage,
    );
  }
}
