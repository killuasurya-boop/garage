// Smart Approval V3: sidik (hash) objek yang akan diubah sebuah pengajuan. Dipakai saat preview dan
// diperiksa ulang saat keputusan — bila order/shift/biaya berubah sejak Owner melihatnya, keputusan
// ditolak dengan STALE (Owner harus melihat data terbaru dulu). Hanya membaca data.
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { approvals, cashSessions, companyDocuments, companyDocumentVersions, expenses, orders } from "@/db/schema";
import type { ApprovalPayload } from "@/lib/approval-rules";
import { summaryHashOf } from "@/lib/step-up-totp";

export type ApprovalSubjectSnapshot = {
  approval: { id: string; status: string; amount: string; amountValue: number | null; payload: unknown };
  order?: { id: string; orderNo: string; status: string; total: number } | null;
  cashSession?: { id: string; status: string; expectedCash: number; actualCash: number | null; discrepancy: number } | null;
  expense?: { id: string; status: string; amount: number } | null;
  document?: {
    id: string;
    title: string;
    approvedVersion: number | null;
    currentVersion: number;
    version: { id: string; version: number; reviewStatus: string; sha256: string | null; fileName: string; sizeBytes: number } | null;
  } | null;
};

export async function approvalSubjectSnapshot(row: typeof approvals.$inferSelect): Promise<{ hash: string; snapshot: ApprovalSubjectSnapshot }> {
  const db = getDb();
  const payload = (row.payload ?? {}) as ApprovalPayload;
  const snapshot: ApprovalSubjectSnapshot = {
    approval: { id: row.id, status: row.status, amount: row.amount, amountValue: row.amountValue ?? null, payload: row.payload ?? {} },
  };
  const orderId = payload.orderId ?? (row.id.startsWith("APP-VOID-") ? row.id.slice("APP-VOID-".length) : null);
  if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
    const [order] = await db
      .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status, total: orders.total })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    snapshot.order = order ?? null;
  }
  if (payload.cashSessionId) {
    const [session] = await db
      .select({
        id: cashSessions.id,
        status: cashSessions.status,
        expectedCash: cashSessions.expectedCash,
        actualCash: cashSessions.actualCash,
        discrepancy: cashSessions.discrepancy,
      })
      .from(cashSessions)
      .where(eq(cashSessions.id, payload.cashSessionId))
      .limit(1);
    snapshot.cashSession = session ?? null;
  }
  if (payload.expenseId) {
    const [expense] = await db
      .select({ id: expenses.id, status: expenses.status, amount: expenses.amount })
      .from(expenses)
      .where(eq(expenses.id, payload.expenseId))
      .limit(1);
    snapshot.expense = expense ?? null;
  }
  // Document Approval: versi lain disetujui / status berubah sejak dibuka → STALE.
  if (payload.documentId && payload.versionId && /^[0-9a-f-]{36}$/i.test(payload.documentId) && /^[0-9a-f-]{36}$/i.test(payload.versionId)) {
    const [doc] = await db
      .select({ id: companyDocuments.id, title: companyDocuments.title, approvedVersion: companyDocuments.approvedVersion, currentVersion: companyDocuments.currentVersion })
      .from(companyDocuments)
      .where(eq(companyDocuments.id, payload.documentId))
      .limit(1);
    const [version] = await db
      .select({
        id: companyDocumentVersions.id,
        version: companyDocumentVersions.version,
        reviewStatus: companyDocumentVersions.reviewStatus,
        sha256: companyDocumentVersions.sha256,
        fileName: companyDocumentVersions.originalFileName,
        sizeBytes: companyDocumentVersions.sizeBytes,
      })
      .from(companyDocumentVersions)
      .where(eq(companyDocumentVersions.id, payload.versionId))
      .limit(1);
    snapshot.document = doc ? { ...doc, version: version ?? null } : null;
  }
  return { hash: summaryHashOf(snapshot), snapshot };
}
