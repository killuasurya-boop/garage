import { and, desc, eq, gt, ilike, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiAgentEvents,
  aiAgentRuns,
  aiContextSnapshots,
  auditLogs,
} from "@/db/schema";
import { createAuditLog } from "@/lib/garage-service";

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_CLEANUP_INTERVAL_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type GarageAiLogCleanupResult = {
  retentionDays: number;
  intervalDays: number;
  cutoff: string;
  deleted: {
    auditLogs: number;
    agentRuns: number;
    agentEvents: number;
    expiredSnapshots: number;
  };
  totalDeleted: number;
  skipped: boolean;
  reason: "manual" | "interval" | "recently_checked";
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export function garageAiLogRetentionPolicy() {
  return {
    retentionDays: parsePositiveInt(
      process.env.AI_LOG_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
    ),
    intervalDays: parsePositiveInt(
      process.env.AI_LOG_CLEANUP_INTERVAL_DAYS,
      DEFAULT_CLEANUP_INTERVAL_DAYS,
    ),
  };
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * MS_PER_DAY);
}

function zeroResult(input: {
  retentionDays: number;
  intervalDays: number;
  cutoff: Date;
  reason: GarageAiLogCleanupResult["reason"];
  skipped: boolean;
}): GarageAiLogCleanupResult {
  return {
    retentionDays: input.retentionDays,
    intervalDays: input.intervalDays,
    cutoff: input.cutoff.toISOString(),
    deleted: {
      auditLogs: 0,
      agentRuns: 0,
      agentEvents: 0,
      expiredSnapshots: 0,
    },
    totalDeleted: 0,
    skipped: input.skipped,
    reason: input.reason,
  };
}

export async function cleanupGarageAiLogs(input?: {
  retentionDays?: number;
  intervalDays?: number;
  actor?: string;
  device?: string;
  reason?: "manual" | "interval";
}) {
  const policy = garageAiLogRetentionPolicy();
  const retentionDays = input?.retentionDays ?? policy.retentionDays;
  const intervalDays = input?.intervalDays ?? policy.intervalDays;
  const cutoff = daysAgo(retentionDays);
  const db = getDb();

  const deletedEvents = await db
    .delete(aiAgentEvents)
    .where(lt(aiAgentEvents.createdAt, cutoff))
    .returning({ id: aiAgentEvents.id });

  const deletedRuns = await db
    .delete(aiAgentRuns)
    .where(lt(aiAgentRuns.createdAt, cutoff))
    .returning({ id: aiAgentRuns.id });

  const deletedAuditLogs = await db
    .delete(auditLogs)
    .where(
      and(
        lt(auditLogs.createdAt, cutoff),
        or(
          ilike(auditLogs.action, "%GARAGE AI%"),
          ilike(auditLogs.object, "ai_%"),
        ),
      ),
    )
    .returning({ id: auditLogs.id });

  const deletedSnapshots = await db
    .delete(aiContextSnapshots)
    .where(lt(aiContextSnapshots.expiresAt, new Date()))
    .returning({ id: aiContextSnapshots.id });

  const result: GarageAiLogCleanupResult = {
    retentionDays,
    intervalDays,
    cutoff: cutoff.toISOString(),
    deleted: {
      auditLogs: deletedAuditLogs.length,
      agentRuns: deletedRuns.length,
      agentEvents: deletedEvents.length,
      expiredSnapshots: deletedSnapshots.length,
    },
    totalDeleted:
      deletedAuditLogs.length +
      deletedRuns.length +
      deletedEvents.length +
      deletedSnapshots.length,
    skipped: false,
    reason: input?.reason ?? "manual",
  };

  await createAuditLog({
    actor: input?.actor ?? "System",
    action: "GARAGE AI log cleanup",
    object: "ai_agent_runs, ai_agent_events, audit_logs",
    device: input?.device ?? "system",
    status: result.totalDeleted > 0 ? "completed" : "recorded",
    metadata: result,
  });

  return result;
}

export async function maybeCleanupGarageAiLogs(input?: {
  actor?: string;
  device?: string;
}) {
  const policy = garageAiLogRetentionPolicy();
  const checkedSince = daysAgo(policy.intervalDays);
  const cutoff = daysAgo(policy.retentionDays);

  const [recentCleanup] = await getDb()
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "GARAGE AI log cleanup"),
        gt(auditLogs.createdAt, checkedSince),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  if (recentCleanup) {
    return zeroResult({
      retentionDays: policy.retentionDays,
      intervalDays: policy.intervalDays,
      cutoff,
      reason: "recently_checked",
      skipped: true,
    });
  }

  return cleanupGarageAiLogs({
    retentionDays: policy.retentionDays,
    intervalDays: policy.intervalDays,
    actor: input?.actor ?? "System",
    device: input?.device ?? "system",
    reason: "interval",
  });
}
