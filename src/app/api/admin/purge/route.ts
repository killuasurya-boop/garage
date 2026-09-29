import { and, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/db";
import { approvals, chatMessages } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/api-response";
import { requireGarageSession } from "@/lib/server-auth";
import { APPROVAL_MIN_RETENTION_DAYS, APPROVAL_DONE_STATUSES } from "@/lib/purge-policy";

export const runtime = "nodejs";

// Order/penjualan TIDAK PERNAH di-purge: itu catatan keuangan (laporan laba
// rugi, pajak, audit). Dulu target "orders" default aktif dengan retensi 30 hari
// → satu klik menghapus seluruh riwayat penjualan (temuan QA-audit, CRITICAL).
const purgeSchema = z.object({
  retentionDays: z.number().int().min(7).max(3650).default(30),
  dryRun: z.boolean().default(true),
  targets: z.array(z.enum(["approvals", "chat"])).default(["chat"]),
});

export async function POST(request: Request) {
  // Purge data = setting sistem inti -> Owner only (Manajer tidak).
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  const parsed = await readJson(request, purgeSchema);
  if (parsed.error) return parsed.error;
  const { retentionDays, dryRun, targets } = parsed.data;

  if (targets.includes("approvals") && retentionDays < APPROVAL_MIN_RETENTION_DAYS) {
    return fail(
      400,
      "APPROVAL_RETENTION_TOO_SHORT",
      `Persetujuan (void/refund/diskon/kas) adalah bukti kontrol keuangan — retensi minimal ${APPROVAL_MIN_RETENTION_DAYS} hari.`,
    );
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const result: Record<string, number> = {};

  if (targets.includes("approvals")) {
    const where = and(lt(approvals.createdAt, cutoff), inArray(approvals.status, APPROVAL_DONE_STATUSES));
    if (dryRun) {
      const rows = await db.select({ c: sql<number>`count(*)::int` }).from(approvals).where(where);
      result.approvals = Number(rows[0]?.c ?? 0);
    } else {
      const deleted = await db.delete(approvals).where(where).returning({ id: approvals.id });
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
  const session = await requireGarageSession(["Owner"]);
  if (session.response) return session.response;
  return ok({
    description:
      "POST untuk purge. Body: { retentionDays: 30, dryRun: true, targets: ['chat'] }. Order/penjualan tidak pernah dihapus.",
    defaults: {
      retentionDays: 30,
      dryRun: true,
      targets: ["chat"],
      approvalMinRetentionDays: APPROVAL_MIN_RETENTION_DAYS,
      approvalStatusesPurged: APPROVAL_DONE_STATUSES,
    },
  });
}