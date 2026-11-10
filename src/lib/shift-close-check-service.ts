// Data panel cek tutup shift (Tahap 1.7). Read-only; akses = sama dengan ringkasan
// shift (`getCashSessionSummary`: kasir pemilik shift, atau finance:read).
// Kas tunai hanya dikirim bila peminta boleh melihat kas (blind count).

import { and, count, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { cashLedgerEntries, cashSessions, orders } from "@/db/schema";
import { hidesOpenShiftCash } from "@/lib/cash-blind";
import { getCashSessionSummary } from "@/lib/garage-service";
import { ORDER_STATUSES_FOR_PAYMENT_STATUS } from "@/lib/payment-status";
import { isCashMethod, type ShiftCloseCheckData } from "@/lib/shift-close-check";

export async function getShiftCloseCheck(
  sessionId: string,
  viewer: { userId: string; role: string; allowAll: boolean },
): Promise<(ShiftCloseCheckData & { sessionStatus: string }) | null> {
  const summary = await getCashSessionSummary(sessionId, viewer.userId, { allowAll: viewer.allowAll });
  if (!summary) return null;
  const db = getDb();
  const [row] = await db
    .select({ outletId: cashSessions.outletId, openedAt: cashSessions.openedAt })
    .from(cashSessions)
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  if (!row) return null;

  const unpaidStatuses = ORDER_STATUSES_FOR_PAYMENT_STATUS.pending;
  const unpaidWhere = and(
    inArray(orders.status, unpaidStatuses),
    isNull(orders.archivedAt),
    row.outletId ? eq(orders.outletId, row.outletId) : undefined,
  );
  const [thisShift, older, ledger] = await Promise.all([
    db
      .select({ orderNo: orders.orderNo, total: orders.total })
      .from(orders)
      .where(and(unpaidWhere, gte(orders.createdAt, row.openedAt)))
      .orderBy(orders.createdAt)
      .limit(200),
    db
      .select({ n: count(orders.id), total: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
      .from(orders)
      .where(and(unpaidWhere, lt(orders.createdAt, row.openedAt))),
    db
      .select({ sourceType: cashLedgerEntries.sourceType, n: count(cashLedgerEntries.id) })
      .from(cashLedgerEntries)
      .where(
        and(
          eq(cashLedgerEntries.cashSessionId, sessionId),
          inArray(cashLedgerEntries.sourceType, ["method_fix", "payment_revert"]),
        ),
      )
      .groupBy(cashLedgerEntries.sourceType),
  ]);

  const ledgerCount = (type: string) => Number(ledger.find((entry) => entry.sourceType === type)?.n ?? 0);
  const canSeeCash = !hidesOpenShiftCash(viewer.role) || summary.session.status !== "open";
  const cashRows = summary.byMethod.filter((m) => isCashMethod(m.method));

  return {
    sessionStatus: summary.session.status,
    unpaidThisShift: {
      count: thisShift.length,
      total: thisShift.reduce((sum, order) => sum + order.total, 0),
      orderNos: thisShift.map((order) => order.orderNo),
    },
    unpaidOlder: { count: Number(older[0]?.n ?? 0), total: Number(older[0]?.total ?? 0) },
    pendingCashMovements: { count: summary.cashMovements.pendingCount, amount: summary.cashMovements.pendingAmount },
    methodCorrections: ledgerCount("method_fix"),
    paymentReverts: ledgerCount("payment_revert"),
    nonCash: summary.byMethod.filter((m) => !isCashMethod(m.method)),
    cash: canSeeCash
      ? {
          count: cashRows.reduce((sum, m) => sum + m.count, 0),
          total: cashRows.reduce((sum, m) => sum + m.total, 0),
          expectedCash: summary.reconciliation.expectedCash,
        }
      : null,
  };
}
