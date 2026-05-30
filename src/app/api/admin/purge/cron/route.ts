import { and, inArray, lt } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/db";
import { orders, approvals, chatMessages } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { requireGarageAiJobAuthorization } from "@/lib/garage-ai-job-auth";

export const runtime = "nodejs";

const ORDER_DONE_STATUSES = ["paid", "completed", "cancelled", "void", "refunded"];
const APPROVAL_DONE_STATUSES = ["approved", "rejected", "cancelled"];

async function runPurge(retentionDays: number) {
  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const o = await db
    .delete(orders)
    .where(and(lt(orders.createdAt, cutoff), inArray(orders.status, ORDER_DONE_STATUSES)))
    .returning({ id: orders.id });
  const a = await db
    .delete(approvals)
    .where(and(lt(approvals.createdAt, cutoff), inArray(approvals.status, APPROVAL_DONE_STATUSES)))
    .returning({ id: approvals.id });
  const c = await db
    .delete(chatMessages)
    .where(lt(chatMessages.createdAt, cutoff))
    .returning({ id: chatMessages.id });

  return ok({
    job: "admin-purge",
    retentionDays,
    cutoff: cutoff.toISOString(),
    counts: { orders: o.length, approvals: a.length, chatMessages: c.length },
  });
}

export async function GET(request: Request) {
  const unauthorized = requireGarageAiJobAuthorization(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const retentionDays = Math.max(
    7,
    Math.min(365, Number(url.searchParams.get("retentionDays") ?? 30) || 30),
  );
  return runPurge(retentionDays);
}

export async function POST(request: Request) {
  return GET(request);
}
