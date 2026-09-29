import { and, inArray, lt } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/db";
import { approvals, chatMessages } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";
import { APPROVAL_MIN_RETENTION_DAYS, APPROVAL_DONE_STATUSES } from "@/lib/purge-policy";

export const runtime = "nodejs";

// Cron bulanan: hanya chat internal. Order/penjualan TIDAK PERNAH dihapus;
// persetujuan hanya bila retensi >= batas minimum (bukti kontrol keuangan).
async function runPurge(retentionDays: number) {
  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const a =
    retentionDays >= APPROVAL_MIN_RETENTION_DAYS
      ? await db
          .delete(approvals)
          .where(and(lt(approvals.createdAt, cutoff), inArray(approvals.status, APPROVAL_DONE_STATUSES)))
          .returning({ id: approvals.id })
      : [];
  const c = await db
    .delete(chatMessages)
    .where(lt(chatMessages.createdAt, cutoff))
    .returning({ id: chatMessages.id });

  return ok({
    job: "admin-purge",
    retentionDays,
    cutoff: cutoff.toISOString(),
    counts: { orders: 0, approvals: a.length, chatMessages: c.length },
  });
}

export async function GET(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const retentionDays = Math.max(
    7,
    Math.min(3650, Number(url.searchParams.get("retentionDays") ?? 30) || 30),
  );
  return runPurge(retentionDays);
}

export async function POST(request: Request) {
  return GET(request);
}