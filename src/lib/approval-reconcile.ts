// Audit Smart Approval Tahap B — rekonsiliasi pengajuan (tiap menit dari sweeper server, juga bisa dipanggil
// manual). Tidak pernah menghapus baris dan tidak pernah mengubah uang/stok: hanya menandai
// expired / superseded, memverifikasi pelaksanaan yang macet, dan mengirim push ke Owner.
import { and, eq, isNotNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { approvals, cashSessions, companyDocumentVersions, expenses, orders, staffProfiles } from "@/db/schema";
import type { ApprovalPayload } from "@/lib/approval-rules";
import { notificationFor, supersedeReason, verifyStuckExecution, type ReconcileSource } from "@/lib/approval-reconcile-rules";
import { createAuditLog } from "@/lib/garage-service";
import { APPROVAL_ESCALATE_AFTER_MINUTES, EXECUTION_STUCK_AFTER_MINUTES, approvalRiskTier } from "@/lib/smart-approval";

const UUID = /^[0-9a-f-]{36}$/i;
const SYSTEM_ACTOR = "Sistem / Rekonsiliasi persetujuan";

type ApprovalRow = typeof approvals.$inferSelect;

async function sourceFor(row: ApprovalRow): Promise<ReconcileSource> {
  const db = getDb();
  const payload = (row.payload ?? {}) as ApprovalPayload;
  const source: ReconcileSource = {};
  const orderId = payload.orderId ?? (row.id.startsWith("APP-VOID-") ? row.id.slice("APP-VOID-".length, "APP-VOID-".length + 36) : null);
  if (orderId && UUID.test(orderId)) {
    const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
    source.orderStatus = order?.status ?? null;
  }
  if (payload.splitChildId && UUID.test(payload.splitChildId)) {
    const [child] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, payload.splitChildId)).limit(1);
    source.splitChildStatus = child?.status ?? null;
  }
  if (payload.cashSessionId && UUID.test(payload.cashSessionId)) {
    const [cs] = await db.select({ signOff: cashSessions.managerSignOffBy }).from(cashSessions).where(eq(cashSessions.id, payload.cashSessionId)).limit(1);
    source.cashSignedOff = Boolean(cs?.signOff);
  }
  if (payload.versionId && UUID.test(payload.versionId)) {
    const [v] = await db.select({ status: companyDocumentVersions.reviewStatus }).from(companyDocumentVersions).where(eq(companyDocumentVersions.id, payload.versionId)).limit(1);
    source.documentReviewStatus = v?.status ?? null;
  }
  const expenseId = payload.expenseId ?? (row.id.startsWith("APP-EXP-") ? row.id.slice("APP-EXP-".length) : null);
  if (expenseId && UUID.test(expenseId)) {
    const [e] = await db.select({ status: expenses.status }).from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    source.expenseStatus = e?.status ?? null;
  }
  return source;
}

async function closePending(row: ApprovalRow, status: "expired" | "superseded", reason: string, now: Date) {
  const [closed] = await getDb()
    .update(approvals)
    .set({ status, reasonDecided: reason, decidedAt: now, decidedVia: "auto", decidedByName: "Sistem (otomatis)", executionStatus: "not_required", updatedAt: now })
    .where(and(eq(approvals.id, row.id), eq(approvals.status, "pending")))
    .returning({ id: approvals.id });
  if (!closed) return false;
  await createAuditLog({
    actor: SYSTEM_ACTOR,
    action: status === "expired" ? "Pengajuan kedaluwarsa" : "Pengajuan digantikan",
    object: row.id,
    device: "server",
    status,
    metadata: { approvalType: row.type, reason },
  }).catch(() => undefined);
  return true;
}

export type ReconcileResult = { expired: number; superseded: number; verified: number; uncertain: number; notified: number };

export async function reconcileApprovals(now = new Date()): Promise<ReconcileResult> {
  const db = getDb();
  const result: ReconcileResult = { expired: 0, superseded: 0, verified: 0, uncertain: 0, notified: 0 };
  const pending = await db.select().from(approvals).where(eq(approvals.status, "pending"));

  const stillPending: ApprovalRow[] = [];
  for (const row of pending) {
    if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) {
      if (await closePending(row, "expired", "Kedaluwarsa otomatis — tidak diputus dalam batas waktu.", now)) result.expired += 1;
      continue;
    }
    const reason = supersedeReason(row.id, await sourceFor(row));
    if (reason) {
      if (await closePending(row, "superseded", reason, now)) result.superseded += 1;
      continue;
    }
    stillPending.push(row);
  }

  // Pelaksanaan macet (server mati di tengah) → bukti dari objek sumber, atau "tidak pasti".
  const stuckBefore = new Date(now.getTime() - EXECUTION_STUCK_AFTER_MINUTES * 60_000);
  const stuck = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.executionStatus, "running"), isNotNull(approvals.decidedAt), lt(approvals.decidedAt, stuckBefore)));
  for (const row of stuck) {
    const outcome = verifyStuckExecution(row.id, row.status, await sourceFor(row));
    const [updated] = await db
      .update(approvals)
      .set({
        executionStatus: outcome,
        executedAt: outcome === "succeeded" ? now : null,
        executionError: outcome === "uncertain" ? "Pelaksanaan terputus; hasil tidak terbukti dari objek sumber — cek manual." : null,
        updatedAt: now,
      })
      .where(and(eq(approvals.id, row.id), eq(approvals.executionStatus, "running")))
      .returning({ id: approvals.id });
    if (!updated) continue;
    result[outcome === "succeeded" ? "verified" : "uncertain"] += 1;
    await createAuditLog({
      actor: SYSTEM_ACTOR,
      action: outcome === "succeeded" ? "Pelaksanaan terverifikasi dari objek sumber" : "Pelaksanaan tidak pasti",
      object: row.id,
      device: "server",
      status: outcome,
      metadata: { approvalType: row.type, decision: row.status },
    }).catch(() => undefined);
  }

  // Push ke Owner (dedup per pengajuan di notifyStaff): R3 segera, R2 setelah menunggu lama.
  const toNotify = stillPending
    .map((row) => ({ row, note: notificationFor({ id: row.id, tier: approvalRiskTier(row), createdAt: row.createdAt, reviewState: row.reviewState }, now.getTime(), APPROVAL_ESCALATE_AFTER_MINUTES) }))
    .filter((entry) => entry.note);
  if (toNotify.length) {
    const owners = await db
      .select({ userId: staffProfiles.userId, outletId: staffProfiles.outletId })
      .from(staffProfiles)
      .where(and(eq(staffProfiles.role, "Owner"), eq(staffProfiles.status, "active")));
    const { notifyStaff } = await import("@/lib/staff-notifications");
    for (const { row, note } of toNotify) {
      for (const owner of owners) {
        const sent = await notifyStaff({
          outletId: owner.outletId,
          audience: "user",
          userId: owner.userId,
          kind: note!.kind,
          severity: note!.severity,
          title: note!.kind === "approval_r3" ? `Persetujuan risiko tinggi: ${row.type}` : `Pengajuan menunggu > ${APPROVAL_ESCALATE_AFTER_MINUTES} menit: ${row.type}`,
          // Tanpa nama pemohon/pelanggan di push (layar kunci HP).
          body: `${row.amount} · buka Decision Center untuk memutus.`,
          url: "/control/decision",
          dedupKey: `${note!.dedupKey}:${owner.userId}`,
        }).catch(() => null);
        if (sent) result.notified += 1;
      }
    }
  }
  return result;
}
