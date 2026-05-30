import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiActionDrafts,
  aiActionRegistry,
  aiAgentConfigs,
  aiAgentEvents,
} from "@/db/schema";
import type {
  AiActionDraft,
  AiActionDraftRecord,
  AiActionRegistryPublic,
  AiAgentConfigPublic,
  AiAgentHandoff,
  AiAgentIntent,
  AiAgentPlanStep,
  AiApprovalStatus,
  AiAutonomyMode,
  AiDataAccessLevel,
  AiRiskLevel,
  AiSafetyLevel,
  AiSubAgentId,
  AiSupervisorDecision,
} from "@/lib/garage-api-types";
import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";

export const aiAutonomyModes = ["read_only", "draft", "controlled"] as const;
export const aiRiskLevels = ["low", "medium", "high"] as const;
export const aiApprovalStatuses = [
  "not_required",
  "pending",
  "approved",
  "rejected",
] as const;

type DefaultAgentConfig = {
  agentId: AiSubAgentId;
  label: string;
  description: string;
  enabled: boolean;
  autonomyMode: AiAutonomyMode;
  maxRiskLevel: AiRiskLevel;
  allowedIntents: string[];
  sortOrder: number;
};

type DefaultActionRegistry = {
  actionType: string;
  label: string;
  description: string;
  safetyLevel: AiSafetyLevel;
  requiresApproval: boolean;
  enabled: boolean;
  allowedRoles: Role[];
};

const defaultAgentConfigs: DefaultAgentConfig[] = [
  {
    agentId: "supervisor",
    label: "Supervisor Agent",
    description: "Router utama yang memilih sub-agent, risk level, dan approval gate.",
    enabled: true,
    autonomyMode: "controlled",
    maxRiskLevel: "high",
    allowedIntents: ["*"],
    sortOrder: 0,
  },
  {
    agentId: "pos_agent",
    label: "POS Agent",
    description: "Cart review, upsell, payment risk, dan cashier guidance.",
    enabled: true,
    autonomyMode: "controlled",
    maxRiskLevel: "medium",
    allowedIntents: ["cart_review", "upsell", "general_assist", "owner_ceo_brain"],
    sortOrder: 10,
  },
  {
    agentId: "inventory_agent",
    label: "Inventory Agent",
    description: "Stok kritis, reorder draft, waste risk, dan purchase signal.",
    enabled: true,
    autonomyMode: "controlled",
    maxRiskLevel: "medium",
    allowedIntents: ["inventory_warning", "shift_copilot", "daily_brief", "owner_ceo_brain"],
    sortOrder: 20,
  },
  {
    agentId: "kitchen_agent",
    label: "Kitchen Agent",
    description: "Delay kitchen, station risk, dan expeditor recommendation.",
    enabled: true,
    autonomyMode: "controlled",
    maxRiskLevel: "medium",
    allowedIntents: ["kitchen_warning", "shift_copilot", "daily_brief", "owner_ceo_brain"],
    sortOrder: 30,
  },
  {
    agentId: "finance_guard_agent",
    label: "Finance Guard Agent",
    description: "Cash gap, refund, void, discount, dan closing risk.",
    enabled: true,
    autonomyMode: "controlled",
    maxRiskLevel: "high",
    allowedIntents: ["finance_check", "shift_copilot", "daily_brief", "owner_ceo_brain"],
    sortOrder: 40,
  },
  {
    agentId: "approval_agent",
    label: "Approval Agent",
    description: "Ringkasan approval, risk assessment, dan decision draft.",
    enabled: true,
    autonomyMode: "controlled",
    maxRiskLevel: "high",
    allowedIntents: ["approval_assist", "shift_copilot", "daily_brief", "owner_ceo_brain"],
    sortOrder: 50,
  },
  {
    agentId: "sop_knowledge_agent",
    label: "SOP Knowledge Agent",
    description: "Jawaban dari SOP, PRD, policy, resep, dan knowledge base.",
    enabled: true,
    autonomyMode: "read_only",
    maxRiskLevel: "low",
    allowedIntents: ["sop_knowledge", "owner_ceo_brain"],
    sortOrder: 60,
  },
  {
    agentId: "daily_brief_agent",
    label: "Daily Brief Agent",
    description: "Brief operasional harian untuk owner dan manager.",
    enabled: true,
    autonomyMode: "controlled",
    maxRiskLevel: "medium",
    allowedIntents: ["daily_brief", "owner_ceo_brain"],
    sortOrder: 70,
  },
];

const allFloorRoles: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
  "Kasir",
  "Waiter 1",
  "Waiter 2",
  "Barista",
  "Koki",
  "Kitchen / Barista",
];
const managementRoles: Role[] = ["Owner / CEO", "Admin", "Manager Operasional"];
const financeRoles: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
];
const kitchenRoles: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
  "Barista",
  "Koki",
  "Kitchen / Barista",
];
const inventoryRoles: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Gudang",
];
const shiftLeadRoles: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Supervisor Shift",
];

const defaultActionRegistry: DefaultActionRegistry[] = [
  {
    actionType: "operational_alert",
    label: "Operational alert",
    description: "Alert operasional untuk shift aktif.",
    safetyLevel: "safe",
    requiresApproval: false,
    enabled: true,
    allowedRoles: allFloorRoles,
  },
  {
    actionType: "staff_supervision",
    label: "Staff supervision",
    description: "Pengawasan karyawan: kesalahan, perbaikan, dan pengingat SOP.",
    safetyLevel: "safe",
    requiresApproval: false,
    enabled: true,
    allowedRoles: allFloorRoles,
  },
  {
    actionType: "daily_brief",
    label: "Daily brief",
    description: "Ringkasan shift atau harian untuk owner/manager.",
    safetyLevel: "safe",
    requiresApproval: false,
    enabled: true,
    allowedRoles: financeRoles,
  },
  {
    actionType: "follow_up_task",
    label: "Follow-up task",
    description: "Task follow-up internal tanpa eksekusi transaksi.",
    safetyLevel: "safe",
    requiresApproval: false,
    enabled: true,
    allowedRoles: allFloorRoles,
  },
  {
    actionType: "cart_warning",
    label: "Cart warning",
    description: "Warning cart, upsell, substitusi, atau item lambat.",
    safetyLevel: "safe",
    requiresApproval: false,
    enabled: true,
    allowedRoles: allFloorRoles,
  },
  {
    actionType: "kitchen_alert",
    label: "Kitchen alert",
    description: "Alert delay kitchen atau station risk.",
    safetyLevel: "safe",
    requiresApproval: false,
    enabled: true,
    allowedRoles: kitchenRoles,
  },
  {
    actionType: "sop_note",
    label: "SOP note",
    description: "Catatan SOP atau policy untuk bahan keputusan.",
    safetyLevel: "safe",
    requiresApproval: false,
    enabled: true,
    allowedRoles: allFloorRoles,
  },
  {
    actionType: "approval_summary",
    label: "Approval summary",
    description: "Ringkasan approval pending beserta risk assessment.",
    safetyLevel: "draft",
    requiresApproval: true,
    enabled: true,
    allowedRoles: managementRoles,
  },
  {
    actionType: "reorder_draft",
    label: "Reorder draft",
    description: "Draft reorder stok, belum membuat purchase order final.",
    safetyLevel: "draft",
    requiresApproval: true,
    enabled: true,
    allowedRoles: inventoryRoles,
  },
  {
    actionType: "incident_note",
    label: "Incident note",
    description: "Draft catatan insiden untuk ditinjau manusia.",
    safetyLevel: "draft",
    requiresApproval: true,
    enabled: true,
    allowedRoles: shiftLeadRoles,
  },
  {
    actionType: "refund_review",
    label: "Refund review",
    description: "Review refund. AI tidak boleh mengeksekusi refund.",
    safetyLevel: "critical",
    requiresApproval: true,
    enabled: true,
    allowedRoles: financeRoles,
  },
  {
    actionType: "void_review",
    label: "Void review",
    description: "Review void. AI tidak boleh mengeksekusi void.",
    safetyLevel: "critical",
    requiresApproval: true,
    enabled: true,
    allowedRoles: financeRoles,
  },
  {
    actionType: "discount_review",
    label: "Discount review",
    description: "Review discount besar. AI hanya membuat draft.",
    safetyLevel: "critical",
    requiresApproval: true,
    enabled: true,
    allowedRoles: financeRoles,
  },
  {
    actionType: "price_change_review",
    label: "Price change review",
    description: "Review perubahan harga/menu. AI tidak boleh mengeksekusi.",
    safetyLevel: "critical",
    requiresApproval: true,
    enabled: true,
    allowedRoles: ["Owner / CEO"],
  },
  {
    actionType: "stock_adjustment_draft",
    label: "Stock adjustment draft",
    description: "Draft penyesuaian stok real, wajib approval.",
    safetyLevel: "critical",
    requiresApproval: true,
    enabled: true,
    allowedRoles: inventoryRoles,
  },
  {
    actionType: "purchase_order_draft",
    label: "Purchase order draft",
    description: "Draft purchase order, belum PO final.",
    safetyLevel: "critical",
    requiresApproval: true,
    enabled: true,
    allowedRoles: inventoryRoles,
  },
  {
    actionType: "closing_cash_review",
    label: "Closing cash review",
    description: "Review closing cash, AI tidak boleh menutup kas.",
    safetyLevel: "critical",
    requiresApproval: true,
    enabled: true,
    allowedRoles: financeRoles,
  },
];

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function parseAgentId(value: string): AiSubAgentId {
  return defaultAgentConfigs.some((entry) => entry.agentId === value)
    ? (value as AiSubAgentId)
    : "supervisor";
}

function parseRiskLevel(value: string): AiRiskLevel {
  return aiRiskLevels.includes(value as AiRiskLevel) ? (value as AiRiskLevel) : "low";
}

function parseSafetyLevel(value: string): AiSafetyLevel {
  if (value === "critical" || value === "draft" || value === "safe") {
    return value;
  }

  return "draft";
}

function parseApprovalStatus(value: string): AiApprovalStatus {
  return aiApprovalStatuses.includes(value as AiApprovalStatus)
    ? (value as AiApprovalStatus)
    : "pending";
}

function parseAutonomyMode(value: string): AiAutonomyMode {
  return aiAutonomyModes.includes(value as AiAutonomyMode)
    ? (value as AiAutonomyMode)
    : "controlled";
}

function dateNow() {
  return new Date();
}

export async function ensureAiAgentSetup() {
  const db = getDb();
  const now = dateNow();

  for (const agent of defaultAgentConfigs) {
    await db
      .insert(aiAgentConfigs)
      .values(agent)
      .onConflictDoUpdate({
        target: aiAgentConfigs.agentId,
        set: {
          label: agent.label,
          description: agent.description,
          allowedIntents: agent.allowedIntents,
          sortOrder: agent.sortOrder,
          updatedAt: now,
        },
      });
  }

  for (const action of defaultActionRegistry) {
    await db
      .insert(aiActionRegistry)
      .values(action)
      .onConflictDoUpdate({
        target: aiActionRegistry.actionType,
        set: {
          label: action.label,
          description: action.description,
          safetyLevel: action.safetyLevel,
          requiresApproval: action.requiresApproval,
          allowedRoles: action.allowedRoles,
          updatedAt: now,
        },
      });
  }
}

function agentsForIntent(
  intent: AiAgentIntent,
  dataAccessLevel: AiDataAccessLevel,
): AiSubAgentId[] {
  switch (intent) {
    case "cart_review":
    case "upsell":
    case "general_assist":
      return ["pos_agent"];
    case "inventory_warning":
      return ["inventory_agent"];
    case "kitchen_warning":
      return ["kitchen_agent"];
    case "finance_check":
      return ["finance_guard_agent"];
    case "approval_assist":
      return ["approval_agent"];
    case "sop_knowledge":
      return ["sop_knowledge_agent"];
    case "owner_ceo_brain":
      return [
        "pos_agent",
        "inventory_agent",
        "kitchen_agent",
        "finance_guard_agent",
        "approval_agent",
        "sop_knowledge_agent",
        "daily_brief_agent",
      ];
    case "daily_brief":
      return ["daily_brief_agent", "inventory_agent", "kitchen_agent"].concat(
        dataAccessLevel === "basic" ? [] : ["finance_guard_agent", "approval_agent"],
      ) as AiSubAgentId[];
    case "shift_copilot":
      return ["pos_agent", "inventory_agent", "kitchen_agent"].concat(
        dataAccessLevel === "basic" ? [] : ["finance_guard_agent", "approval_agent"],
      ) as AiSubAgentId[];
    default:
      return ["pos_agent"];
  }
}

function isCriticalRequest(message: string) {
  const text = message.toLowerCase();
  return [
    "refund",
    "void",
    "discount",
    "diskon",
    "closing",
    "tutup kas",
    "ubah harga",
    "harga",
    "stock adjustment",
    "adjustment",
    "penyesuaian stok",
    "purchase order",
    "po final",
  ].some((word) => text.includes(word));
}

function inferRiskLevel(
  intent: AiAgentIntent,
  message: string,
  actionDrafts: AiActionDraft[],
) {
  if (
    isCriticalRequest(message) ||
    actionDrafts.some((draft) => draft.risk === "high" || draft.riskLevel === "high")
  ) {
    return "high" satisfies AiRiskLevel;
  }

  if (
    intent === "finance_check" ||
    intent === "approval_assist" ||
    intent === "daily_brief" ||
    intent === "owner_ceo_brain" ||
    intent === "shift_copilot" ||
    intent === "inventory_warning" ||
    intent === "kitchen_warning" ||
    actionDrafts.some((draft) => draft.risk === "medium" || draft.riskLevel === "medium")
  ) {
    return "medium" satisfies AiRiskLevel;
  }

  return "low" satisfies AiRiskLevel;
}

function planTitle(agentId: AiSubAgentId) {
  return (
    defaultAgentConfigs.find((entry) => entry.agentId === agentId)?.label ?? agentId
  );
}

export function buildSupervisorDecision(input: {
  intent: AiAgentIntent;
  dataAccessLevel: AiDataAccessLevel;
  role: Role;
  message: string;
  actionDrafts?: AiActionDraft[];
}): AiSupervisorDecision {
  const actionDrafts = input.actionDrafts ?? [];
  const agents = new Set<AiSubAgentId>(["supervisor"]);

  for (const agentId of agentsForIntent(input.intent, input.dataAccessLevel)) {
    agents.add(agentId);
  }

  const riskLevel = inferRiskLevel(input.intent, input.message, actionDrafts);
  const approvalRequired =
    riskLevel === "high" || actionDrafts.some((draft) => draft.approvalRequired);
  if (approvalRequired) {
    agents.add("approval_agent");
  }

  const agentsUsed = Array.from(agents);
  const handoffs: AiAgentHandoff[] = agentsUsed
    .filter((agentId) => agentId !== "supervisor")
    .map((agentId) => ({
      from: "supervisor",
      to: agentId,
      reason: `Intent ${input.intent} diarahkan ke ${planTitle(agentId)}.`,
    }));
  const agentPlan: AiAgentPlanStep[] = agentsUsed.map((agentId, index) => ({
    agentId,
    title: planTitle(agentId),
    detail:
      agentId === "supervisor"
        ? "Klasifikasi intent, role boundary, risk level, dan approval gate."
        : `Menganalisa context untuk ${input.intent}.`,
    status: index === 0 ? "completed" : "planned",
  }));

  return {
    autonomyMode: "controlled",
    agentsUsed,
    handoffs,
    agentPlan,
    riskLevel,
    approvalRequired,
    approvalStatus: approvalRequired ? "pending" : "not_required",
    reason: approvalRequired
      ? "Controlled autonomy aktif: AI hanya membuat draft untuk aksi berisiko dan menunggu approval manusia."
      : "Controlled autonomy aktif: AI boleh membuat alert atau rekomendasi tanpa eksekusi transaksi kritis.",
  };
}

function rowToAgent(row: typeof aiAgentConfigs.$inferSelect): AiAgentConfigPublic {
  return {
    agentId: parseAgentId(row.agentId),
    label: row.label,
    description: row.description,
    enabled: row.enabled,
    autonomyMode: parseAutonomyMode(row.autonomyMode),
    maxRiskLevel: parseRiskLevel(row.maxRiskLevel),
    allowedIntents: row.allowedIntents,
    sortOrder: row.sortOrder,
    updatedAt: toIso(row.updatedAt),
  };
}

function rowToRegistry(
  row: typeof aiActionRegistry.$inferSelect,
): AiActionRegistryPublic {
  return {
    actionType: row.actionType,
    label: row.label,
    description: row.description,
    safetyLevel: parseSafetyLevel(row.safetyLevel),
    requiresApproval: row.requiresApproval,
    enabled: row.enabled,
    allowedRoles: row.allowedRoles as Role[],
    updatedAt: toIso(row.updatedAt),
  };
}

export function rowToActionDraft(
  row: typeof aiActionDrafts.$inferSelect,
): AiActionDraftRecord {
  return {
    id: row.id,
    runId: row.runId,
    actionType: row.actionType,
    agentId: parseAgentId(row.agentId),
    title: row.title,
    detail: row.detail,
    riskLevel: parseRiskLevel(row.riskLevel),
    safetyLevel: parseSafetyLevel(row.safetyLevel),
    approvalStatus: parseApprovalStatus(row.approvalStatus),
    payload: row.payload,
    createdBy: row.createdBy,
    decidedBy: row.decidedBy,
    decidedAt: toIso(row.decidedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAiAgents() {
  await ensureAiAgentSetup();

  const rows = await getDb()
    .select()
    .from(aiAgentConfigs)
    .orderBy(asc(aiAgentConfigs.sortOrder));

  return rows.map(rowToAgent);
}

export async function saveAiAgentConfigs(
  updates: Array<{
    agentId: AiSubAgentId;
    enabled: boolean;
    autonomyMode: AiAutonomyMode;
    maxRiskLevel: AiRiskLevel;
  }>,
) {
  await ensureAiAgentSetup();
  const db = getDb();
  const now = dateNow();

  for (const update of updates) {
    await db
      .update(aiAgentConfigs)
      .set({
        enabled: update.enabled,
        autonomyMode: update.autonomyMode,
        maxRiskLevel: update.maxRiskLevel,
        updatedAt: now,
      })
      .where(eq(aiAgentConfigs.agentId, update.agentId));
  }

  return listAiAgents();
}

export async function listAiActionRegistry() {
  await ensureAiAgentSetup();

  const rows = await getDb()
    .select()
    .from(aiActionRegistry)
    .orderBy(asc(aiActionRegistry.actionType));

  return rows.map(rowToRegistry);
}

export async function getActionRegistryMap() {
  await ensureAiAgentSetup();

  const rows = await getDb().select().from(aiActionRegistry);
  return new Map(rows.map((row) => [row.actionType, row]));
}

function actionTypeForDraft(draft: AiActionDraft) {
  const text = `${draft.title} ${draft.detail}`.toLowerCase();

  if (text.includes("refund")) {
    return "refund_review";
  }

  if (text.includes("void")) {
    return "void_review";
  }

  if (text.includes("discount") || text.includes("diskon")) {
    return "discount_review";
  }

  if (text.includes("closing") || text.includes("tutup kas")) {
    return "closing_cash_review";
  }

  if (text.includes("ubah harga") || text.includes("price change")) {
    return "price_change_review";
  }

  if (text.includes("stock adjustment") || text.includes("penyesuaian stok")) {
    return "stock_adjustment_draft";
  }

  if (text.includes("purchase order") || text.includes(" po ")) {
    return "purchase_order_draft";
  }

  switch (draft.type) {
    case "approval":
      return "approval_summary";
    case "inventory":
      return "reorder_draft";
    case "kitchen":
      return draft.approvalRequired ? "incident_note" : "kitchen_alert";
    case "finance":
      return "approval_summary";
    case "pos":
      return "cart_warning";
    case "sop":
      return "sop_note";
    default:
      return "follow_up_task";
  }
}

function agentForActionType(actionType: string): AiSubAgentId {
  if (actionType.includes("stock") || actionType.includes("reorder") || actionType.includes("purchase")) {
    return "inventory_agent";
  }

  if (actionType.includes("kitchen") || actionType.includes("incident")) {
    return "kitchen_agent";
  }

  if (
    actionType.includes("refund") ||
    actionType.includes("void") ||
    actionType.includes("discount") ||
    actionType.includes("closing") ||
    actionType.includes("price")
  ) {
    return "finance_guard_agent";
  }

  if (actionType.includes("approval")) {
    return "approval_agent";
  }

  if (actionType.includes("staff_supervision") || actionType.includes("supervision")) {
    return "supervisor";
  }

  if (actionType.includes("sop")) {
    return "sop_knowledge_agent";
  }

  if (actionType.includes("daily")) {
    return "daily_brief_agent";
  }

  return "pos_agent";
}

export async function recordAiAgentEvents(
  runId: string | null | undefined,
  decision: AiSupervisorDecision,
  metadata: Record<string, unknown> = {},
) {
  if (!runId) {
    return;
  }

  const values = [
    {
      runId,
      agentId: "supervisor",
      eventType: "supervisor_decision",
      message: decision.reason,
      metadata: {
        ...metadata,
        autonomyMode: decision.autonomyMode,
        riskLevel: decision.riskLevel,
        approvalRequired: decision.approvalRequired,
      },
    },
    ...decision.handoffs.map((handoff) => ({
      runId,
      agentId: handoff.to,
      eventType: "handoff",
      message: handoff.reason,
      metadata: { from: handoff.from, to: handoff.to },
    })),
  ];

  await getDb().insert(aiAgentEvents).values(values);
}

export async function createActionDraftRecords(input: {
  runId: string | null | undefined;
  drafts: AiActionDraft[];
  session: GarageSession;
}) {
  if (!input.drafts.length) {
    return [];
  }

  const registry = await getActionRegistryMap();
  const db = getDb();
  const records: AiActionDraftRecord[] = [];

  for (const draft of input.drafts.slice(0, 8)) {
    const actionType = draft.actionType ?? actionTypeForDraft(draft);
    const actionConfig = registry.get(actionType) ?? registry.get("follow_up_task");
    const safetyLevel = parseSafetyLevel(actionConfig?.safetyLevel ?? "draft");
    const requiresApproval =
      Boolean(actionConfig?.requiresApproval) ||
      draft.approvalRequired ||
      safetyLevel === "critical";
    const approvalStatus: AiApprovalStatus = requiresApproval ? "pending" : "not_required";
    const riskLevel = parseRiskLevel(draft.riskLevel ?? draft.risk);
    const agentId = draft.agentId ?? agentForActionType(actionType);
    const now = dateNow();

    const [row] = await db
      .insert(aiActionDrafts)
      .values({
        runId: input.runId ?? null,
        actionType,
        agentId,
        title: draft.title,
        detail: draft.detail,
        riskLevel,
        safetyLevel,
        approvalStatus,
        payload: {
          source: "garage_ai",
          draft,
          approvalRequired: requiresApproval,
        },
        createdBy: input.session.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (input.runId) {
      await db.insert(aiAgentEvents).values({
        runId: input.runId,
        agentId,
        eventType: "action_draft_created",
        message: `${draft.title} (${actionType})`,
        metadata: {
          actionType,
          safetyLevel,
          riskLevel,
          approvalStatus,
        },
      });
    }

    records.push(rowToActionDraft(row));
  }

  return records;
}

export function actionRecordToAiDraft(record: AiActionDraftRecord): AiActionDraft {
  const draftType: AiActionDraft["type"] = record.actionType.includes("sop")
    ? "sop"
    : record.agentId === "inventory_agent"
      ? "inventory"
      : record.agentId === "kitchen_agent"
        ? "kitchen"
        : record.agentId === "finance_guard_agent"
          ? "finance"
          : record.agentId === "approval_agent"
            ? "approval"
            : "pos";

  return {
    id: record.id,
    type: draftType,
    actionType: record.actionType,
    agentId: record.agentId,
    title: record.title,
    detail: record.detail,
    risk: record.riskLevel,
    riskLevel: record.riskLevel,
    safetyLevel: record.safetyLevel,
    approvalStatus: record.approvalStatus,
    approvalRequired: record.approvalStatus === "pending",
    createdAt: record.createdAt,
  };
}

export async function listAiActionDrafts(status?: AiApprovalStatus) {
  await ensureAiAgentSetup();

  const query = getDb().select().from(aiActionDrafts);
  const rows = status
    ? await query
        .where(eq(aiActionDrafts.approvalStatus, status))
        .orderBy(desc(aiActionDrafts.createdAt))
        .limit(80)
    : await query.orderBy(desc(aiActionDrafts.createdAt)).limit(80);

  return rows.map(rowToActionDraft);
}

export async function decideAiActionDraft(input: {
  id: string;
  status: "approved" | "rejected";
  session: GarageSession;
}) {
  const now = dateNow();
  const [row] = await getDb()
    .update(aiActionDrafts)
    .set({
      approvalStatus: input.status,
      decidedBy: input.session.user.id,
      decidedAt: now,
      updatedAt: now,
    })
    .where(eq(aiActionDrafts.id, input.id))
    .returning();

  if (!row) {
    return null;
  }

  await getDb().insert(aiAgentEvents).values({
    runId: row.runId,
    agentId: row.agentId,
    eventType: `action_${input.status}`,
    message: `${row.title} ${input.status}`,
    metadata: {
      actionType: row.actionType,
      decidedBy: input.session.user.id,
    },
  });

  return rowToActionDraft(row);
}
