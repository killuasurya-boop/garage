import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { ok } from "@/lib/api-response";
import { getSystemHealth } from "@/lib/garage-health-service";
import type { GarageSession } from "@/lib/server-auth";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditResult = {
  exitCode: number;
  timedOut: false;
  output: string;
};

function formatHealthOutput(health: Awaited<ReturnType<typeof getSystemHealth>>) {
  const lines = [
    `GARAGE PRE-DEPLOY HEALTH AUDIT`,
    `Generated: ${health.readiness.generatedAt}`,
    `Status: ${health.readiness.label}`,
    `Score: ${health.readiness.score}/100`,
    `Blockers: ${health.readiness.blockers}`,
    `Warnings: ${health.readiness.warnings}`,
    ``,
    `Database: ${health.database.connectionOk ? "connected" : "disconnected"} (${health.database.latencyMs ?? "-"}ms)`,
    `Backup: ${health.backup.status} (${health.backup.latestFile ?? "no backup found"})`,
    `Security: ${health.security.status}`,
    `Operations: ${health.operations.status}`,
    `Performance: ${health.performance.status}`,
    ``,
  ];

  if (health.issueQueue.length) {
    lines.push("ACTION QUEUE:");
    for (const issue of health.issueQueue) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${issue.area}: ${issue.title}`);
      lines.push(`  Impact: ${issue.impact}`);
      lines.push(`  Action: ${issue.action}`);
    }
  } else {
    lines.push("ACTION QUEUE: no automatic blockers detected.");
  }

  lines.push("");
  lines.push("NOTE: This dashboard audit is the production-safe health gate.");
  lines.push("For full QR/LAN smoke testing, run `npm.cmd run readiness:audit` from terminal after staff login config is healthy.");

  return lines.join("\n");
}

async function writePreDeployAudit(
  session: GarageSession,
  result: AuditResult,
  status: "pass" | "fail",
) {
  try {
    await getDb().insert(auditLogs).values({
      time: new Date().toISOString(),
      actor: session.user.name ?? session.user.email,
      action: "health.readiness_audit",
      object: "pre-deploy",
      device: session.profile.deviceLabel,
      status: status === "pass" ? "ok" : "warning",
      metadata: {
        actorUserId: session.user.id,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        outputTail: result.output.slice(-4_000),
      },
    });
  } catch {
    // Audit log must not block an admin health check.
  }
}

export async function POST() {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  const health = await getSystemHealth();
  const status = health.readiness.status === "GO" ? "pass" : "fail";
  const result: AuditResult = {
    exitCode: status === "pass" ? 0 : 1,
    timedOut: false,
    output: formatHealthOutput(health),
  };

  await writePreDeployAudit(session.data, result, status);

  return ok({
    status,
    exitCode: result.exitCode,
    output: result.output,
    health,
    generatedAt: new Date().toISOString(),
  });
}
