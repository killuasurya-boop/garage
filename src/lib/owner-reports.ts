// =============================================================================
// B7b — pemuat DB untuk laporan resmi Owner (Owner 360 harian, ledger bulanan,
// dossier kasus). Semua angka shift berasal dari getShiftAccountability (sumber
// yang sama dengan PDF shift resmi B7a); agregasi ada di owner-reports-build.ts.
// Tanggal = tanggal operasional WIB saat shift DIBUKA (sama dengan laporan shift).
// =============================================================================
import { and, asc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditCases,
  auditLogs,
  cashLedgerEntries,
  cashMovements,
  cashSessionCounts,
  cashSessionFinalSnapshots,
  cashSessions,
  outlets,
  riskAlerts,
} from "@/db/schema";
import { accountBalance } from "@/lib/cash-ledger";
import {
  buildCaseDossier,
  buildDailyDossier,
  buildMonthlyLedger,
  monthToDateOf,
  type DossierAlertInput,
  type DossierCaseInput,
  type DossierShiftInput,
  type MonthlyShiftRow,
} from "@/lib/owner-reports-build";
import { getShiftAccountability, listSessionsForBusinessDate, type ShiftAccountability } from "@/lib/shift-accountability-report";

const DAY_MS = 86_400_000;
const dayStart = (date: string) => new Date(`${date}T00:00:00+07:00`);
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const nameOf = (column: unknown) => sql<string | null>`(select name from "user" where id = ${column})`;

export class OwnerReportError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Ubah laporan shift (B7a) ke masukan dossier. */
export function toDossierShift(report: ShiftAccountability): DossierShiftInput {
  const s = report.session;
  const events: DossierShiftInput["events"] = [
    ...report.voids.map((v) => ({ at: v.createdAt, kind: "void", label: `${v.scope} ${v.orderNo} (${v.status})`, amount: Number(v.amount) || null, ref: v.orderNo, by: v.requester })),
    ...report.adjustments
      .filter((a) => a.kind !== "Diskon promo/voucher/poin" && a.kind !== "Pembayaran terpisah (multi-metode)")
      .map((a) => ({ at: a.at, kind: "adjustment", label: `${a.kind} ${a.orderNo}`, amount: a.amount, ref: a.orderNo, by: a.by })),
    ...report.movements
      .filter((m) => m.status === "recorded" && !m.depositAccount)
      .map((m) => ({ at: m.movementAt, kind: m.type === "in" ? "cash_in" : "cash_out", label: `${m.category}: ${m.description}`, amount: m.amount, ref: m.referenceNo, by: m.createdByName })),
  ];
  return {
    id: s.id,
    code: s.code,
    shiftNumber: s.shiftNumber,
    cashierName: s.cashierName,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    status: s.status,
    openingCash: report.cash.openingCash,
    cashSales: report.cash.cashSales,
    cashIn: report.cash.cashIn,
    cashOut: report.cash.cashOut,
    cashRefundsVoids: report.cash.cashRefundsVoids,
    financeCashOut: report.cash.financeCashOut,
    methodCorrections: report.cash.methodCorrections,
    otherAdjustments: report.cash.otherAdjustments,
    expected: report.cash.expected,
    actual: report.cash.actual,
    recountCash: s.recountCash,
    floatLeft: s.floatLeft,
    deposit: s.depositAmount,
    grossSales: report.sales.grossSales,
    netSales: report.sales.netSales,
    paidCount: report.sales.paidCount,
    voidCount: report.sales.voidCount,
    refundTotal: report.sales.refundTotal,
    qris: report.cash.qris,
    transfer: report.cash.transfer,
    otherNonCash: report.cash.otherNonCash,
    qrisRecorded: s.qrisRecorded,
    qrisCounted: s.qrisCounted,
    qrisDiscrepancy: s.qrisDiscrepancy,
    reviewStatus: s.reviewStatus,
    reviewedByName: s.reviewedByName,
    reviewedAt: s.reviewedAt,
    reviewSelfVerified: s.reviewSelfVerified,
    discrepancyAcknowledged: s.discrepancyAcknowledged,
    countSkippedReason: s.countSkippedReason,
    finalStatus: s.finalStatus ?? "pending",
    finalVersion: s.finalVersion ?? 0,
    finalReportId: s.finalReportId ?? null,
    finalSummaryHash: s.finalSummaryHash ?? null,
    finalDecidedByName: s.finalDecidedByName ?? null,
    finalDecidedAt: s.finalDecidedAt ?? null,
    finalNote: s.finalNote ?? null,
    counts: s.counts ?? [],
    incidents: report.incidents.map((i) => ({ status: i.status, category: i.category, description: i.description, at: i.occurredAt })),
    events,
  };
}

async function loadAlerts(where: ReturnType<typeof and>): Promise<DossierAlertInput[]> {
  const rows = await getDb()
    .select({ alert: riskAlerts, personName: nameOf(riskAlerts.personUserId), reviewerName: nameOf(riskAlerts.reviewedBy), sessionCode: cashSessions.code })
    .from(riskAlerts)
    .leftJoin(cashSessions, eq(cashSessions.id, riskAlerts.cashSessionId))
    .where(where)
    .orderBy(sql`${riskAlerts.riskLevel} desc`, asc(riskAlerts.eventAt));
  return rows.map(({ alert, personName, reviewerName, sessionCode }) => ({
    id: alert.id,
    ruleId: alert.ruleId,
    riskLevel: alert.riskLevel,
    title: alert.title,
    explanation: alert.explanation,
    eventAt: alert.eventAt.toISOString(),
    cashSessionId: alert.cashSessionId,
    sessionCode,
    personName,
    personRole: alert.personRole,
    custodyScope: alert.custodyScope,
    completeness: alert.completeness,
    disposition: alert.disposition,
    reviewerName,
    reviewedAt: iso(alert.reviewedAt),
    auditCaseId: alert.auditCaseId,
    evidence: alert.evidence,
  }));
}

function toCase(row: typeof auditCases.$inferSelect): DossierCaseInput {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    severity: row.severity,
    flagKind: row.flagKind,
    actorName: row.actorName,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
  };
}

async function outletName(outletId: string) {
  const [row] = await getDb().select({ name: outlets.name }).from(outlets).where(eq(outlets.id, outletId)).limit(1);
  return row?.name ?? null;
}

// ── Ledger bulanan ────────────────────────────────────────────────────────────

export async function getMonthlyLedger(params: { outletId: string; from: string; to: string; now?: Date }) {
  if (params.from > params.to) throw new OwnerReportError("INVALID_RANGE", "Tanggal awal setelah tanggal akhir.");
  const start = dayStart(params.from);
  const end = new Date(dayStart(params.to).getTime() + DAY_MS);
  if (end.getTime() - start.getTime() > 400 * DAY_MS) throw new OwnerReportError("RANGE_TOO_LONG", "Rentang maksimal ±13 bulan.");
  const db = getDb();

  const sessions = await db
    .select({
      s: cashSessions,
      cashierName: nameOf(cashSessions.openedBy),
      reviewerName: nameOf(cashSessions.reviewedBy),
      hasThirdCount: sql<boolean>`exists(select 1 from ${cashSessionCounts} c where c.cash_session_id = ${cashSessions.id} and c.kind = 'count_3')`,
      ledgerIn: sql<number>`coalesce((select sum(l.amount) from ${cashLedgerEntries} l where l.cash_session_id = ${cashSessions.id} and l.to_account = 'drawer' and l.source_type not in ('opening','legacy_opening')), 0)::int`,
    })
    .from(cashSessions)
    .where(and(eq(cashSessions.outletId, params.outletId), gte(cashSessions.openedAt, start), lt(cashSessions.openedAt, end)))
    .orderBy(asc(cashSessions.openedAt));

  const shifts: MonthlyShiftRow[] = sessions.map(({ s, cashierName, reviewerName, hasThirdCount, ledgerIn }) => ({
    id: s.id,
    code: s.code,
    date: new Date(s.openedAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10),
    cashierId: s.openedBy,
    cashierName,
    status: s.status,
    openingCash: s.openingCash,
    expected: s.expectedCash,
    actual: s.actualCash,
    recountCash: s.recountCash,
    reviewerId: s.reviewedBy,
    reviewerName,
    reviewSelfVerified: s.reviewSelfVerified,
    countSkippedReason: s.countSkippedReason,
    finalStatus: s.finalStatus,
    hasThirdCount: Boolean(hasThirdCount),
    cashHandled: s.ledgerMode ? Number(ledgerIn) : Math.max(0, s.expectedCash - s.openingCash),
  }));

  const alerts = await db
    .select({ riskLevel: riskAlerts.riskLevel, disposition: riskAlerts.disposition, eventAt: riskAlerts.eventAt, ruleId: riskAlerts.ruleId })
    .from(riskAlerts)
    .where(and(or(eq(riskAlerts.outletId, params.outletId), sql`${riskAlerts.outletId} is null`), gte(riskAlerts.eventAt, start), lt(riskAlerts.eventAt, end)));

  // Kasus yang relevan untuk roll-forward: dibuat sebelum akhir periode & belum selesai sebelum awal.
  const cases = await db
    .select()
    .from(auditCases)
    .where(and(lt(auditCases.createdAt, end), or(sql`${auditCases.resolvedAt} is null`, gte(auditCases.resolvedAt, start))));

  const deposits = await db
    .select({ amount: cashMovements.amount, depositorName: nameOf(cashMovements.createdBy), confirmedAt: cashMovements.depositConfirmedAt, at: cashMovements.movementAt })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.outletId, params.outletId),
        isNotNull(cashMovements.depositAccount),
        eq(cashMovements.status, "recorded"),
        gte(cashMovements.movementAt, start),
        lt(cashMovements.movementAt, end),
      ),
    );

  const [corrections] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "Koreksi metode bayar"), gte(auditLogs.createdAt, start), lt(auditLogs.createdAt, end)));

  return buildMonthlyLedger({
    from: params.from,
    to: params.to,
    outletName: await outletName(params.outletId),
    shifts,
    alerts: alerts.map((a) => ({ ...a, eventAt: a.eventAt.toISOString() })),
    cases: cases.map((c) => ({ id: c.id, title: c.title, status: c.status, severity: c.severity, createdAt: c.createdAt.toISOString(), resolvedAt: iso(c.resolvedAt), actorName: c.actorName })),
    deposits: deposits.map((d) => ({ amount: d.amount, depositorName: d.depositorName, confirmedAt: iso(d.confirmedAt), at: d.at.toISOString() })),
    tenderCorrections: corrections?.n ?? 0,
    generatedAt: (params.now ?? new Date()).toISOString(),
  });
}

// ── Dossier harian / Owner 360 ────────────────────────────────────────────────

export async function getDailyDossier(params: { outletId: string; date: string; now?: Date }) {
  const db = getDb();
  const start = dayStart(params.date);
  const end = new Date(start.getTime() + DAY_MS);
  const rows = await listSessionsForBusinessDate({ outletId: params.outletId, date: params.date });
  const reports = (await Promise.all(rows.map((row) => getShiftAccountability(row.id)))).filter((r): r is ShiftAccountability => Boolean(r));
  const ids = reports.map((r) => r.session.id);

  const alerts = await loadAlerts(
    or(
      ids.length ? inArray(riskAlerts.cashSessionId, ids) : sql`false`,
      and(eq(riskAlerts.outletId, params.outletId), sql`${riskAlerts.cashSessionId} is null`, gte(riskAlerts.eventAt, start), lt(riskAlerts.eventAt, end)),
    ),
  );
  const caseIds = Array.from(new Set(alerts.map((a) => a.auditCaseId).filter((id): id is string => Boolean(id))));
  const cases = caseIds.length ? (await db.select().from(auditCases).where(inArray(auditCases.id, caseIds))).map(toCase) : [];

  const deposits = ids.length
    ? await db
        .select({
          m: cashMovements,
          depositorName: nameOf(cashMovements.createdBy),
          confirmedByName: nameOf(cashMovements.depositConfirmedBy),
        })
        .from(cashMovements)
        .where(and(inArray(cashMovements.cashSessionId, ids), isNotNull(cashMovements.depositAccount), eq(cashMovements.status, "recorded")))
        .orderBy(asc(cashMovements.movementAt))
    : [];

  const snapshots = ids.length
    ? await db
        .select({ snap: cashSessionFinalSnapshots, decidedByName: nameOf(cashSessionFinalSnapshots.decidedBy) })
        .from(cashSessionFinalSnapshots)
        .where(inArray(cashSessionFinalSnapshots.cashSessionId, ids))
        .orderBy(asc(cashSessionFinalSnapshots.decidedAt))
    : [];

  // Petty cash = akun ledger terpisah; saldo pada akhir tanggal operasional.
  const pettyClosingBalance = await accountBalance("petty", params.outletId, end).catch(() => null);

  const monthFrom = `${params.date.slice(0, 8)}01`;
  const ledger = await getMonthlyLedger({ outletId: params.outletId, from: monthFrom, to: params.date, now: params.now });

  return buildDailyDossier({
    date: params.date,
    outletName: reports[0]?.session.outletName ?? (await outletName(params.outletId)),
    shifts: reports.map(toDossierShift),
    alerts,
    cases,
    deposits: deposits.map(({ m, depositorName, confirmedByName }) => ({
      id: m.id,
      refNo: m.refNo,
      cashSessionId: m.cashSessionId,
      amount: m.amount,
      account: m.depositAccount,
      depositorName,
      at: m.movementAt.toISOString(),
      confirmedAt: iso(m.depositConfirmedAt),
      confirmedByName,
      bankRef: m.depositBankRef,
    })),
    snapshots: snapshots.map(({ snap, decidedByName }) => ({
      cashSessionId: snap.cashSessionId,
      reportId: snap.reportId,
      version: snap.version,
      decision: snap.decision,
      finalStatus: snap.finalStatus,
      summaryHash: snap.summaryHash,
      exceptions: snap.exceptions,
      note: snap.note,
      decidedByName,
      decidedAt: snap.decidedAt.toISOString(),
    })),
    pettyClosingBalance: pettyClosingBalance === null ? null : Number(pettyClosingBalance),
    monthToDate: monthToDateOf(ledger, ledger.cases.closingBalance),
    generatedAt: (params.now ?? new Date()).toISOString(),
  });
}

// ── Dossier kasus ─────────────────────────────────────────────────────────────

export async function getCaseDossier(params: { caseId: string; outletId: string; now?: Date }) {
  const db = getDb();
  const [row] = await db
    .select({ c: auditCases, assignedToName: nameOf(auditCases.assignedTo), createdByName: nameOf(auditCases.createdBy) })
    .from(auditCases)
    .where(eq(auditCases.id, params.caseId))
    .limit(1);
  if (!row) throw new OwnerReportError("CASE_NOT_FOUND", "Kasus tidak ditemukan.", 404);
  const alerts = await loadAlerts(and(eq(riskAlerts.auditCaseId, params.caseId)));
  const sessionIds = Array.from(new Set(alerts.map((a) => a.cashSessionId).filter((id): id is string => Boolean(id))));
  const sessions = sessionIds.length
    ? await db
        .select({ s: cashSessions, cashierName: nameOf(cashSessions.openedBy) })
        .from(cashSessions)
        .where(inArray(cashSessions.id, sessionIds))
        .orderBy(asc(cashSessions.openedAt))
    : [];
  return buildCaseDossier({
    case: {
      ...toCase(row.c),
      description: row.c.description,
      assignedToName: row.assignedToName,
      createdByName: row.createdByName,
      notes: row.c.notes ?? [],
      updatedAt: row.c.updatedAt.toISOString(),
    },
    alerts,
    sessions: sessions.map(({ s, cashierName }) => ({
      id: s.id,
      code: s.code,
      cashierName,
      date: new Date(s.openedAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10),
      expected: s.expectedCash,
      actual: s.actualCash,
      finalStatus: s.finalStatus,
      reviewStatus: s.reviewStatus,
    })),
    outletName: await outletName(params.outletId),
    generatedAt: (params.now ?? new Date()).toISOString(),
  });
}

