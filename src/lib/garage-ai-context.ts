import { and, desc, eq, gt } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiActionDrafts,
  aiAgentEvents,
  aiAgentRuns,
  aiContextSnapshots,
  aiProviderConfigs,
} from "@/db/schema";
import {
  getApprovalData,
  getAuditData,
  getCustomerData,
  getDashboardData,
  getFinanceGuardSummary,
  getFinanceBrief,
  getInventoryData,
  getKitchenData,
  getMenuData,
  getStockMovementData,
} from "@/lib/garage-service";
import type {
  AiAgentIntent,
  AiBusinessFreshness,
  AiDataAccessLevel,
  AiPosAgentResponse,
  AiProviderProfile,
  CartLine,
  OrderType,
} from "@/lib/garage-api-types";
import { garageAiOwnerAnswerPolicy } from "@/lib/garage-ai-persona";
import type { Role } from "@/lib/garage-data";
import type { GarageSession } from "@/lib/server-auth";

type BuildGarageAiContextInput = {
  message: string;
  orderType: OrderType;
  cart: CartLine[];
  session: GarageSession;
  ownerChatContext?: OwnerChatContextInput;
};

export type GarageAiContextResult = {
  context: Record<string, unknown>;
  intent: AiAgentIntent;
  profile: AiProviderProfile;
  dataAccessLevel: AiDataAccessLevel;
  decisionMessage: string;
  contextModules: string[];
  snapshotUsed: boolean;
  deterministicResponse: AiPosAgentResponse | null;
};

type OwnerChatContextInput = {
  planMode?: boolean;
  profile?: "auto" | "fast" | "manager" | "finance" | "deep";
  tool?:
    | "none"
    | "pos_agent"
    | "inventory_agent"
    | "kitchen_agent"
    | "finance_guard_agent"
    | "approval_agent"
    | "sop_knowledge_agent"
    | "report_builder"
    | "ssh_codex_bridge";
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

const inventoryWords = [
  "stok",
  "stock",
  "inventory",
  "gudang",
  "bahan",
  "reorder",
  "habis",
  "menipis",
  "purchase",
];
const kitchenWords = [
  "kitchen",
  "dapur",
  "barista",
  "delay",
  "antrian",
  "station",
  "masak",
  "expeditor",
];
const financeWords = [
  "finance",
  "keuangan",
  "cash",
  "kas",
  "refund",
  "void",
  "discount",
  "diskon",
  "payment",
  "closing",
];
const approvalWords = ["approval", "approve", "persetujuan", "otorisasi", "izin"];
const sopWords = ["sop", "prd", "policy", "kebijakan", "resep", "standar"];
const dailyWords = ["daily", "harian", "brief", "laporan", "report", "rekap"];
const helpWords = ["help", "bantuan", "fitur", "bisa apa", "panduan"];

function extractUserCommand(message: string) {
  const commandMatch = message.match(/(?:^|\n)Perintah:\s*([\s\S]+)$/i);
  return (commandMatch?.[1] ?? message).trim();
}
const criticalFinanceWords = [
  "refund",
  "void",
  "discount",
  "diskon",
  "cash",
  "kas",
  "closing",
];

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function classifyGarageAiIntent(message: string, cart: CartLine[]): AiAgentIntent {
  const text = message.toLowerCase();

  if (hasAny(text, sopWords)) {
    return "sop_knowledge";
  }

  if (hasAny(text, dailyWords)) {
    return "daily_brief";
  }

  if (hasAny(text, approvalWords)) {
    return "approval_assist";
  }

  if (hasAny(text, criticalFinanceWords)) {
    return "finance_check";
  }

  if (hasAny(text, inventoryWords)) {
    return "inventory_warning";
  }

  if (hasAny(text, kitchenWords)) {
    return "kitchen_warning";
  }

  if (text.includes("upsell") || text.includes("paket") || text.includes("rekomendasi")) {
    return "upsell";
  }

  if (cart.length || text.includes("cart") || text.includes("keranjang")) {
    return "cart_review";
  }

  if (hasAny(text, financeWords)) {
    return "finance_check";
  }

  if (text.includes("shift") || text.includes("outlet") || text.includes("operasional")) {
    return "shift_copilot";
  }

  return "general_assist";
}

export function accessForRole(role: Role, intent: AiAgentIntent): AiDataAccessLevel {
  if (role === "Owner / CEO") {
    return "executive";
  }

  if (role === "Admin") {
    return intent === "finance_check" || intent === "daily_brief"
      ? "financial"
      : "operational";
  }

  if (role === "Manager Operasional") {
    return intent === "finance_check" || intent === "daily_brief"
      ? "financial"
      : "operational";
  }

  if (role === "Finance / CFO") {
    return "financial";
  }

  if (role === "Kasir" || role === "Waiter 1" || role === "Waiter 2") {
    return "basic";
  }

  return "operational";
}

export function profileForIntent(
  intent: AiAgentIntent,
  dataAccessLevel: AiDataAccessLevel,
) {
  if (intent === "daily_brief") {
    return "async" satisfies AiProviderProfile;
  }

  if (intent === "finance_check" || dataAccessLevel === "financial") {
    return "finance" satisfies AiProviderProfile;
  }

  if (dataAccessLevel === "executive" || intent === "shift_copilot") {
    return "manager" satisfies AiProviderProfile;
  }

  return "fast" satisfies AiProviderProfile;
}

function canAccessFinance(role: Role) {
  return (
    role === "Owner / CEO" ||
    role === "Admin" ||
    role === "Manager Operasional" ||
    role === "Finance / CFO"
  );
}

function canAccessApprovals(role: Role) {
  return role === "Owner / CEO" || role === "Admin" || role === "Manager Operasional";
}

function requestedModules(intent: AiAgentIntent, role: Role, cart: CartLine[]) {
  const modules = new Set<string>(["user", "request"]);

  if (cart.length || intent === "cart_review" || intent === "upsell") {
    modules.add("menu");
    modules.add("cart");
  }

  if (
    intent === "general_assist" ||
    intent === "shift_copilot" ||
    intent === "daily_brief"
  ) {
    modules.add("snapshot");
  }

  if (
    intent === "inventory_warning" ||
    intent === "shift_copilot" ||
    intent === "daily_brief"
  ) {
    modules.add("inventory");
  }

  if (
    intent === "kitchen_warning" ||
    intent === "shift_copilot" ||
    intent === "daily_brief"
  ) {
    modules.add("kitchen");
  }

  if ((intent === "finance_check" || intent === "daily_brief") && canAccessFinance(role)) {
    modules.add("finance");
  }

  if (
    (intent === "approval_assist" ||
      intent === "daily_brief" ||
      intent === "shift_copilot") &&
    canAccessApprovals(role)
  ) {
    modules.add("approvals");
  }

  if (intent === "sop_knowledge") {
    modules.add("sop_knowledge");
  }

  return modules;
}

async function buildCartSnapshot(cart: CartLine[]) {
  if (!cart.length) {
    return [];
  }

  const menuItems = await getMenuData();
  return cart.map((line) => {
    const item = menuItems.find((entry) => entry.id === line.itemId);
    const variant = item?.variants.find((entry) => entry.id === line.variantId);
    const unitPrice = variant?.price ?? 0;

    return {
      itemId: line.itemId,
      variantId: line.variantId,
      name: item?.name ?? line.itemId,
      category: item?.category ?? "unknown",
      variant: variant?.label ?? line.variantId,
      qty: line.qty,
      unitPrice,
      lineTotal: unitPrice * line.qty,
      stock: item?.stock ?? "unknown",
      prep: item?.prep ?? "-",
      tags: item?.tags ?? [],
    };
  });
}

function summarizeInventory(items: Awaited<ReturnType<typeof getInventoryData>>) {
  return items
    .filter((item) => item.status === "low" || item.status === "watch")
    .slice(0, 12)
    .map((item) => ({
      sku: item.sku,
      name: item.name,
      category: item.category,
      onHand: item.onHand,
      min: item.min,
      unit: item.unit,
      status: item.status,
    }));
}

function summarizeKitchen(orders: Awaited<ReturnType<typeof getKitchenData>>) {
  return orders
    .filter((order) => order.status !== "delivered")
    .slice(0, 12)
    .map((order) => ({
      id: order.id,
      station: order.station,
      status: order.status,
      elapsed: order.elapsed,
      priority: order.priority,
      items: order.items.slice(0, 4),
    }));
}

function summarizeMenu(items: Awaited<ReturnType<typeof getMenuData>>) {
  const categoryCounts = new Map<string, number>();
  const limitedItems = [];

  for (const item of items) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    if (item.stock === "limited") {
      limitedItems.push({
        id: item.id,
        name: item.name,
        category: item.category,
        variants: item.variants.length,
        tags: item.tags.slice(0, 4),
      });
    }
  }

  return {
    totalItems: items.length,
    categories: Array.from(categoryCounts.entries()).map(([category, count]) => ({
      category,
      count,
    })),
    limitedItems: limitedItems.slice(0, 10),
  };
}

function summarizeCustomers(customers: Awaited<ReturnType<typeof getCustomerData>>) {
  return customers.slice(0, 10).map((customer) => ({
    name: customer.name,
    tier: customer.tier,
    points: customer.points,
    visits: customer.visits,
    lastOrder: customer.lastOrder,
    flag: customer.flag,
  }));
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function profileForOwnerChat(profile?: OwnerChatContextInput["profile"]) {
  if (profile === "fast") {
    return "fast" satisfies AiProviderProfile;
  }

  if (profile === "finance") {
    return "finance" satisfies AiProviderProfile;
  }

  if (profile === "deep") {
    return "async" satisfies AiProviderProfile;
  }

  return "manager" satisfies AiProviderProfile;
}

function normalizeOwnerHistory(history?: OwnerChatContextInput["history"]) {
  return (history ?? [])
    .slice(-8)
    .map((entry) => ({
      role: entry.role,
      content: entry.content.slice(0, 1200),
    }));
}

function envFlagEnabled(key: string) {
  return ["1", "true", "yes", "on"].includes(
    process.env[key]?.trim().toLowerCase() ?? "",
  );
}

function buildSshCodexControlContext() {
  const hostConfigured = Boolean(process.env.GARAGE_SSH_HOST?.trim());
  const userConfigured = Boolean(process.env.GARAGE_SSH_USER?.trim());
  const keyPathConfigured = Boolean(process.env.GARAGE_SSH_KEY_PATH?.trim());
  const portConfigured = Boolean(process.env.GARAGE_SSH_PORT?.trim());
  const targetAlias =
    process.env.GARAGE_SSH_TARGET_ALIAS?.trim() || "garage-ssh-target";

  return {
    targetAlias,
    configured: hostConfigured && userConfigured && keyPathConfigured,
    hostConfigured,
    userConfigured,
    portConfigured,
    keyPathConfigured,
    defaultPort: portConfigured ? "custom" : "22",
    commandExecution: envFlagEnabled("GARAGE_SSH_ALLOW_COMMAND_EXECUTION")
      ? "enabled_by_env_but_still_requires_owner_approval"
      : "disabled_by_default",
    policy:
      "ChatGPT may prepare SSH commands, diagnostics, rollback plans, and Codex handoff notes. It must not request or reveal private keys, passwords, API keys, host secrets, or claim commands were executed.",
  };
}

async function getOwnerAiTelemetry() {
  const db = getDb();
  const [runs, events, providers, drafts] = await Promise.all([
    db.select().from(aiAgentRuns).orderBy(desc(aiAgentRuns.createdAt)).limit(12),
    db.select().from(aiAgentEvents).orderBy(desc(aiAgentEvents.createdAt)).limit(12),
    db.select().from(aiProviderConfigs).orderBy(aiProviderConfigs.priority),
    db
      .select()
      .from(aiActionDrafts)
      .where(eq(aiActionDrafts.approvalStatus, "pending"))
      .orderBy(desc(aiActionDrafts.createdAt))
      .limit(10),
  ]);

  return {
    lastAgentRunAt: toIso(runs[0]?.createdAt),
    recentRuns: runs.map((run) => ({
      intent: run.intent,
      profile: run.profile,
      provider: run.provider,
      model: run.model,
      status: run.status,
      fallbackUsed: run.fallbackUsed,
      latencyMs: run.latencyMs,
      riskLevel: run.riskLevel,
      approvalStatus: run.approvalStatus,
      createdAt: toIso(run.createdAt),
      tokenUsage: run.tokenUsage,
    })),
    recentEvents: events.map((event) => ({
      agentId: event.agentId,
      eventType: event.eventType,
      message: event.message,
      createdAt: toIso(event.createdAt),
    })),
    providers: providers.map((provider) => ({
      provider: provider.provider,
      label: provider.label,
      enabled: provider.enabled,
      priority: provider.priority,
      lastStatus: provider.lastStatus,
      lastLatencyMs: provider.lastLatencyMs,
      updatedAt: toIso(provider.updatedAt),
    })),
    pendingActionDrafts: drafts.map((draft) => ({
      id: draft.id,
      actionType: draft.actionType,
      agentId: draft.agentId,
      title: draft.title,
      detail: draft.detail,
      riskLevel: draft.riskLevel,
      safetyLevel: draft.safetyLevel,
      approvalStatus: draft.approvalStatus,
      createdAt: toIso(draft.createdAt),
    })),
  };
}

async function getCachedSnapshot(
  session: GarageSession,
  intent: AiAgentIntent,
  dataAccessLevel: AiDataAccessLevel,
) {
  const snapshotKey = `${intent}:${dataAccessLevel}`;
  const [snapshot] = await getDb()
    .select()
    .from(aiContextSnapshots)
    .where(
      and(
        eq(aiContextSnapshots.snapshotKey, snapshotKey),
        eq(aiContextSnapshots.dataAccessLevel, dataAccessLevel),
        eq(aiContextSnapshots.outletId, session.profile.outlet.id),
        gt(aiContextSnapshots.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(aiContextSnapshots.createdAt))
    .limit(1);

  return snapshot?.summary ?? null;
}

async function createSnapshot(
  session: GarageSession,
  intent: AiAgentIntent,
  dataAccessLevel: AiDataAccessLevel,
) {
  const role = session.profile.role;
  const [dashboard, inventory, kitchen, finance, approvals] = await Promise.all([
    getDashboardData(),
    getInventoryData(),
    getKitchenData(),
    canAccessFinance(role) ? getFinanceGuardSummary() : Promise.resolve(null),
    canAccessApprovals(role) ? getApprovalData({ status: "pending" }) : Promise.resolve([]),
  ]);
  const summary = {
    generatedAt: new Date().toISOString(),
    dashboard,
    lowStockItems: summarizeInventory(inventory),
    kitchenRisk: summarizeKitchen(kitchen),
    finance: finance
      ? {
          cashSession: finance.cashSession,
          guard: finance.guard,
          profitLoss: finance.profitLoss,
          supplierPayables: finance.supplierPayables,
        }
      : "hidden_by_role",
    pendingApprovals: approvals.slice(0, 8),
  };
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

  await getDb().insert(aiContextSnapshots).values({
    outletId: session.profile.outlet.id,
    snapshotKey: `${intent}:${dataAccessLevel}`,
    dataAccessLevel,
    summary,
    expiresAt,
  });

  return summary;
}

async function getOrCreateSnapshot(
  session: GarageSession,
  intent: AiAgentIntent,
  dataAccessLevel: AiDataAccessLevel,
) {
  const cached = await getCachedSnapshot(session, intent, dataAccessLevel);
  if (cached) {
    return { summary: cached, snapshotUsed: true };
  }

  return {
    summary: await createSnapshot(session, intent, dataAccessLevel),
    snapshotUsed: false,
  };
}

export async function buildGarageOwnerCeoContext({
  message,
  orderType,
  cart,
  session,
  ownerChatContext,
}: BuildGarageAiContextInput): Promise<GarageAiContextResult> {
  const intent = "owner_ceo_brain" satisfies AiAgentIntent;
  const dataAccessLevel = "executive" satisfies AiDataAccessLevel;
  const profile = profileForOwnerChat(ownerChatContext?.profile);
  const generatedAt = new Date().toISOString();
  const knowledgeBaseConfigured = Boolean(
    process.env.OPENAI_GARAGE_VECTOR_STORE_ID?.trim(),
  );
  const toolFocus = ownerChatContext?.tool ?? "none";
  const sshCodexControl = buildSshCodexControlContext();

  const [
    snapshot,
    dashboard,
    menuItems,
    inventory,
    stockMovements,
    kitchen,
    finance,
    approvals,
    customers,
    reportAudit,
    aiTelemetry,
  ] = await Promise.all([
    getOrCreateSnapshot(session, intent, dataAccessLevel),
    getDashboardData(),
    getMenuData(),
    getInventoryData(),
    getStockMovementData(),
    getKitchenData(),
    getFinanceGuardSummary(),
    getApprovalData({ status: "pending" }),
    getCustomerData(),
    getAuditData({ module: "report" }),
    getOwnerAiTelemetry(),
  ]);

  const lastReportGeneratedAt = reportAudit.rows[0]?.time ?? null;
  const dataSourcesUsed = [
    "dashboard",
    "sales_orders",
    "finance_cash_payments",
    "inventory_stock_movements",
    "kitchen_tickets",
    "approvals_action_drafts",
    "customers_service_signals",
    "ai_agent_runs_events",
    "provider_health",
    "reports_excel_export_status",
    "knowledge_base",
    ...(toolFocus === "ssh_codex_bridge" ? ["ssh_codex_control_config"] : []),
  ];
  const staleSources = [
    ...(knowledgeBaseConfigured ? [] : ["knowledge_base_not_configured"]),
    ...(aiTelemetry.lastAgentRunAt ? [] : ["ai_agent_runs_empty"]),
    ...(lastReportGeneratedAt ? [] : ["master_report_not_generated_yet"]),
    ...(toolFocus === "ssh_codex_bridge" && !sshCodexControl.configured
      ? ["ssh_codex_control_not_configured"]
      : []),
  ];
  const businessFreshness: AiBusinessFreshness = {
    generatedAt,
    dataSourcesUsed,
    staleSources,
    knowledgeBaseConfigured,
    lastAgentRunAt: aiTelemetry.lastAgentRunAt,
    lastReportGeneratedAt,
  };
  const requestContext: Record<string, unknown> = {
    message,
    orderType,
    cartLineCount: cart.length,
    ownerChat: {
      planMode: Boolean(ownerChatContext?.planMode),
      requestedProfile: ownerChatContext?.profile ?? "auto",
      providerProfile: profile,
      toolFocus,
      history: normalizeOwnerHistory(ownerChatContext?.history),
      ...(toolFocus === "ssh_codex_bridge"
        ? {
            sshCodexControl,
          }
        : {}),
    },
  };

  if (cart.length) {
    const cartSnapshot = await buildCartSnapshot(cart);
    requestContext.cart = cartSnapshot;
    requestContext.subtotal = cartSnapshot.reduce((sum, line) => sum + line.lineTotal, 0);
  }

  const contextModules = [
    "owner_ceo_brain",
    "business_freshness",
    "user",
    "request",
    "dashboard",
    "menu",
    "inventory",
    "stock_movements",
    "kitchen",
    "finance",
    "approvals",
    "customers",
    "ai_activity",
    "provider_health",
    "reports",
    "knowledge_base",
    ...(toolFocus === "ssh_codex_bridge" ? ["ssh_codex_control"] : []),
  ];

  return {
    context: {
      mode: "owner_free_chat",
      intent,
      profile,
      dataAccessLevel,
      contextModules,
      user: {
        role: session.profile.role,
        outlet: session.profile.outlet.name,
        shift: session.profile.shiftLabel,
        device: session.profile.deviceLabel,
      },
      request: requestContext,
      ceoBrain: {
        role: "GARAGE CEO Executive Assistant",
        scope:
          "Owner may ask broadly about GARAGE business, operations, finance, stock, kitchen, SOP, reports, AI setup, SSH/Codex control planning, product strategy, marketing ideas, and development roadmap. AI must think critically, reject weak decisions, and approve only when data supports it.",
        answerPolicy: garageAiOwnerAnswerPolicy,
        planModePolicy: ownerChatContext?.planMode
          ? "Plan Mode is ON: give a plan first and do not create final action drafts unless the Owner explicitly asks after review."
          : "Plan Mode is OFF: answer directly and practically while keeping controlled-autonomy safety gates.",
        sshCodexControlPolicy:
          toolFocus === "ssh_codex_bridge"
            ? "SSH/Codex Bridge is selected: produce a safe SSH setup or troubleshooting runbook with command drafts, preflight checks, approval gates, verification, and rollback. Do not execute or claim execution."
            : "SSH/Codex Bridge is not selected.",
      },
      businessFreshness,
      outletSnapshot: snapshot.summary,
      liveBusinessContext: {
        dashboard,
        menu: summarizeMenu(menuItems),
        lowStockItems: summarizeInventory(inventory),
        stockMovements: stockMovements.slice(0, 12),
        kitchenRisk: summarizeKitchen(kitchen),
        finance: {
          cashSession: finance.cashSession,
          guard: finance.guard,
          today: finance.today,
          profitLoss: finance.profitLoss,
          supplierPayables: finance.supplierPayables,
          paymentSettlement: finance.paymentSettlement,
          alerts: finance.alerts,
        },
        pendingApprovals: approvals.slice(0, 10),
        customers: summarizeCustomers(customers),
        aiActivity: aiTelemetry,
        reports: {
          latestAudit: reportAudit.rows[0] ?? null,
          exportMode: "excel_download",
          googleDrive: "disabled",
        },
        knowledgeBase: knowledgeBaseConfigured
          ? "openai_file_search_enabled"
          : "not_configured",
        ...(toolFocus === "ssh_codex_bridge" ? { sshCodexControl } : {}),
      },
      safetyBoundary:
        "Do not expose API keys, env values, private keys, SSH private keys, passwords, host secrets, Google credentials, or provider secrets. Do not execute SSH commands, refund, void, large discount, cash closing, stock adjustment final, purchase order final, price/menu change, or other critical POS actions; create draft/approval recommendations only.",
    },
    intent,
    profile,
    dataAccessLevel,
    decisionMessage: message,
    contextModules,
    snapshotUsed: snapshot.snapshotUsed,
    deterministicResponse: null,
  };
}

function deterministicResponseFor(
  message: string,
  session: GarageSession,
  intent: AiAgentIntent,
  dataAccessLevel: AiDataAccessLevel,
  profile: AiProviderProfile,
) {
  const text = message.toLowerCase();
  if (!hasAny(text, helpWords) && !text.includes("siapa saya") && !text.includes("role")) {
    return null;
  }

  if (text.includes("siapa saya") || text.includes("role")) {
    return {
      response: `Siap, saya cek identitas sesi dulu. Anda login sebagai ${session.profile.role} di ${session.profile.outlet.name}, ${session.profile.shiftLabel}, perangkat ${session.profile.deviceLabel}.`,
      intent: "general_assist",
      urgency: "low",
      confidence: 1,
      requiresApproval: false,
      requiresHumanApproval: false,
      suggestedActions: [],
      operationalWarnings: [],
      contextUsed: ["user"],
      nextStep: "Gunakan prompt spesifik seperti stok, kitchen, finance, approval, atau daily brief.",
      dataAccessLevel,
      actionDrafts: [],
      profile,
      contextIntent: intent,
      providerUsed: "system",
      modelUsed: "deterministic",
      fallbackUsed: false,
      latencyMs: 0,
      tokenUsage: null,
    } satisfies AiPosAgentResponse;
  }

  return {
    response:
      "Siap, GARAGE AI bisa bantu baca situasi outlet dengan cepat: cart review, upsell, stok, kitchen delay, finance guard, approval assistant, daily brief, dan SOP Knowledge Base jika vector store sudah dikonfigurasi.",
    intent: "general_assist",
    urgency: "low",
    confidence: 1,
    requiresApproval: false,
    requiresHumanApproval: false,
    suggestedActions: [
      "Tanya: Cek stok kritis hari ini.",
      "Tanya: Ringkas kitchen delay dan prioritas tindakan.",
      "Tanya: Buat daily brief untuk owner.",
    ],
    operationalWarnings: [],
    contextUsed: ["capabilities"],
    nextStep: "Pilih salah satu quick prompt atau ketik pertanyaan operasional spesifik.",
    dataAccessLevel,
    actionDrafts: [],
    profile,
    contextIntent: intent,
    providerUsed: "system",
    modelUsed: "deterministic",
    fallbackUsed: false,
    latencyMs: 0,
    tokenUsage: null,
  } satisfies AiPosAgentResponse;
}

export async function buildGarageAiContext({
  message,
  orderType,
  cart,
  session,
}: BuildGarageAiContextInput): Promise<GarageAiContextResult> {
  const userCommand = extractUserCommand(message);
  const intent = classifyGarageAiIntent(userCommand, cart);
  const dataAccessLevel = accessForRole(session.profile.role, intent);
  const profile = profileForIntent(intent, dataAccessLevel);
  const deterministicResponse = deterministicResponseFor(
    userCommand,
    session,
    intent,
    dataAccessLevel,
    profile,
  );
  if (deterministicResponse) {
    return {
      context: {
        intent,
        profile,
        dataAccessLevel,
        contextModules: ["user", "request"],
        user: {
          role: session.profile.role,
          outlet: session.profile.outlet.name,
          shift: session.profile.shiftLabel,
          device: session.profile.deviceLabel,
        },
        request: {
          message: userCommand,
          ...(userCommand !== message ? { roleScopedMessage: message } : {}),
          orderType,
          cartLineCount: cart.length,
        },
      },
      intent,
      profile,
      dataAccessLevel,
      decisionMessage: userCommand,
      contextModules: ["user", "request"],
      snapshotUsed: false,
      deterministicResponse,
    };
  }

  const modules = requestedModules(intent, session.profile.role, cart);
  const contextModules: string[] = Array.from(modules);
  const requestContext: Record<string, unknown> = {
    message: userCommand,
    orderType,
    cartLineCount: cart.length,
  };
  if (userCommand !== message) {
    requestContext.roleScopedMessage = message;
  }
  const context: Record<string, unknown> = {
    intent,
    profile,
    dataAccessLevel,
    contextModules,
    user: {
      role: session.profile.role,
      outlet: session.profile.outlet.name,
      shift: session.profile.shiftLabel,
      device: session.profile.deviceLabel,
    },
    request: requestContext,
  };
  let snapshotUsed = false;

  if (modules.has("cart")) {
    const cartSnapshot = await buildCartSnapshot(cart);
    const subtotal = cartSnapshot.reduce((sum, line) => sum + line.lineTotal, 0);
    requestContext.cart = cartSnapshot;
    requestContext.subtotal = subtotal;
    requestContext.service = Math.round(subtotal * 0.05);
    requestContext.tax = Math.round(subtotal * 0.11);
    requestContext.estimatedTotal = Math.round(subtotal * 1.16);
  }

  if (modules.has("snapshot")) {
    const snapshot = await getOrCreateSnapshot(session, intent, dataAccessLevel);
    context.outletSnapshot = snapshot.summary;
    snapshotUsed = snapshot.snapshotUsed;
  }

  if (modules.has("inventory") && !modules.has("snapshot")) {
    context.lowStockItems = summarizeInventory(await getInventoryData());
  }

  if (modules.has("kitchen") && !modules.has("snapshot")) {
    context.kitchenRisk = summarizeKitchen(await getKitchenData());
  }

  if (modules.has("finance") && !modules.has("snapshot")) {
    const [finance, brief] = await Promise.all([
      getFinanceGuardSummary(),
      getFinanceBrief(),
    ]);
    context.finance = {
      cashSession: finance.cashSession,
      guard: finance.guard,
      today: finance.today,
      profitLoss: finance.profitLoss,
      supplierPayables: finance.supplierPayables,
      paymentSettlement: finance.paymentSettlement,
      bomCoverage: finance.bomCoverage,
      alerts: finance.alerts,
      ownerBrief: {
        headline: brief.headline,
        closingReady: brief.closingReady,
        closingProgress: brief.closingProgress,
        nextActions: brief.nextActions,
      },
    };
  }

  if (modules.has("approvals") && !modules.has("snapshot")) {
    context.pendingApprovals = (await getApprovalData({ status: "pending" })).slice(0, 8);
  }

  if (modules.has("sop_knowledge")) {
    context.sopKnowledgeBase = process.env.OPENAI_GARAGE_VECTOR_STORE_ID
      ? "openai_file_search_enabled"
      : "not_configured";
  }

  if (!canAccessFinance(session.profile.role) && intent === "finance_check") {
    context.finance = "hidden_by_role";
    context.operationalBoundary =
      "User role cannot access financial details. Give a safe operational summary and route to Manager/Owner.";
  }

  if (!canAccessApprovals(session.profile.role) && intent === "approval_assist") {
    context.pendingApprovals = "hidden_by_role";
    context.operationalBoundary =
      "User role cannot access approval details. Explain that Manager/Owner must review approvals.";
  }

  return {
    context,
    intent,
    profile,
    dataAccessLevel,
    decisionMessage: userCommand,
    contextModules,
    snapshotUsed,
    deterministicResponse,
  };
}
