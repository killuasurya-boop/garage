import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";

type SocialAuditInput = {
  actor?: string | null;
  action: string;
  object: string;
  status?: "recorded" | "success" | "failed" | "blocked";
  metadata?: Record<string, unknown>;
};

function timeLabel() {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour12: false,
  });
}

export async function recordSocialAudit(input: SocialAuditInput) {
  await getDb().insert(auditLogs).values({
    time: timeLabel(),
    actor: input.actor || "system",
    action: input.action,
    object: input.object,
    device: "GARAGE OS Publisher",
    status: input.status ?? "recorded",
    metadata: input.metadata ?? {},
  });
}

export function auditSafely(input: SocialAuditInput) {
  void recordSocialAudit(input).catch(() => null);
}
