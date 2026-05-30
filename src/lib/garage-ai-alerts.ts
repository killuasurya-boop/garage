import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { aiActionDrafts, aiAgentRuns } from "@/db/schema";
import {
  ensureAiAgentSetup,
  getActionRegistryMap,
  rowToActionDraft,
} from "@/lib/garage-ai-agents";
import {
  resolveWhatsappTargetsForRoles,
  whatsappTargetsForViewer,
  type AiWhatsappTarget,
} from "@/lib/garage-ai-autopilot-policy";
import type {
  AiApprovalStatus,
  AiOperationalAlert,
  AiOperationalAlertPriority,
  AiWhatsappAlertTarget,
} from "@/lib/garage-api-types";
import type { AppSettings } from "@/lib/garage-service";
import type { Role } from "@/lib/garage-data";

const AUTOPILOT_SOURCES = new Set([
  "shift_copilot",
  "shift_copilot_job",
  "staff_supervision_job",
]);
const ALERT_LOOKBACK_HOURS = 12;
const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000;

export type SystemAutopilotDraftInput = {
  actionType: string;
  agentId: string;
  title: string;
  detail: string;
  riskLevel?: "low" | "medium" | "high";
  priority?: AiOperationalAlertPriority;
  targetRoles: Role[];
  fingerprint: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

function parseApprovalStatus(value: string): AiApprovalStatus {
  if (value === "approved" || value === "rejected" || value === "pending") {
    return value;
  }

  return "not_required";
}

function parsePriority(value: unknown): AiOperationalAlertPriority {
  if (value === "high" || value === "medium") {
    return value;
  }

  return "low";
}

function payloadSource(payload: Record<string, unknown>) {
  const source = payload.source;
  return typeof source === "string" ? source : "";
}

function payloadFingerprint(payload: Record<string, unknown>) {
  const fingerprint = payload.fingerprint;
  return typeof fingerprint === "string" ? fingerprint : "";
}

function payloadTargetRoles(payload: Record<string, unknown>): Role[] {
  const roles = payload.targetRoles;
  if (!Array.isArray(roles)) {
    return [];
  }

  return roles.filter((role): role is Role => typeof role === "string");
}

function payloadPriority(payload: Record<string, unknown>, riskLevel: string) {
  const priority = parsePriority(payload.priority);
  if (priority !== "low") {
    return priority;
  }

  if (riskLevel === "high") {
    return "high";
  }

  if (riskLevel === "medium") {
    return "medium";
  }

  return "low";
}

function payloadAcknowledgedAt(payload: Record<string, unknown>) {
  const value = payload.acknowledgedAt;
  return typeof value === "string" ? value : null;
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseSupervisionKind(
  payload: Record<string, unknown>,
): AiOperationalAlert["supervisionKind"] {
  const value = payload.supervisionKind;
  if (value === "mistake" || value === "correction" || value === "coaching") {
    return value;
  }

  return null;
}

function parseStaffGroup(payload: Record<string, unknown>): AiOperationalAlert["staffGroup"] {
  const value = payload.staffGroup;
  if (
    value === "floor" ||
    value === "kitchen" ||
    value === "inventory" ||
    value === "control"
  ) {
    return value;
  }

  return null;
}

function parseAlertCategory(
  payload: Record<string, unknown>,
  actionType: string,
): AiOperationalAlert["category"] {
  if (
    payload.category === "staff_supervision" ||
    payload.channel === "staff_supervision" ||
    actionType === "staff_supervision"
  ) {
    return "staff_supervision";
  }

  return "operational";
}

function isAutopilotOperationalDraft(payload: Record<string, unknown>) {
  const source = payloadSource(payload);
  if (AUTOPILOT_SOURCES.has(source)) {
    return true;
  }

  const channel = payload.channel;
  return channel === "operational_alert" || channel === "staff_supervision";
}

function alertMatchesRole(alert: AiOperationalAlert, role: Role) {
  if (!alert.targetRoles.length) {
    return true;
  }

  return alert.targetRoles.includes(role);
}

function parseWhatsappTargets(payload: Record<string, unknown>): AiWhatsappAlertTarget[] {
  const raw = payload.whatsappTargets;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const phone = "phone" in entry ? String(entry.phone ?? "") : "";
      const url = "url" in entry ? String(entry.url ?? "") : "";
      const roleGroup = "roleGroup" in entry ? String(entry.roleGroup ?? "") : "";
      if (!phone || !url) {
        return null;
      }

      return { phone, url, roleGroup };
    })
    .filter((entry): entry is AiWhatsappAlertTarget => Boolean(entry));
}

function rowToOperationalAlert(
  row: typeof aiActionDrafts.$inferSelect,
  viewerRole?: Role,
): AiOperationalAlert {
  const payload = row.payload ?? {};
  const targetRoles = payloadTargetRoles(payload);
  const allWhatsappTargets = parseWhatsappTargets(payload);
  const whatsappTargets = viewerRole
    ? whatsappTargetsForViewer(allWhatsappTargets as AiWhatsappTarget[], viewerRole)
    : allWhatsappTargets;

  const category = parseAlertCategory(payload, row.actionType);

  return {
    id: row.id,
    actionType: row.actionType,
    agentId: row.agentId,
    title: row.title,
    detail: row.detail,
    priority: payloadPriority(payload, row.riskLevel),
    targetRoles,
    acknowledged: Boolean(payloadAcknowledgedAt(payload)),
    acknowledgedAt: payloadAcknowledgedAt(payload),
    createdAt: row.createdAt.toISOString(),
    runId: row.runId,
    approvalStatus: parseApprovalStatus(row.approvalStatus),
    source: payloadSource(payload) || "shift_copilot",
    fingerprint: payloadFingerprint(payload),
    whatsappTargets,
    category,
    supervisionKind: parseSupervisionKind(payload),
    staffGroup: parseStaffGroup(payload),
    fixAction: payloadString(payload, "fixAction"),
  };
}

export async function hasRecentAutopilotFingerprint(fingerprint: string) {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);

  const [row] = await getDb()
    .select({ id: aiActionDrafts.id })
    .from(aiActionDrafts)
    .where(
      and(
        gte(aiActionDrafts.createdAt, since),
        sql`${aiActionDrafts.payload}->>'fingerprint' = ${fingerprint}`,
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function createSystemAutopilotDrafts(
  drafts: SystemAutopilotDraftInput[],
  runId?: string | null,
  settings?: AppSettings | null,
) {
  await ensureAiAgentSetup();

  if (!drafts.length) {
    return { created: 0, skipped: 0, records: [] as ReturnType<typeof rowToActionDraft>[] };
  }

  const registry = await getActionRegistryMap();
  const db = getDb();
  const now = new Date();
  const records: ReturnType<typeof rowToActionDraft>[] = [];
  let created = 0;
  let skipped = 0;

  for (const draft of drafts.slice(0, 16)) {
    if (await hasRecentAutopilotFingerprint(draft.fingerprint)) {
      skipped += 1;
      continue;
    }

    const actionConfig = registry.get(draft.actionType);
    if (actionConfig && !actionConfig.enabled) {
      skipped += 1;
      continue;
    }

    const safetyLevel = actionConfig?.safetyLevel ?? "safe";
    const requiresApproval = Boolean(actionConfig?.requiresApproval);
    const approvalStatus = requiresApproval ? "pending" : "not_required";
    const priority = draft.priority ?? (draft.riskLevel === "high" ? "high" : "medium");
    const whatsappTargets = settings
      ? resolveWhatsappTargetsForRoles(settings, draft.targetRoles, {
          title: draft.title,
          detail: draft.detail,
          priority,
        })
      : [];

    const [row] = await db
      .insert(aiActionDrafts)
      .values({
        runId: runId ?? null,
        actionType: draft.actionType,
        agentId: draft.agentId,
        title: draft.title,
        detail: draft.detail,
        riskLevel: draft.riskLevel ?? "low",
        safetyLevel,
        approvalStatus,
        payload: {
          source: draft.source ?? "shift_copilot",
          channel: "operational_alert",
          fingerprint: draft.fingerprint,
          priority,
          targetRoles: draft.targetRoles,
          metadata: draft.metadata ?? {},
          whatsappTargets,
        },
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    records.push(rowToActionDraft(row));
    created += 1;
  }

  return { created, skipped, records };
}

export async function listOperationalAlertsForRole(role: Role, limit = 40) {
  await ensureAiAgentSetup();

  const since = new Date(Date.now() - ALERT_LOOKBACK_HOURS * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(aiActionDrafts)
    .where(gte(aiActionDrafts.createdAt, since))
    .orderBy(desc(aiActionDrafts.createdAt))
    .limit(120);

  const alerts = rows
    .filter((row) => isAutopilotOperationalDraft(row.payload ?? {}))
    .map((row) => rowToOperationalAlert(row, role))
    .filter((alert) => alertMatchesRole(alert, role))
    .slice(0, limit);

  const unreadCount = alerts.filter((alert) => !alert.acknowledged).length;

  const [lastRun] = await getDb()
    .select({ createdAt: aiAgentRuns.createdAt })
    .from(aiAgentRuns)
    .where(eq(aiAgentRuns.intent, "shift_copilot"))
    .orderBy(desc(aiAgentRuns.createdAt))
    .limit(1);

  return {
    alerts,
    unreadCount,
    lastAutopilotAt: lastRun?.createdAt?.toISOString() ?? null,
  };
}

export async function acknowledgeOperationalAlert(input: {
  id: string;
  role: Role;
  userId: string;
}) {
  await ensureAiAgentSetup();

  const [row] = await getDb()
    .select()
    .from(aiActionDrafts)
    .where(eq(aiActionDrafts.id, input.id))
    .limit(1);

  if (!row) {
    return null;
  }

  const alert = rowToOperationalAlert(row);
  if (!alertMatchesRole(alert, input.role)) {
    return null;
  }

  const payload = {
    ...(row.payload ?? {}),
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: input.userId,
    acknowledgedRole: input.role,
  };

  const [updated] = await getDb()
    .update(aiActionDrafts)
    .set({
      payload,
      updatedAt: new Date(),
    })
    .where(eq(aiActionDrafts.id, input.id))
    .returning();

  return updated ? rowToOperationalAlert(updated, input.role) : null;
}
