import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, cashLedgerEntries, cashMovements, cashSessionCounts, cashSessions, riskAlerts, user } from "@/db/schema";
import { AccountabilityError } from "@/lib/cashier-accountability";
import { drawerBalance } from "@/lib/cash-ledger";
import { createAuditCase, getAppSettings } from "@/lib/garage-service";
import {
  evaluateSessionRisk,
  REPEAT_WINDOW_DAYS,
  RISK_DISPOSITIONS,
  type RiskDisposition,
  type RiskSessionFacts,
} from "@/lib/risk-rules";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// B6 (PRD §14): menyimpan alert risiko dari aturan murni (risk-rules.ts).
// - Satu alert per (aturan, subjek) — dedupe_key. Pindai ulang hanya memperbarui alert
//   yang masih OPEN; keputusan manusia tidak pernah ditimpa mesin.
// - Manajer tidak memeriksa alert tentang dirinya sendiri; kesimpulan akhir
//   (SUBSTANTIATED/CLOSED) hanya Owner (PRD §14.7).
// =============================================================================

const DAY_MS = 86_400_000;
const OWNER_ONLY_DISPOSITIONS: RiskDisposition[] = ["SUBSTANTIATED", "CLOSED", "OPEN"];

export async function loadRiskFacts(sessionId: string, now = new Date()): Promise<RiskSessionFacts | null> {
  const db = getDb();
  const [s] = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).limit(1);
  if (!s || s.status !== "closed" || !s.closedAt) return null;
  const [cashier] = s.openedBy
    ? await db.select({ name: user.name }).from(user).where(eq(user.id, s.openedBy)).limit(1)
    : [];

  const countRows = await db
    .select({ kind: cashSessionCounts.kind })
    .from(cashSessionCounts)
    .where(eq(cashSessionCounts.cashSessionId, sessionId));
  const distinctSources = async (types: string[]) => {
    const [row] = await db
      .select({ n: sql<number>`count(distinct coalesce(${cashLedgerEntries.sourceId}, ${cashLedgerEntries.seq}::text))::int` })
      .from(cashLedgerEntries)
      .where(and(eq(cashLedgerEntries.cashSessionId, sessionId), inArray(cashLedgerEntries.sourceType, types)));
    return Number(row?.n ?? 0);
  };
  const deposits = await db
    .select({ id: cashMovements.id, amount: cashMovements.amount, at: cashMovements.movementAt, refNo: cashMovements.refNo })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.cashSessionId, sessionId),
        eq(cashMovements.status, "recorded"),
        isNotNull(cashMovements.depositAccount),
        isNull(cashMovements.depositConfirmedAt),
      ),
    );

  // Kas keluar laci yang langsung tercatat tanpa ACC (bukan setoran) — Owner 6 Nov 2026.
  const settingsForDirect = await getAppSettings(s.outletId ?? null);
  const [direct] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${cashMovements.amount}), 0)::int`,
      withoutReceipt: sql<number>`count(*) filter (where ${cashMovements.receiptPhoto} is null and ${cashMovements.amount} >= ${Number(settingsForDirect.cashMovementPinThreshold) || 50_000})::int`,
    })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.cashSessionId, sessionId),
        eq(cashMovements.type, "cash_out"),
        eq(cashMovements.status, "recorded"),
        isNull(cashMovements.depositAccount),
        isNull(cashMovements.approvedBy),
      ),
    );

  // Riwayat kasir yang sama (denominator = jumlah shift), jendela REPEAT_WINDOW_DAYS.
  const history = s.openedBy
    ? await db
        .select({
          shifts: sql<number>`count(*)::int`,
          shortageShifts: sql<number>`count(*) filter (where ${cashSessions.discrepancy} < 0)::int`,
          mismatchShifts: sql<number>`count(*) filter (where exists (select 1 from cash_session_counts c where c.cash_session_id = ${cashSessions.id} and c.kind = 'count_3'))::int`,
        })
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.openedBy, s.openedBy),
            eq(cashSessions.status, "closed"),
            gte(cashSessions.closedAt, new Date(s.closedAt.getTime() - REPEAT_WINDOW_DAYS * DAY_MS)),
            lte(cashSessions.closedAt, s.closedAt),
          ),
        )
    : [{ shifts: 1, shortageShifts: 0, mismatchShifts: 0 }];

  const settings = await getAppSettings(s.outletId ?? null);
  return {
    sessionId: s.id,
    code: s.code,
    outletId: s.outletId,
    businessDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(s.openedAt),
    closedAt: s.closedAt,
    cashierId: s.openedBy,
    cashierName: cashier?.name ?? null,
    expectedCash: s.expectedCash,
    actualCash: s.actualCash,
    discrepancy: s.discrepancy,
    ledgerBalance: s.ledgerMode ? await drawerBalance(sessionId) : null,
    countSkippedReason: s.countSkippedReason,
    qrisDiscrepancy: s.qrisDiscrepancy,
    reviewSelfVerified: s.reviewSelfVerified,
    reviewedBy: s.reviewedBy,
    countKinds: countRows.map((row) => row.kind),
    refundVoidCount: s.ledgerMode ? await distinctSources(["refund", "void"]) : 0,
    methodFixCount: s.ledgerMode ? await distinctSources(["method_fix"]) : 0,
    unconfirmedDeposits: deposits.map((d) => ({ id: d.id, amount: d.amount, recordedAt: d.at, ref: d.refNo ?? d.id.slice(0, 8) })),
    cashOutDirect: {
      count: Number(direct?.count ?? 0),
      total: Number(direct?.total ?? 0),
      withoutReceipt: Number(direct?.withoutReceipt ?? 0),
      limit: Number(settingsForDirect.cashMovementShiftLimit) || 0,
    },
    history: {
      shifts: Number(history[0]?.shifts ?? 1),
      shortageShifts: Number(history[0]?.shortageShifts ?? 0),
      mismatchShifts: Number(history[0]?.mismatchShifts ?? 0),
    },
    threshold: Number(settings.shiftDiscrepancyThreshold) || 50_000,
    now,
  };
}

/** Evaluasi satu shift lalu simpan alert (idempoten). Alert yang sudah diputuskan tidak diubah. */
export async function scanRiskForSession(sessionId: string, now = new Date()) {
  const facts = await loadRiskFacts(sessionId, now);
  if (!facts) return { sessionId, alerts: 0 };
  const drafts = evaluateSessionRisk(facts);
  const db = getDb();
  for (const draft of drafts) {
    await db
      .insert(riskAlerts)
      .values({
        ...draft,
        outletId: facts.outletId,
        cashSessionId: facts.sessionId,
        detectedAt: now,
      })
      .onConflictDoUpdate({
        target: riskAlerts.dedupeKey,
        set: {
          riskLevel: draft.riskLevel,
          title: draft.title,
          explanation: draft.explanation,
          evidence: draft.evidence,
          completeness: draft.completeness,
          ruleVersion: draft.ruleVersion,
        },
        setWhere: eq(riskAlerts.disposition, "OPEN"),
      });
  }
  return { sessionId, alerts: drafts.length };
}

/** Pindai ulang shift yang ditutup dalam `days` hari terakhir (Owner "Pindai ulang"). */
export async function scanRecentRisk(params: { days?: number; outletId?: string | null } = {}) {
  const since = new Date(Date.now() - (params.days ?? 7) * DAY_MS);
  const rows = await getDb()
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.status, "closed"),
        gte(cashSessions.closedAt, since),
        params.outletId ? eq(cashSessions.outletId, params.outletId) : undefined,
      ),
    );
  let alerts = 0;
  for (const row of rows) alerts += (await scanRiskForSession(row.id)).alerts;
  return { sessions: rows.length, alerts };
}

/** Pemindaian latar setelah tutup/verifikasi/final — tidak pernah menggagalkan aksi asal. */
export function scanRiskInBackground(sessionId: string) {
  void scanRiskForSession(sessionId).catch((error) => console.error("[risk] pindai gagal", sessionId, error));
}

function assertReviewer(garage: GarageSession) {
  if (garage.profile.role !== "Owner" && garage.profile.role !== "Manajer") {
    throw new AccountabilityError("FORBIDDEN", "Hanya Owner atau Manajer yang melihat alert risiko.", 403);
  }
}

export async function listRiskAlerts(
  filter: { disposition?: RiskDisposition | "ALL"; minLevel?: number; limit?: number },
  garage: GarageSession,
) {
  assertReviewer(garage);
  const conditions = [];
  if (filter.disposition && filter.disposition !== "ALL") conditions.push(eq(riskAlerts.disposition, filter.disposition));
  if (filter.minLevel) conditions.push(gte(riskAlerts.riskLevel, filter.minLevel));
  if (garage.profile.role === "Manajer") conditions.push(eq(riskAlerts.outletId, garage.profile.outlet.id));
  const personName = sql<string | null>`(select name from "user" where id = ${riskAlerts.personUserId})`;
  const reviewerName = sql<string | null>`(select name from "user" where id = ${riskAlerts.reviewedBy})`;
  const rows = await getDb()
    .select({ alert: riskAlerts, personName, reviewerName, sessionCode: cashSessions.code })
    .from(riskAlerts)
    .leftJoin(cashSessions, eq(cashSessions.id, riskAlerts.cashSessionId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(riskAlerts.riskLevel), desc(riskAlerts.eventAt))
    .limit(Math.min(filter.limit ?? 200, 500));
  return rows.map(({ alert, personName: name, reviewerName: reviewer, sessionCode }) => ({
    id: alert.id,
    ruleId: alert.ruleId,
    ruleVersion: alert.ruleVersion,
    riskLevel: alert.riskLevel,
    title: alert.title,
    explanation: alert.explanation,
    eventAt: alert.eventAt.toISOString(),
    detectedAt: alert.detectedAt.toISOString(),
    cashSessionId: alert.cashSessionId,
    sessionCode,
    personName: name ?? null,
    personRole: alert.personRole,
    custodyScope: alert.custodyScope,
    evidence: alert.evidence,
    completeness: alert.completeness,
    disposition: alert.disposition as RiskDisposition,
    reviewerName: reviewer ?? null,
    reviewedAt: alert.reviewedAt?.toISOString() ?? null,
    reviewNote: alert.reviewNote,
    auditCaseId: alert.auditCaseId,
    // Manajer yang menjadi pihak terkait tidak boleh memutuskan (UI menyembunyikan tombol).
    viewerIsSubject: alert.personUserId === garage.user.id,
  }));
}

async function loadForDecision(id: string, garage: GarageSession) {
  assertReviewer(garage);
  const [alert] = await getDb().select().from(riskAlerts).where(eq(riskAlerts.id, id)).limit(1);
  if (!alert) throw new AccountabilityError("NOT_FOUND", "Alert risiko tidak ditemukan.", 404);
  if (garage.profile.role === "Manajer" && alert.outletId && alert.outletId !== garage.profile.outlet.id) {
    throw new AccountabilityError("FORBIDDEN", "Manajer hanya memeriksa alert outletnya sendiri.", 403);
  }
  if (alert.personUserId === garage.user.id && garage.profile.role !== "Owner") {
    throw new AccountabilityError("INDEPENDENT_REVIEW_REQUIRED", "Alert ini tentang Anda — diperiksa Owner/Manajer lain.", 403);
  }
  return alert;
}

export async function decideRiskAlert(id: string, input: { disposition: RiskDisposition; note?: string | null }, garage: GarageSession) {
  if (!RISK_DISPOSITIONS.includes(input.disposition)) {
    throw new AccountabilityError("INVALID_DISPOSITION", "Status pemeriksaan tidak dikenal.");
  }
  const alert = await loadForDecision(id, garage);
  if (OWNER_ONLY_DISPOSITIONS.includes(input.disposition) && garage.profile.role !== "Owner") {
    throw new AccountabilityError("OWNER_ONLY", "Kesimpulan ini hanya bisa ditetapkan Owner.", 403);
  }
  const note = input.note?.trim() || null;
  if (input.disposition !== "OPEN" && (!note || note.length < 10)) {
    throw new AccountabilityError("NOTE_REQUIRED", "Tulis dasar keputusan/bukti yang diperiksa (minimal 10 karakter).");
  }
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx
      .update(riskAlerts)
      .set({ disposition: input.disposition, reviewedBy: garage.user.id, reviewedAt: now, reviewNote: note })
      .where(eq(riskAlerts.id, id));
    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now),
      actor: `${garage.user.name} / ${garage.profile.role}`,
      action: "Alert risiko diperiksa",
      object: alert.ruleId,
      device: garage.profile.deviceLabel,
      status: "recorded",
      metadata: {
        riskAlertId: id,
        cashSessionId: alert.cashSessionId,
        before: { disposition: alert.disposition },
        after: { disposition: input.disposition },
        note,
      },
    });
  });
  return { id, disposition: input.disposition, reviewedAt: now.toISOString(), reviewNote: note };
}

/** Angkat alert menjadi kasus investigasi (audit_cases) — tanpa asumsi pelaku. */
export async function escalateRiskAlert(id: string, garage: GarageSession) {
  const alert = await loadForDecision(id, garage);
  if (alert.auditCaseId) return { id, auditCaseId: alert.auditCaseId };
  const [person] = alert.personUserId
    ? await getDb().select({ name: user.name }).from(user).where(eq(user.id, alert.personUserId)).limit(1)
    : [];
  const created = await createAuditCase({
    flagKind: `risk:${alert.ruleId}`,
    severity: alert.riskLevel >= 4 ? "critical" : alert.riskLevel === 3 ? "warning" : "watch",
    actorName: person?.name,
    title: alert.title,
    description: `${alert.explanation}\n\nDiangkat dari alert risiko ${alert.ruleId} v${alert.ruleVersion} (LV${alert.riskLevel}). Status kasus: OPEN — tanpa kesimpulan.`,
    createdBy: garage.user.id,
  });
  await getDb().update(riskAlerts).set({ auditCaseId: created.id }).where(eq(riskAlerts.id, id));
  return { id, auditCaseId: created.id };
}
