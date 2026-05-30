import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiActionDrafts,
  aiAgentEvents,
  aiAgentRuns,
  auditLogs,
} from "@/db/schema";
import { ok } from "@/lib/api-response";
import { garageAiLogRetentionPolicy } from "@/lib/garage-ai-log-retention";
import { getAiProviderPublicConfigs } from "@/lib/garage-ai-providers";
import type { AiGarageAiHealthResponse } from "@/lib/garage-api-types";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function maskVectorStoreId(value: string | undefined) {
  const clean = value?.trim();
  if (!clean) {
    return null;
  }

  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function setupStatus(input: {
  providerReady: number;
  providerConfigured: number;
  knowledgeConfigured: boolean;
  cronConfigured: boolean;
  encryptionConfigured: boolean;
  databaseOk: boolean;
}): AiGarageAiHealthResponse["setup"] {
  return [
    {
      id: "provider" as const,
      label: "Provider AI",
      status: input.providerReady
        ? "ready"
        : input.providerConfigured
          ? "error"
          : "setup",
      detail: input.providerReady
        ? `${input.providerReady} provider siap dipakai.`
        : input.providerConfigured
          ? "Key tersimpan, tetapi provider belum ready."
          : "Belum ada provider AI ready.",
      nextStep: input.providerReady
        ? "Gunakan fallback priority sesuai kebutuhan."
        : "Buka Provider AI, isi key, lalu Simpan & connect.",
    },
    {
      id: "knowledge" as const,
      label: "Knowledge Base",
      status: input.knowledgeConfigured ? "ready" : "setup",
      detail: input.knowledgeConfigured
        ? "Vector store GARAGE sudah terhubung."
        : "OPENAI_GARAGE_VECTOR_STORE_ID belum tersedia.",
      nextStep: input.knowledgeConfigured
        ? "Upload SOP/PRD/Excel dari CEO Brain."
        : "Isi vector store ID lalu upload dokumen Office.",
    },
    {
      id: "drive" as const,
      label: "Export Excel",
      status: "ready",
      detail: "Download/export Excel manual aktif. Google Drive dinonaktifkan.",
      nextStep: "Gunakan panel Agents Report untuk export harian, bulanan, atau tahunan.",
    },
    {
      id: "cron" as const,
      label: "Cron Job",
      status: input.cronConfigured ? "ready" : "setup",
      detail: input.cronConfigured
        ? "GARAGE_JOB_SECRET/CRON_SECRET aktif."
        : "Job secret belum tersedia.",
      nextStep: input.cronConfigured
        ? "Cron auto report dapat dipakai."
        : "Isi GARAGE_JOB_SECRET atau CRON_SECRET.",
    },
    {
      id: "encryption" as const,
      label: "Encryption Key",
      status: input.encryptionConfigured ? "ready" : "error",
      detail: input.encryptionConfigured
        ? "API key provider bisa dienkripsi server-side."
        : "AI_CONFIG_ENCRYPTION_KEY belum ada.",
      nextStep: input.encryptionConfigured
        ? "Tidak perlu aksi."
        : "Isi AI_CONFIG_ENCRYPTION_KEY minimal 32 karakter.",
    },
    {
      id: "database" as const,
      label: "Database",
      status: input.databaseOk ? "ready" : "error",
      detail: input.databaseOk
        ? "Drizzle/Postgres bisa dibaca."
        : "Database tidak bisa dibaca.",
      nextStep: input.databaseOk
        ? "Tidak perlu aksi."
        : "Cek DATABASE_URL dan migration.",
    },
    {
      id: "auto_fix" as const,
      label: "Auto Fix",
      status: input.databaseOk ? "ready" : "error",
      detail: input.databaseOk
        ? "Auto Fix aman siap untuk config/log/provider."
        : "Auto Fix membutuhkan database aktif.",
      nextStep: input.databaseOk
        ? "Jalankan dari Setup atau Doctor bila ada issue."
        : "Pulihkan database lebih dulu.",
    },
  ];
}

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO", "Admin", "Manager Operasional"]);
  if (session.response) {
    return session.response;
  }

  const db = getDb();
  let databaseOk = true;
  let recentRuns: Array<typeof aiAgentRuns.$inferSelect> = [];
  let recentEvents: Array<typeof aiAgentEvents.$inferSelect> = [];
  let recentAudit: Array<typeof auditLogs.$inferSelect> = [];
  let pendingActions: Array<typeof aiActionDrafts.$inferSelect> = [];

  try {
    [recentRuns, recentEvents, recentAudit, pendingActions] = await Promise.all([
      db.select().from(aiAgentRuns).orderBy(desc(aiAgentRuns.createdAt)).limit(200),
      db.select().from(aiAgentEvents).orderBy(desc(aiAgentEvents.createdAt)).limit(120),
      db.select().from(auditLogs).limit(200),
      db
        .select()
        .from(aiActionDrafts)
        .where(eq(aiActionDrafts.approvalStatus, "pending"))
        .limit(100),
    ]);
  } catch {
    databaseOk = false;
  }

  const providers = databaseOk ? await getAiProviderPublicConfigs().catch(() => []) : [];
  const retention = garageAiLogRetentionPolicy();
  const providerReady = providers.filter(
    (provider) =>
      provider.enabled &&
      provider.keyStatus === "configured" &&
      provider.lastStatus === "ready",
  ).length;
  const providerConfigured = providers.filter(
    (provider) => provider.keyStatus === "configured",
  ).length;
  const providerRequestCount = providers.reduce(
    (sum, provider) => sum + (provider.health?.requestCount ?? 0),
    0,
  );
  const providerFallbackCount = providers.reduce(
    (sum, provider) => sum + (provider.health?.fallbackCount ?? 0),
    0,
  );
  const providerErrorRate = providerRequestCount
    ? providers.reduce((sum, provider) => {
        const requestCount = provider.health?.requestCount ?? 0;
        return sum + requestCount * (provider.health?.errorRate ?? 0);
      }, 0) / providerRequestCount
    : 0;
  const p95LatencyMs =
    providers
      .map((provider) => provider.health?.p95LatencyMs)
      .filter((latency): latency is number => typeof latency === "number")
      .sort((a, b) => b - a)[0] ?? null;
  const tokenUsageTotal = recentRuns.reduce(
    (sum, run) => sum + (run.tokenUsage?.totalTokens ?? 0),
    0,
  );
  const knowledgeUploadCount = recentAudit.filter((log) =>
    log.action.toLowerCase().includes("knowledge"),
  ).length;
  const reportGeneratedCount = recentAudit.filter((log) =>
    log.action.toLowerCase().includes("report"),
  ).length;
  const reportUploadedCount = recentAudit.filter(
    (log) =>
      log.action.toLowerCase().includes("report") && log.status === "uploaded",
  ).length;
  const autoFixEventCount = recentEvents.filter(
    (event) =>
      event.eventType.includes("auto") ||
      event.eventType.includes("heal") ||
      event.eventType.includes("fix"),
  ).length;
  const cronConfigured = Boolean(
    process.env.GARAGE_JOB_SECRET?.trim() || process.env.CRON_SECRET?.trim(),
  );
  const encryptionConfigured = Boolean(process.env.AI_CONFIG_ENCRYPTION_KEY?.trim());
  const knowledgeConfigured = Boolean(
    process.env.OPENAI_GARAGE_VECTOR_STORE_ID?.trim(),
  );
  const setup = setupStatus({
    providerReady,
    providerConfigured,
    knowledgeConfigured,
    cronConfigured,
    encryptionConfigured,
    databaseOk,
  });
  const hasError = setup.some((item) => item.status === "error");
  const hasSetup = setup.some((item) => item.status === "setup");
  const status = hasError ? "critical" : hasSetup ? "watch" : "ready";

  return ok({
    ok: databaseOk && !hasError,
    generatedAt: new Date().toISOString(),
    status,
    setup,
    observability: {
      providerRequestCount,
      providerFallbackCount,
      providerErrorRate: Number(providerErrorRate.toFixed(4)),
      p95LatencyMs,
      tokenUsageTotal,
      reportGeneratedCount,
      reportUploadedCount,
      knowledgeUploadCount,
      autoFixEventCount,
    },
    drive: {
      configured: false,
      folderIdConfigured: false,
      serviceAccountConfigured: false,
      serviceAccountEmail: null,
      oauthClientConfigured: false,
      oauthConnected: false,
      oauthEmail: null,
      oauthName: null,
      authMode: "missing",
      lastStatus: null,
      lastError: null,
      lastUploadAt: null,
      redirectUri: "",
      message: "Google Drive dinonaktifkan. Gunakan export Excel manual.",
    },
    knowledgeBase: {
      configured: knowledgeConfigured,
      vectorStoreId: maskVectorStoreId(process.env.OPENAI_GARAGE_VECTOR_STORE_ID),
    },
    providers: {
      total: providers.length,
      configured: providerConfigured,
      ready: providerReady,
    },
    retention,
    pendingActions: pendingActions.length,
  } satisfies AiGarageAiHealthResponse & {
    retention: ReturnType<typeof garageAiLogRetentionPolicy>;
    pendingActions: number;
  });
}
