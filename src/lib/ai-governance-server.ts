// AI Governance (Batch 7) — loader DB, Owner saja (bukan agent key). Hanya membaca.
import { and, desc, eq, gte, ilike, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { aiProblemCaseEvents, aiProblemCases, approvals, mcpOperations } from "@/db/schema";
import { listAgentTools } from "@/lib/agent-tools";
import {
  AI_MODE_LABEL,
  FIXED_GUARDRAILS,
  R4_FORBIDDEN,
  aiModeOf,
  summarizeCases,
  summarizeOperations,
  summarizeTools,
  type GovernanceTool,
} from "@/lib/ai-governance";
import { loadSettingsByKeys } from "@/lib/garage-settings-service";
import type { GarageSession } from "@/lib/server-auth";

export class AiGovernanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const WINDOW_DAYS = 30;

export async function getAiGovernance(session: GarageSession) {
  if (session.profile.role !== "Owner") throw new AiGovernanceError("FORBIDDEN", "Panel AI Governance hanya untuk Owner.", 403);
  // AI tidak boleh membaca/mengatur tata kelolanya sendiri lewat API key.
  if (session.profile.agentKey) throw new AiGovernanceError("FORBIDDEN", "Panel AI Governance hanya dari layar Owner.", 403);

  const db = getDb();
  const now = Date.now();
  const since = new Date(now - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const settings = await loadSettingsByKeys(["mcpChatgptPaused", "mcpChatgptWriteEnabled"]);
  const paused = settings["mcpChatgptPaused"] === true;
  const writeEnabled = settings["mcpChatgptWriteEnabled"] !== false;
  const mode = aiModeOf({ paused, writeEnabled });

  // Semua tool terdaftar (termasuk confirmOnly) — tingkat risiko berasal dari registry kode, bukan setting.
  const tools: GovernanceTool[] = listAgentTools(undefined, { includeConfirmOnly: true }).map((tool) => ({
    name: tool.name,
    title: tool.title,
    domain: tool.domain,
    risk: tool.risk,
    write: tool.write,
  }));

  const operations = await db
    .select({
      id: mcpOperations.id,
      tool: mcpOperations.tool,
      status: mcpOperations.status,
      risk: mcpOperations.risk,
      source: mcpOperations.source,
      expiresAt: mcpOperations.expiresAt,
      createdAt: mcpOperations.createdAt,
      executedAt: mcpOperations.executedAt,
    })
    .from(mcpOperations)
    .where(and(eq(mcpOperations.userId, session.user.id), gte(mcpOperations.createdAt, since)))
    .orderBy(desc(mcpOperations.createdAt));

  const cases = await db
    .select({ id: aiProblemCases.id, caseNo: aiProblemCases.caseNo, question: aiProblemCases.question, status: aiProblemCases.status, createdAt: aiProblemCases.createdAt })
    .from(aiProblemCases)
    .where(eq(aiProblemCases.ownerUserId, session.user.id))
    .orderBy(desc(aiProblemCases.createdAt))
    .limit(200);
  const verifications = cases.length
    ? await db
        .select({ caseId: aiProblemCaseEvents.caseId, payload: aiProblemCaseEvents.payload, createdAt: aiProblemCaseEvents.createdAt })
        .from(aiProblemCaseEvents)
        .where(and(eq(aiProblemCaseEvents.kind, "verification"), inArray(aiProblemCaseEvents.caseId, cases.map((c) => c.id))))
        .orderBy(desc(aiProblemCaseEvents.createdAt))
    : [];
  const latestVerdict = new Map<string, string>();
  for (const event of verifications) {
    if (!latestVerdict.has(event.caseId)) latestVerdict.set(event.caseId, String((event.payload as { verdict?: unknown }).verdict ?? "unknown"));
  }

  const decided = await db
    .select({ id: approvals.id, decidedVia: approvals.decidedVia, executionStatus: approvals.executionStatus, status: approvals.status })
    .from(approvals)
    .where(gte(approvals.createdAt, since));
  const pendingDocs = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.status, "pending"), ilike(approvals.id, "APP-DOC-%")));

  return {
    generatedAt: new Date(now).toISOString(),
    windowDays: WINDOW_DAYS,
    mode: { value: mode, ...AI_MODE_LABEL[mode], paused, writeEnabled },
    guardrails: FIXED_GUARDRAILS,
    forbidden: R4_FORBIDDEN,
    tools: summarizeTools(tools),
    operations: {
      ...summarizeOperations(operations, now),
      recent: operations.slice(0, 8).map((op) => ({
        id: op.id,
        tool: op.tool,
        risk: op.risk,
        source: op.source,
        status: op.status === "pending" && op.expiresAt.getTime() <= now ? "expired" : op.status,
        createdAt: op.createdAt.toISOString(),
      })),
    },
    cases: {
      ...summarizeCases(cases.map((c) => ({ id: c.id, status: c.status, latestVerdict: latestVerdict.get(c.id) ?? null }))),
      recent: cases.slice(0, 6).map((c) => ({
        id: c.id,
        caseNo: c.caseNo,
        question: c.question.slice(0, 140),
        status: c.status,
        verdict: latestVerdict.get(c.id) ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    },
    approvals: {
      total: decided.length,
      auto: decided.filter((row) => row.decidedVia === "auto").length,
      executionFailed: decided.filter((row) => row.executionStatus === "failed").length,
      executionRunning: decided.filter((row) => row.executionStatus === "running").length,
      pendingDocuments: pendingDocs.length,
    },
  };
}

export type AiGovernanceOverview = Awaited<ReturnType<typeof getAiGovernance>>;
