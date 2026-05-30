import { and, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/db";
import { orders, approvals, chatMessages } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const purgeSchema = z.object({
  retentionDays: z.number().int().min(7).max(365).default(30),
  dryRun: z.boolean().default(true),
  targets: z
    .array(z.enum(["orders", "approvals", "chat"]))
    .default(["orders", "approvals", "chat"]),
});

const ORDER_DONE_STATUSES = ["paid", "completed", "cancelled", "void", "refunded"];
const APPROVAL_DONE_STATUSES = ["approved", "rejected", "cancelled"];

export async function POST(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, purgeSchema);
  if (parsed.error) return parsed.error;
  const { retentionDays, dryRun, targets } = parsed.data;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const result: Record<string, number> = {};

  if (targets.includes("orders")) {
    if (dryRun) {
      const rows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(lt(orders.createdAt, cutoff), inArray(orders.status, ORDER_DONE_STATUSES)));
      result.orders = Number(rows[0]?.c ?? 0);
    } else {
      const deleted = await db
        .delete(orders)
        .where(and(lt(orders.createdAt, cutoff), inArray(orders.status, ORDER_DONE_STATUSES)))
        .returning({ id: orders.id });
      result.orders = deleted.length;
    }
  }

  if (targets.includes("approvals")) {
    if (dryRun) {
      const rows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(approvals)
        .where(and(lt(approvals.createdAt, cutoff), inArray(approvals.status, APPROVAL_DONE_STATUSES)));
      result.approvals = Number(rows[0]?.c ?? 0);
    } else {
      const deleted = await db
        .delete(approvals)
        .where(and(lt(approvals.createdAt, cutoff), inArray(approvals.status, APPROVAL_DONE_STATUSES)))
        .returning({ id: approvals.id });
      result.approvals = deleted.length;
    }
  }

  if (targets.includes("chat")) {
    if (dryRun) {
      const rows = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(lt(chatMessages.createdAt, cutoff));
      result.chatMessages = Number(rows[0]?.c ?? 0);
    } else {
      const deleted = await db
        .delete(chatMessages)
        .where(lt(chatMessages.createdAt, cutoff))
        .returning({ id: chatMessages.id });
      result.chatMessages = deleted.length;
    }
  }

  return ok({
    dryRun,
    retentionDays,
    cutoff: cutoff.toISOString(),
    counts: result,
    note: dryRun
      ? "DRY RUN — tidak ada data yang dihapus. Set dryRun:false untuk eksekusi."
      : "Data lebih lama dari cutoff sudah dihapus permanen.",
  });
}

export async function GET() {
  return ok({
    description:
      "POST untuk purge. Body: { retentionDays: 30, dryRun: true, targets: ['orders','approvals','chat'] }.",
    defaults: {
      retentionDays: 30,
      dryRun: true,
      targets: ["orders", "approvals", "chat"],
      orderStatusesPurged: ORDER_DONE_STATUSES,
      approvalStatusesPurged: APPROVAL_DONE_STATUSES,
    },
  });
}
