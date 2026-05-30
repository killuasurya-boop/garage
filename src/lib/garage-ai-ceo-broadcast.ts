import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  outlets,
  staffProfiles,
  user,
} from "@/db/schema";
import { chatBus } from "@/lib/chat-events";
import {
  createActionDraftRecords,
} from "@/lib/garage-ai-agents";
import { runGarageAiAgent } from "@/lib/garage-ai-providers";
import type { Role } from "@/lib/garage-data";
import {
  createStaffTasks,
  type CreateStaffTaskInput,
  type StaffTaskPriority,
} from "@/lib/garage-staff-tasks";
import {
  getDailyAnomalies,
  getDashboardData,
  getFinanceGuardSummary,
  getFinanceSummary,
  getKitchenData,
  getSmartReorderSuggestions,
  getSuspiciousActivity,
} from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

export const CEO_AI_USER_ID = "garage-ceo-ai";
export const CEO_AI_NAME = "Garage CEO AI";
const CEO_AI_EMAIL = "garage-ceo-ai@internal.garage";
const ROLE_KEY_PREFIX = "role:";

// Role yang menerima broadcast. Setiap role dapat instruksi spesifik di
// formatRoleInstruction(). Tambah role di sini kalau channel-nya mau di-broadcast.
const BROADCAST_TARGETS: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
  "Gudang",
  "Kasir",
  "Barista",
  "Koki",
  "Kitchen / Barista",
  "Supervisor Shift",
];

type CeoContextBundle = {
  generatedAt: string;
  dashboard: unknown;
  finance: { summary: unknown; guard: unknown };
  inventory: { reorder: unknown };
  anomaly: unknown;
  suspicious: unknown;
  kitchen: unknown;
};

type RoleInstructionInput = {
  role: Role;
  aiResponse: string;
  warnings: string[];
  suggested: string[];
  nextStep: string;
  context: CeoContextBundle;
};

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

function bodyHash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

async function ensureCeoAiUser(): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(user).where(eq(user.id, CEO_AI_USER_ID)).limit(1);
  if (!existing) {
    await db
      .insert(user)
      .values({
        id: CEO_AI_USER_ID,
        name: CEO_AI_NAME,
        email: CEO_AI_EMAIL,
        emailVerified: true,
      })
      .onConflictDoNothing();
  }

  const [outlet] = await db
    .select()
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(outlets.createdAt)
    .limit(1);

  if (outlet) {
    await db
      .insert(staffProfiles)
      .values({
        userId: CEO_AI_USER_ID,
        outletId: outlet.id,
        role: "Owner / CEO",
        shiftLabel: "Auto",
        deviceLabel: "CEO-AI",
      })
      .onConflictDoNothing();
  }
}

async function ensureRoleChannel(role: Role): Promise<string | null> {
  const db = getDb();
  const roleKey = `${ROLE_KEY_PREFIX}${role}`;
  const [existing] = await db
    .select()
    .from(chatChannels)
    .where(and(eq(chatChannels.type, "role"), eq(chatChannels.roleKey, roleKey)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(chatChannels)
    .values({ type: "role", name: `# ${role}`, roleKey })
    .returning();
  return created?.id ?? null;
}

async function ensureCeoAiMembership(channelId: string) {
  await getDb()
    .insert(chatChannelMembers)
    .values({ channelId, userId: CEO_AI_USER_ID })
    .onConflictDoNothing();
}

async function postCeoMessage(channelId: string, body: string) {
  const hash = bodyHash(body);
  const finalBody = `${body}\n\n[hash:${hash}]`;

  await ensureCeoAiMembership(channelId);
  const db = getDb();
  const [inserted] = await db
    .insert(chatMessages)
    .values({
      channelId,
      senderUserId: CEO_AI_USER_ID,
      body: finalBody,
    })
    .returning();
  await db
    .update(chatChannels)
    .set({ lastMessageAt: inserted.createdAt, updatedAt: new Date() })
    .where(eq(chatChannels.id, channelId));

  const memberRows = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(eq(chatChannelMembers.channelId, channelId));

  chatBus.publish({
    kind: "message",
    channelId,
    memberUserIds: memberRows.map((m) => m.userId),
    message: {
      id: inserted.id,
      channelId: inserted.channelId,
      senderUserId: inserted.senderUserId,
      senderName: CEO_AI_NAME,
      body: inserted.body,
      attachmentUrl: inserted.attachmentUrl,
      attachmentType: inserted.attachmentType,
      attachmentSize: inserted.attachmentSize,
      replyToId: inserted.replyToId,
      createdAt: inserted.createdAt.toISOString(),
    },
  });
}

async function gatherCeoContext(): Promise<CeoContextBundle> {
  const [dashboard, financeSummary, financeGuard, reorder, anomaly, suspicious, kitchen] =
    await Promise.all([
      getDashboardData().catch(() => null),
      getFinanceSummary().catch(() => null),
      getFinanceGuardSummary().catch(() => null),
      getSmartReorderSuggestions({ windowDays: 14 }).catch(() => null),
      getDailyAnomalies().catch(() => null),
      getSuspiciousActivity({ windowHours: 24 }).catch(() => null),
      getKitchenData().catch(() => null),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    dashboard,
    finance: { summary: financeSummary, guard: financeGuard },
    inventory: { reorder },
    anomaly,
    suspicious,
    kitchen,
  };
}

type RolePayload = {
  message: string;
  tasks: Array<{ title: string; detail: string; priority: StaffTaskPriority }>;
};

// Per-role payload. AI executive summary jadi pembuka, lalu tiap role dapat
// tail-content yang relevan dari context bundle + tasks operasional.
function formatRoleInstruction(input: RoleInstructionInput): RolePayload | null {
  const { role, aiResponse, warnings, suggested, nextStep, context } = input;
  const header = `🎯 *Instruksi CEO AI untuk ${role}*`;
  const summary = aiResponse.trim().slice(0, 700);

  const lines: string[] = [header, "", summary];
  const addon: string[] = [];
  const tasks: RolePayload["tasks"] = [];

  if (role === "Gudang") {
    const reorder = context.inventory.reorder as
      | { suggestions: Array<{ name: string; sku: string; onHand: number; unit: string; daysUntilEmpty: number | null; suggestedReorderQty: number; riskLevel: string }> }
      | null;
    const critical = reorder?.suggestions?.filter((s) => s.riskLevel === "critical").slice(0, 5) ?? [];
    if (critical.length) {
      addon.push("", "📦 *Reorder critical:*");
      for (const s of critical) {
        const eta = s.daysUntilEmpty === null ? "—" : `${s.daysUntilEmpty}h`;
        addon.push(
          `• ${s.name} (${s.sku}) · on-hand ${s.onHand} ${s.unit} · habis ~${eta} · saran ${s.suggestedReorderQty} ${s.unit}`,
        );
        tasks.push({
          title: `Reorder ${s.name}`,
          detail: `On-hand ${s.onHand} ${s.unit} · habis ~${eta} · saran beli ${s.suggestedReorderQty} ${s.unit}. SKU ${s.sku}.`,
          priority: "high",
        });
      }
    }
  }

  if (role === "Finance / CFO" || role === "Owner / CEO") {
    const anomaly = context.anomaly as
      | { anomalies: Array<{ metric: string; todayValue: number; avg7dValue: number; deviationPct: number; severity: string; message: string }> }
      | null;
    const flagged = anomaly?.anomalies?.filter((a) => a.severity !== "info") ?? [];
    if (flagged.length) {
      addon.push("", "📊 *Anomali keuangan hari ini:*");
      for (const a of flagged) {
        const sign = a.deviationPct > 0 ? "+" : "";
        const label = a.metric === "revenue" ? "Revenue" : "Expense";
        addon.push(
          `• ${label}: ${rupiah(a.todayValue)} (${sign}${a.deviationPct}% vs avg 7d ${rupiah(a.avg7dValue)}) — ${a.message}`,
        );
        if (role === "Finance / CFO") {
          tasks.push({
            title: `Investigasi anomali ${label.toLowerCase()}`,
            detail: `${label} hari ini ${rupiah(a.todayValue)} (${sign}${a.deviationPct}% vs avg 7d ${rupiah(a.avg7dValue)}). ${a.message}`,
            priority: a.severity === "critical" ? "high" : "medium",
          });
        }
      }
    }
  }

  if (
    role === "Admin" ||
    role === "Manager Operasional" ||
    role === "Supervisor Shift" ||
    role === "Owner / CEO"
  ) {
    const suspicious = context.suspicious as
      | { flags: Array<{ kind: string; actor: string | null; count: number; severity: string }> }
      | null;
    const flags = suspicious?.flags?.slice(0, 5) ?? [];
    if (flags.length) {
      const labelByKind: Record<string, string> = {
        excess_void: "Void berlebihan",
        excess_manual_discount: "Diskon manual sering",
        unmatched_stock_out: "Stok turun non-resep",
      };
      addon.push("", "🛡️ *Suspicious activity (24 jam):*");
      for (const f of flags) {
        const icon = f.severity === "critical" ? "🔴" : "🟠";
        const label = labelByKind[f.kind] ?? f.kind;
        addon.push(`${icon} ${label} · ${f.actor ?? "—"} · ${f.count}x`);
        if (role === "Admin" || role === "Supervisor Shift") {
          tasks.push({
            title: `Audit ${label.toLowerCase()}`,
            detail: `Actor ${f.actor ?? "tidak diketahui"} terdeteksi ${f.count}x dalam 24 jam. Konfirmasi dengan kasir/staff terkait.`,
            priority: f.severity === "critical" ? "high" : "medium",
          });
        }
      }
    }
  }

  if (role === "Kasir" || role === "Barista" || role === "Koki" || role === "Kitchen / Barista") {
    if (suggested.length) {
      addon.push("", "✅ *Yang perlu dilakukan:*");
      for (const s of suggested.slice(0, 4)) {
        addon.push(`• ${s}`);
        tasks.push({ title: s.slice(0, 120), detail: s, priority: "medium" });
      }
    }
  }

  if (warnings.length && role !== "Kasir") {
    addon.push("", "⚠️ *Peringatan operasional:*");
    for (const w of warnings.slice(0, 4)) addon.push(`• ${w}`);
  }

  if (nextStep) {
    addon.push("", `➡️ *Next step:* ${nextStep}`);
  }

  const isExec =
    role === "Owner / CEO" ||
    role === "Admin" ||
    role === "Finance / CFO" ||
    role === "Manager Operasional";
  if (addon.length === 0 && !isExec) return null;

  return { message: [...lines, ...addon].join("\n"), tasks };
}

export type CeoBroadcastReport = {
  startedAt: string;
  finishedAt: string;
  posted: Array<{ channel: string; role: Role }>;
  skipped: Array<{ channel: string; role: Role; reason: string }>;
  errors: Array<{ topic: string; message: string }>;
  actionDraftsCreated: number;
  staffTasksCreated: number;
  providerUsed: string | null;
  modelUsed: string | null;
  latencyMs: number | null;
};

type RunCeoBroadcastInput = {
  session: GarageSession;
  focus?: string;
};

export async function runCeoBroadcast(input: RunCeoBroadcastInput): Promise<CeoBroadcastReport> {
  const startedAt = new Date().toISOString();
  const report: CeoBroadcastReport = {
    startedAt,
    finishedAt: startedAt,
    posted: [],
    skipped: [],
    errors: [],
    actionDraftsCreated: 0,
    staffTasksCreated: 0,
    providerUsed: null,
    modelUsed: null,
    latencyMs: null,
  };

  await ensureCeoAiUser();

  let context: CeoContextBundle;
  try {
    context = await gatherCeoContext();
  } catch (err) {
    report.errors.push({
      topic: "gather_context",
      message: err instanceof Error ? err.message : "Gagal kumpulkan context.",
    });
    report.finishedAt = new Date().toISOString();
    return report;
  }

  const ownerMessage = [
    "Kamu adalah Garage CEO AI yang sedang membuat broadcast operasional ke seluruh tim Garage.",
    "Berdasarkan context bisnis yang diberikan, buat ringkasan executive singkat (4-6 kalimat) berbahasa Indonesia kasual,",
    "berisi: kondisi bisnis terkini, 1-2 keputusan/instruksi prioritas, dan action drafts yang perlu approval (refund/void/diskon/PO/stock adjust).",
    "Jangan klaim sudah eksekusi aksi kritis. Tandai requiresHumanApproval=true bila ada aksi finansial/stok.",
    input.focus
      ? `Fokus khusus dari Owner: ${input.focus}`
      : "Tidak ada fokus khusus — gunakan judgment berdasarkan anomaly/suspicious/reorder terbesar.",
  ].join("\n");

  let aiOutput;
  try {
    aiOutput = await runGarageAiAgent({
      intent: "owner_ceo_brain",
      profile: "manager",
      dataAccessLevel: "executive",
      context: {
        mode: "ceo_broadcast",
        request: { message: ownerMessage },
        ownerName: input.session.user.name ?? input.session.user.email,
        liveBusinessContext: context,
      },
    });
  } catch (err) {
    report.errors.push({
      topic: "ai_call",
      message: err instanceof Error ? err.message : "AI provider gagal merespons.",
    });
    report.finishedAt = new Date().toISOString();
    return report;
  }

  report.providerUsed = aiOutput.providerUsed ?? null;
  report.modelUsed = aiOutput.modelUsed ?? null;
  report.latencyMs = aiOutput.latencyMs ?? null;

  const allTasks: CreateStaffTaskInput[] = [];

  for (const role of BROADCAST_TARGETS) {
    const channelId = await ensureRoleChannel(role);
    if (!channelId) {
      report.skipped.push({ channel: `# ${role}`, role, reason: "no_channel" });
      continue;
    }

    const payload = formatRoleInstruction({
      role,
      aiResponse: aiOutput.response,
      warnings: aiOutput.operationalWarnings ?? [],
      suggested: aiOutput.suggestedActions ?? [],
      nextStep: aiOutput.nextStep ?? "",
      context,
    });

    if (!payload) {
      report.skipped.push({ channel: `# ${role}`, role, reason: "no_relevant_content" });
      continue;
    }

    try {
      await postCeoMessage(channelId, payload.message);
      report.posted.push({ channel: `# ${role}`, role });

      for (const t of payload.tasks.slice(0, 4)) {
        allTasks.push({
          targetRole: role,
          title: t.title,
          detail: t.detail,
          priority: t.priority,
          source: "ceo_ai",
          sourceRunId: aiOutput.runId ?? null,
          createdBy: input.session.user.id,
        });
      }
    } catch (err) {
      report.errors.push({
        topic: `broadcast:${role}`,
        message: err instanceof Error ? err.message : "Gagal post broadcast.",
      });
    }
  }

  if (allTasks.length) {
    try {
      const created = await createStaffTasks(allTasks);
      report.staffTasksCreated = created.length;
    } catch (err) {
      report.errors.push({
        topic: "staff_tasks",
        message: err instanceof Error ? err.message : "Gagal buat staff tasks.",
      });
    }
  }

  // Drop action drafts ke Approvals queue (sesuai L4 Controlled Autonomy)
  const drafts = aiOutput.actionDrafts ?? [];
  if (drafts.length) {
    try {
      const created = await createActionDraftRecords({
        runId: aiOutput.runId ?? null,
        drafts,
        session: input.session,
      });
      report.actionDraftsCreated = created.length;
    } catch (err) {
      report.errors.push({
        topic: "action_drafts",
        message: err instanceof Error ? err.message : "Gagal buat action drafts.",
      });
    }
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
