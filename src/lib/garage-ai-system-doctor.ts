import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiActionDrafts,
  aiAgentConfigs,
  aiAgentEvents,
  aiAgentRuns,
} from "@/db/schema";
import { ensureAiAgentSetup } from "@/lib/garage-ai-agents";
import {
  garageAiLogRetentionPolicy,
  maybeCleanupGarageAiLogs,
} from "@/lib/garage-ai-log-retention";
import {
  autoFixAiProviderConfigs,
  getAiProviderPublicConfigs,
} from "@/lib/garage-ai-providers";
import type {
  AiProviderPublicConfig,
  AiSystemDoctorDeveloperDiagnosis,
  AiSystemDoctorExecutionLog,
  AiSystemDoctorFix,
  AiSystemDoctorIssue,
  AiSystemDoctorResponse,
} from "@/lib/garage-api-types";
import { createAuditLog } from "@/lib/garage-service";

type SystemDoctorInput = {
  autoHeal?: boolean;
  actor?: string;
  device?: string;
};

const guardrails = [
  "Tidak mengeksekusi refund, void, discount besar, closing cash, stock adjustment final, PO final, atau perubahan menu tanpa approval manusia.",
  "Tidak menampilkan API key, private key, service account, token, atau secret internal.",
  "Auto-heal hanya untuk tindakan aman: setup agent default, cleanup log lama, audit event, dan diagnosis konfigurasi.",
];

function providerReady(provider: AiProviderPublicConfig) {
  return (
    provider.enabled &&
    provider.keyStatus === "configured" &&
    provider.lastStatus === "ready"
  );
}

function addIssue(
  issues: AiSystemDoctorIssue[],
  issue: Omit<AiSystemDoctorIssue, "autoFixed"> & { autoFixed?: boolean },
) {
  issues.push({
    ...issue,
    autoFixed: issue.autoFixed ?? false,
  });
}

function issueWeight(issue: AiSystemDoctorIssue) {
  if (issue.severity === "critical") {
    return 25;
  }

  if (issue.severity === "warning") {
    return 10;
  }

  return 3;
}

function systemStatus(score: number, issues: AiSystemDoctorIssue[]) {
  if (issues.some((issue) => issue.severity === "critical")) {
    return "critical" as const;
  }

  if (score < 90 || issues.some((issue) => issue.severity === "warning")) {
    return "watch" as const;
  }

  return "healthy" as const;
}

function healthColorFor(status: AiSystemDoctorResponse["status"]) {
  if (status === "healthy") {
    return "green" as const;
  }

  if (status === "watch") {
    return "yellow" as const;
  }

  return "red" as const;
}

function doctorLog(
  executionLog: AiSystemDoctorExecutionLog[],
  step: string,
  status: AiSystemDoctorExecutionLog["status"],
  detail: string,
) {
  executionLog.push({
    step,
    status,
    detail,
    timestamp: new Date().toISOString(),
  });
}

function envReady(name: string) {
  return Boolean(process.env[name]?.trim());
}

function buildProviderIssues(
  providers: AiProviderPublicConfig[],
  issues: AiSystemDoctorIssue[],
) {
  const configured = providers.filter((provider) => provider.keyStatus === "configured");
  const ready = providers.filter(providerReady);
  const enabled = providers.filter((provider) => provider.enabled);

  if (!configured.length) {
    addIssue(issues, {
      id: "provider-no-key",
      area: "provider",
      title: "Belum ada provider AI dengan key",
      detail: "GARAGE AI tidak bisa menjawab kalau semua provider belum punya API key.",
      severity: "critical",
      autoFixAvailable: false,
      nextStep: "Isi minimal OpenAI atau DeepSeek dari Provider AI, lalu klik Test key.",
    });
    return;
  }

  if (!ready.length) {
    addIssue(issues, {
      id: "provider-no-ready",
      area: "provider",
      title: "Provider AI belum ready",
      detail: "Ada key tersimpan, tetapi belum ada provider aktif dengan status hijau ready.",
      severity: "critical",
      autoFixAvailable: false,
      nextStep: "Buka Provider AI, test provider satu per satu, lalu aktifkan fallback.",
    });
  }

  for (const provider of enabled) {
    if (provider.keyStatus === "missing") {
      addIssue(issues, {
        id: `provider-${provider.provider}-missing-key`,
        area: "provider",
        title: `${provider.label} aktif tanpa key`,
        detail: "Provider aktif tetapi key belum tersedia, sehingga akan dilewati router.",
        severity: "warning",
        autoFixAvailable: false,
        nextStep: "Isi key atau nonaktifkan provider dari Provider AI.",
      });
    }

    if (provider.lastStatus === "limited") {
      addIssue(issues, {
        id: `provider-${provider.provider}-limited`,
        area: "provider",
        title: `${provider.label} sedang limit`,
        detail: provider.lastError ?? "Provider mengembalikan rate limit atau quota limit.",
        severity: ready.length ? "warning" : "critical",
        autoFixAvailable: false,
        nextStep: "Turunkan priority provider ini atau pakai fallback provider yang ready.",
      });
    }

    if (provider.keyStatus === "configured" && provider.lastStatus === "error") {
      addIssue(issues, {
        id: `provider-${provider.provider}-error`,
        area: "provider",
        title: `${provider.label} error`,
        detail: provider.lastError ?? "Provider terakhir gagal dites atau gagal dipanggil.",
        severity: providerReady(provider) ? "info" : "warning",
        autoFixAvailable: false,
        nextStep: "Klik Test key dan cek base URL, model, key, atau quota.",
      });
    }
  }
}

async function runSafeHeal(
  input: SystemDoctorInput,
  fixes: AiSystemDoctorFix[],
  executionLog: AiSystemDoctorExecutionLog[],
) {
  try {
    doctorLog(
      executionLog,
      "Seeding agent registry",
      "running",
      "Memastikan supervisor, sub-agent, dan action registry default tersedia.",
    );
    await ensureAiAgentSetup();
    fixes.push({
      id: "ensure-agent-setup",
      title: "Agent registry diverifikasi",
      status: "completed",
      detail: "Konfigurasi agent dan action registry default dipastikan tersedia.",
    });
    doctorLog(
      executionLog,
      "Seeding agent registry",
      "completed",
      "Agent registry diverifikasi tanpa mengubah transaksi POS.",
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Setup agent gagal.";
    fixes.push({
      id: "ensure-agent-setup",
      title: "Agent registry gagal diverifikasi",
      status: "failed",
      detail,
    });
    doctorLog(executionLog, "Seeding agent registry", "failed", detail);
  }

  try {
    doctorLog(
      executionLog,
      "Cleaning old logs",
      "running",
      "Mengecek retensi log GARAGE AI dan audit terkait.",
    );
    const cleanup = await maybeCleanupGarageAiLogs({
      actor: input.actor ?? "System Doctor",
      device: input.device ?? "system",
    });
    const detail = cleanup.skipped
      ? "Cleanup belum perlu dijalankan karena baru dicek."
      : `${cleanup.totalDeleted} log lama/snapshot expired dibersihkan.`;
    fixes.push({
      id: "log-retention",
      title: "Log retention dicek",
      status: cleanup.skipped ? "skipped" : "completed",
      detail,
    });
    doctorLog(
      executionLog,
      "Cleaning old logs",
      cleanup.skipped ? "skipped" : "completed",
      detail,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Cleanup log gagal.";
    fixes.push({
      id: "log-retention",
      title: "Log retention gagal",
      status: "failed",
      detail,
    });
    doctorLog(executionLog, "Cleaning old logs", "failed", detail);
  }

  try {
    doctorLog(
      executionLog,
      "Normalizing provider config",
      "running",
      "Memeriksa base URL, model, priority, enabled flag, dan status provider.",
    );
    const providerFix = await autoFixAiProviderConfigs();
    const completed = providerFix.fixes.filter((fix) => fix.status === "completed").length;
    const detail = completed
      ? `${completed} provider dinormalisasi tanpa mengubah API key.`
      : "Konfigurasi provider sudah normal.";
    fixes.push({
      id: "provider-auto-fix",
      title: "Provider config dinormalisasi",
      status: completed ? "completed" : "skipped",
      detail,
    });
    doctorLog(
      executionLog,
      "Normalizing provider config",
      completed ? "completed" : "skipped",
      detail,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Auto Fix Provider gagal.";
    fixes.push({
      id: "provider-auto-fix",
      title: "Provider config gagal dinormalisasi",
      status: "failed",
      detail,
    });
    doctorLog(executionLog, "Normalizing provider config", "failed", detail);
  }
}

function buildDeveloperDiagnosis(
  issues: AiSystemDoctorIssue[],
  fixes: AiSystemDoctorFix[],
): AiSystemDoctorDeveloperDiagnosis[] {
  const issueDiagnosis = issues
    .filter((issue) => issue.severity === "critical" || issue.severity === "warning")
    .slice(0, 6)
    .map((issue) => ({
      area: issue.area,
      severity: issue.severity,
      finding: issue.title,
      recommendedFix: issue.autoFixAvailable
        ? "Jalankan Auto-Heal aman. Jika tetap gagal, cek route/API dan konfigurasi area ini."
        : issue.nextStep,
    }));
  const failedFixDiagnosis = fixes
    .filter((fix) => fix.status === "failed")
    .slice(0, 4)
    .map((fix) => ({
      area: "auto_heal",
      severity: "warning" as const,
      finding: fix.title,
      recommendedFix: fix.detail,
    }));

  return [...issueDiagnosis, ...failedFixDiagnosis];
}

async function recordSystemDoctorEvent(input: {
  response: AiSystemDoctorResponse;
  actor?: string;
  device?: string;
}) {
  const metadata = {
    status: input.response.status,
    score: input.response.score,
    autoHealMode: input.response.autoHealMode,
    issueCount: input.response.issues.length,
    fixes: input.response.fixes.map((fix) => ({
      id: fix.id,
      status: fix.status,
    })),
  };

  await Promise.allSettled([
    getDb().insert(aiAgentEvents).values({
      runId: null,
      agentId: "system_doctor",
      eventType: input.response.autoHealMode
        ? "system_doctor_auto_heal"
        : "system_doctor_scan",
      message: `System Doctor ${input.response.status} / score ${input.response.score}`,
      metadata,
    }),
    createAuditLog({
      actor: input.actor ?? "System Doctor",
      action: input.response.autoHealMode
        ? "GARAGE AI system doctor auto heal"
        : "GARAGE AI system doctor scan",
      object: "garage_ai_system",
      device: input.device ?? "system",
      status: input.response.status === "critical" ? "warning" : "recorded",
      metadata,
    }),
  ]);
}

export async function runGarageAiSystemDoctor(
  input: SystemDoctorInput = {},
): Promise<AiSystemDoctorResponse> {
  const autoHealMode = Boolean(input.autoHeal);
  const issues: AiSystemDoctorIssue[] = [];
  const fixes: AiSystemDoctorFix[] = [];
  const executionLog: AiSystemDoctorExecutionLog[] = [];

  doctorLog(
    executionLog,
    "Scanning provider router",
    "running",
    "Membaca konfigurasi provider aktif, fallback, status key, dan health terakhir.",
  );

  if (autoHealMode) {
    await runSafeHeal(input, fixes, executionLog);
  }

  const db = getDb();
  const retention = garageAiLogRetentionPolicy();
  const knowledgeReady = envReady("OPENAI_GARAGE_VECTOR_STORE_ID");
  const jobSecretReady = envReady("GARAGE_JOB_SECRET") || envReady("CRON_SECRET");

  doctorLog(
    executionLog,
    "Checking DB health",
    "running",
    "Membaca agent config, run log, event log, action draft, dan provider public config.",
  );

  const [
    providers,
    agentRows,
    recentRuns,
    recentEvents,
    pendingActions,
  ] = await Promise.all([
    getAiProviderPublicConfigs(),
    db.select().from(aiAgentConfigs).orderBy(aiAgentConfigs.sortOrder),
    db.select().from(aiAgentRuns).orderBy(desc(aiAgentRuns.createdAt)).limit(40),
    db.select().from(aiAgentEvents).orderBy(desc(aiAgentEvents.createdAt)).limit(40),
    db
      .select()
      .from(aiActionDrafts)
      .where(eq(aiActionDrafts.approvalStatus, "pending"))
      .orderBy(desc(aiActionDrafts.createdAt))
      .limit(80),
  ]);

  doctorLog(
    executionLog,
    "Checking DB health",
    "completed",
    "Database GARAGE AI bisa dibaca dan health data tersedia.",
  );

  doctorLog(
    executionLog,
    "Scanning provider router",
    "completed",
    `${providers.filter(providerReady).length}/${providers.length} provider ready.`,
  );

  const activeAgents = agentRows.filter((agent) => agent.enabled);
  const supervisor = agentRows.find((agent) => agent.agentId === "supervisor");
  const providerReadyCount = providers.filter(providerReady).length;
  const providerConfiguredCount = providers.filter(
    (provider) => provider.keyStatus === "configured",
  ).length;
  const recentAiErrors = recentRuns.filter(
    (run) => run.status === "failed" || Boolean(run.error),
  ).length;
  const pendingCriticalActions = pendingActions.filter(
    (action) => action.riskLevel === "high" || action.safetyLevel === "critical",
  ).length;

  if (!envReady("AI_CONFIG_ENCRYPTION_KEY")) {
    addIssue(issues, {
      id: "security-encryption-key-missing",
      area: "security",
      title: "Encryption key provider belum diset",
      detail: "API key provider tetap server-side, tetapi production perlu AI_CONFIG_ENCRYPTION_KEY agar key DB terenkripsi stabil.",
      severity: providerConfiguredCount ? "critical" : "warning",
      autoFixAvailable: false,
      nextStep: "Isi AI_CONFIG_ENCRYPTION_KEY minimal 32 karakter di env server.",
    });
  }

  buildProviderIssues(providers, issues);

  if (!agentRows.length) {
    addIssue(issues, {
      id: "agents-empty",
      area: "agents",
      title: "Agent registry kosong",
      detail: "Supervisor dan sub-agent belum tersedia di database.",
      severity: "critical",
      autoFixAvailable: true,
      autoFixed: autoHealMode && fixes.some((fix) => fix.id === "ensure-agent-setup"),
      nextStep: "Klik Auto heal untuk membuat setup agent default.",
    });
  } else if (!activeAgents.length) {
    addIssue(issues, {
      id: "agents-disabled",
      area: "agents",
      title: "Semua agent nonaktif",
      detail: "GARAGE AI masih bisa chat, tetapi multi-agent supervisor tidak bisa bekerja optimal.",
      severity: "critical",
      autoFixAvailable: false,
      nextStep: "Aktifkan minimal Supervisor, POS, Inventory, Kitchen, dan Finance Guard.",
    });
  }

  if (supervisor && !supervisor.enabled) {
    addIssue(issues, {
      id: "supervisor-disabled",
      area: "agents",
      title: "Supervisor Agent nonaktif",
      detail: "Router utama multi-agent sedang mati.",
      severity: "critical",
      autoFixAvailable: false,
      nextStep: "Aktifkan Supervisor Agent dari tab Agents.",
    });
  }

  if (!jobSecretReady) {
    addIssue(issues, {
      id: "job-secret-missing",
      area: "jobs",
      title: "Secret cron/job belum siap",
      detail: "Auto report dan scheduled job belum aman untuk dipanggil dari cron production.",
      severity: "warning",
      autoFixAvailable: false,
      nextStep: "Isi GARAGE_JOB_SECRET atau CRON_SECRET di env production.",
    });
  }

  if (!knowledgeReady) {
    addIssue(issues, {
      id: "knowledge-base-missing",
      area: "knowledge",
      title: "Knowledge Base belum terhubung",
      detail: "CEO Brain tetap membaca data POS live, tetapi SOP/PRD/resep belum otomatis dicari dari vector store.",
      severity: "warning",
      autoFixAvailable: false,
      nextStep: "Isi OPENAI_GARAGE_VECTOR_STORE_ID lalu upload SOP/PRD dari CEO Brain.",
    });
  }

  if (recentRuns.length >= 5 && recentAiErrors / recentRuns.length >= 0.3) {
    addIssue(issues, {
      id: "recent-ai-error-rate",
      area: "provider",
      title: "Error rate AI tinggi",
      detail: `${recentAiErrors} dari ${recentRuns.length} run AI terakhir gagal atau punya error.`,
      severity: "warning",
      autoFixAvailable: false,
      nextStep: "Cek Provider AI health, fallback priority, model, quota, dan base URL.",
    });
  }

  if (pendingCriticalActions > 0) {
    addIssue(issues, {
      id: "pending-critical-actions",
      area: "actions",
      title: "Ada action critical menunggu approval",
      detail: `${pendingCriticalActions} draft berisiko tinggi belum diputuskan.`,
      severity: "warning",
      autoFixAvailable: false,
      nextStep: "Buka tab Actions dan approve/reject draft critical.",
    });
  }

  const latestCleanup = recentEvents.find(
    (event) => event.agentId === "system_doctor" || event.eventType.includes("cleanup"),
  );
  if (!latestCleanup && retention.retentionDays > 7) {
    addIssue(issues, {
      id: "log-retention-long",
      area: "logs",
      title: "Retention log lebih panjang dari target V1",
      detail: `Retention saat ini ${retention.retentionDays} hari. Target operasional ringan adalah 7 hari.`,
      severity: "info",
      autoFixAvailable: true,
      autoFixed: false,
      nextStep: "Set AI_LOG_RETENTION_DAYS=7 untuk production ringan.",
    });
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      100 - issues.reduce((total, issue) => total + issueWeight(issue), 0),
    ),
  );
  doctorLog(
    executionLog,
    "Generating diagnostic report",
    "completed",
    `${issues.length} issue ditemukan, ${fixes.length} tindakan safe auto-heal tercatat.`,
  );
  doctorLog(
    executionLog,
    "Writing audit event",
    "running",
    "Mencatat hasil System Doctor ke event log dan audit log.",
  );
  const status = systemStatus(score, issues);
  const response: AiSystemDoctorResponse = {
    generatedAt: new Date().toISOString(),
    status,
    healthColor: healthColorFor(status),
    score,
    autoHealMode,
    summary: {
      providerReady: providerReadyCount,
      providerConfigured: providerConfiguredCount,
      agentActive: activeAgents.length,
      pendingCriticalActions,
      recentAiErrors,
      driveReady: true,
      jobSecretReady,
      knowledgeReady,
    },
    issues,
    fixes,
    guardrails,
    executionLog,
    developerDiagnosis: buildDeveloperDiagnosis(issues, fixes),
  };

  await recordSystemDoctorEvent({
    response,
    actor: input.actor,
    device: input.device,
  });
  doctorLog(
    executionLog,
    "Writing audit event",
    "completed",
    "Audit event System Doctor berhasil dicatat.",
  );

  return response;
}
