// AYA Smart Problem Solver V4 — kasus & riwayat keputusan (Batch 3).
// Status dipisah: analisis (diagnosis) → keputusan Owner (event) → pelaksanaan resmi (event yang menautkan
// operasi mcp_operations milik Owner, tidak pernah dari klaim model) → verifikasi (ukur ulang metrik).
// Linimasa append-only (trigger DB). Hanya Owner.
import { randomBytes } from "crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { aiProblemCaseEvents, aiProblemCases, mcpOperations } from "@/db/schema";
import type { ProblemDiagnosis, SolverMetric } from "@/lib/garage-problem-solver";
import type { ProblemSolverResult } from "@/lib/garage-problem-solver-service";
import type { GarageSession } from "@/lib/server-auth";
import { summaryHashOf } from "@/lib/step-up-totp";

export class ProblemCaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type CaseStatus = "open" | "monitoring" | "resolved" | "dismissed";
export type CaseDecision = "choose_option" | "defer" | "dismiss" | "resolve" | "reopen" | "note";

function assertOwner(session: GarageSession) {
  if (session.profile.role !== "Owner") throw new ProblemCaseError("FORBIDDEN", "Kasus AYA hanya untuk Owner.", 403);
  if (session.profile.agentKey) throw new ProblemCaseError("FORBIDDEN", "Keputusan kasus harus oleh Owner langsung, bukan agent.", 403);
}

function actor(session: GarageSession) {
  return { actorUserId: session.user.id, actorName: session.user.name };
}

function caseNo(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "2-digit", month: "2-digit", day: "2-digit" })
    .format(now)
    .replaceAll("-", "");
  return `AYA-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Metrik di mana angka lebih kecil = lebih baik (masalah berkurang). */
const LOWER_IS_BETTER_EXCEPT = new Set(["omzet", "transaksi", "order_dibaca", "shift_hari_ini"]);

function metricsOf(diagnosis: ProblemDiagnosis) {
  const map = new Map<string, SolverMetric>();
  for (const row of diagnosis.evidence) for (const m of row.metrics ?? []) if (!map.has(m.key)) map.set(m.key, m);
  return map;
}

export type OutcomeComparison = { key: string; label: string; before: number | null; after: number | null; change: "better" | "worse" | "same" | "unknown" };

/** Bandingkan metrik analisis awal vs pengukuran ulang. Tidak ada data = "unknown", bukan "membaik". */
export function compareOutcome(before: ProblemDiagnosis, after: ProblemDiagnosis): { comparisons: OutcomeComparison[]; verdict: "improved" | "unchanged" | "worse" | "unknown" } {
  const a = metricsOf(before);
  const b = metricsOf(after);
  const keys = [...new Set([...a.keys(), ...b.keys()])].filter((key) => !LOWER_IS_BETTER_EXCEPT.has(key));
  const comparisons = keys.map((key): OutcomeComparison => {
    const prev = a.get(key)?.value ?? null;
    const next = b.get(key)?.value ?? null;
    const label = a.get(key)?.label ?? b.get(key)?.label ?? key;
    if (prev === null || next === null) {
      // Metrik masalah hilang dari hasil baru karena nol (extractor hanya mencatat > 0) — dianggap membaik
      // HANYA bila sumbernya terbaca pada pengukuran ulang.
      const sourceRead = after.evidence.some((row) => row.status === "available" && before.evidence.some((p) => p.tool === row.tool && p.metrics.some((m) => m.key === key)));
      if (prev !== null && next === null && sourceRead) return { key, label, before: prev, after: 0, change: "better" };
      return { key, label, before: prev, after: next, change: "unknown" };
    }
    return { key, label, before: prev, after: next, change: next < prev ? "better" : next > prev ? "worse" : "same" };
  });
  const known = comparisons.filter((c) => c.change !== "unknown");
  const verdict = !known.length
    ? "unknown"
    : known.some((c) => c.change === "worse")
      ? "worse"
      : known.some((c) => c.change === "better")
        ? "improved"
        : "unchanged";
  return { comparisons, verdict };
}

function diagnosisSnapshot(result: ProblemSolverResult) {
  return {
    ...result.diagnosis,
    ai: result.ai ? { status: result.ai.status, explanation: result.ai.explanation, provider: result.ai.provider ?? null, model: result.ai.model ?? null, note: result.ai.note } : null,
    solverMode: result.mode,
  } as unknown as Record<string, unknown>;
}

export async function createProblemCase(session: GarageSession, input: { question: string; mode: "quick" | "full"; result: ProblemSolverResult }) {
  assertOwner(session);
  const diagnosis = diagnosisSnapshot(input.result);
  const hash = summaryHashOf(diagnosis);
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(aiProblemCases)
      .values({
        caseNo: caseNo(),
        ownerUserId: session.user.id,
        outletId: session.profile.outlet?.id ?? null,
        question: input.question.slice(0, 3000),
        mode: input.mode,
        analysisStatus: input.result.diagnosis.analysis.status,
        domains: input.result.diagnosis.domains,
        diagnosis,
        diagnosisHash: hash,
      })
      .returning();
    await tx.insert(aiProblemCaseEvents).values({
      caseId: row.id,
      kind: "analysis",
      caseVersion: 1,
      ...actor(session),
      payload: { diagnosisHash: hash, analysisStatus: row.analysisStatus, solverMode: input.result.mode },
    });
    return row;
  });
}

async function loadCase(session: GarageSession, caseId: string) {
  assertOwner(session);
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) throw new ProblemCaseError("NOT_FOUND", "Kasus tidak ditemukan.", 404);
  const [row] = await getDb()
    .select()
    .from(aiProblemCases)
    .where(and(eq(aiProblemCases.id, caseId), eq(aiProblemCases.ownerUserId, session.user.id)))
    .limit(1);
  if (!row) throw new ProblemCaseError("NOT_FOUND", "Kasus tidak ditemukan.", 404);
  return row;
}

/** Analisis ulang: versi naik, diagnosis diganti, linimasa mencatat sidik lama & baru. */
export async function rerunProblemCase(session: GarageSession, caseId: string, result: ProblemSolverResult) {
  const current = await loadCase(session, caseId);
  const diagnosis = diagnosisSnapshot(result);
  const hash = summaryHashOf(diagnosis);
  const version = current.version + 1;
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(aiProblemCases)
      .set({ diagnosis, diagnosisHash: hash, version, analysisStatus: result.diagnosis.analysis.status, domains: result.diagnosis.domains, updatedAt: new Date() })
      .where(and(eq(aiProblemCases.id, caseId), eq(aiProblemCases.version, current.version)))
      .returning();
    if (!row) throw new ProblemCaseError("STALE", "Kasus diubah bersamaan. Muat ulang.", 409);
    await tx.insert(aiProblemCaseEvents).values({
      caseId,
      kind: "analysis",
      caseVersion: version,
      ...actor(session),
      payload: { diagnosisHash: hash, previousHash: current.diagnosisHash, analysisStatus: row.analysisStatus },
    });
    return row;
  });
}

const STATUS_BY_DECISION: Partial<Record<CaseDecision, CaseStatus>> = {
  choose_option: "monitoring",
  dismiss: "dismissed",
  resolve: "resolved",
  reopen: "open",
};

/**
 * Keputusan Owner atas kasus (memilih opsi, tunda, tutup, catatan). TIDAK menjalankan apa pun —
 * pelaksanaan selalu lewat alur resmi (preview + konfirmasi), lalu ditautkan dengan `linkCaseOperation`.
 * `expectedDiagnosisHash` wajib: bila analisis berubah sejak dilihat → STALE.
 */
export async function recordCaseDecision(
  session: GarageSession,
  caseId: string,
  input: { decision: CaseDecision; optionId?: string; note?: string; expectedDiagnosisHash: string },
) {
  const current = await loadCase(session, caseId);
  if (input.expectedDiagnosisHash !== current.diagnosisHash) {
    throw new ProblemCaseError("STALE", "Analisis kasus berubah sejak Anda melihatnya. Muat ulang sebelum memutus.", 409);
  }
  const note = input.note?.trim().slice(0, 500) || null;
  if ((input.decision === "dismiss" || input.decision === "defer" || input.decision === "note") && (!note || note.length < 5)) {
    throw new ProblemCaseError("NOTE_REQUIRED", "Catatan wajib diisi minimal 5 karakter.");
  }
  const diagnosis = current.diagnosis as unknown as ProblemDiagnosis;
  const option = input.optionId ? diagnosis.report?.opsi?.find((o) => o.id === input.optionId) : undefined;
  if (input.decision === "choose_option" && !option) throw new ProblemCaseError("OPTION_NOT_FOUND", "Opsi tidak ada di analisis ini.");
  const nextStatus = STATUS_BY_DECISION[input.decision];
  return getDb().transaction(async (tx) => {
    if (nextStatus && nextStatus !== current.status) {
      await tx
        .update(aiProblemCases)
        .set({ status: nextStatus, resolvedAt: nextStatus === "resolved" ? new Date() : null, updatedAt: new Date() })
        .where(eq(aiProblemCases.id, caseId));
    }
    const [event] = await tx
      .insert(aiProblemCaseEvents)
      .values({
        caseId,
        kind: "decision",
        caseVersion: current.version,
        ...actor(session),
        payload: {
          decision: input.decision,
          optionId: option?.id ?? null,
          optionTitle: option?.title ?? null,
          optionRisk: option?.risk ?? null,
          note,
          diagnosisHash: current.diagnosisHash,
          statusBefore: current.status,
          statusAfter: nextStatus ?? current.status,
          // Keputusan ≠ pelaksanaan.
          execution: "NOT_EXECUTED",
        },
      })
      .returning();
    return event;
  });
}

/**
 * Tautkan pelaksanaan resmi: operasi MCP/Command Center milik Owner yang SAMA. Status operasi dibaca
 * dari database (executed / failed / confirmed-tanpa-hasil = belum pasti), bukan dari klaim model.
 */
export async function linkCaseOperation(session: GarageSession, caseId: string, operationId: string) {
  const current = await loadCase(session, caseId);
  if (!/^[0-9a-f-]{36}$/i.test(operationId)) throw new ProblemCaseError("NOT_FOUND", "Operasi tidak ditemukan.", 404);
  const [op] = await getDb().select().from(mcpOperations).where(eq(mcpOperations.id, operationId)).limit(1);
  if (!op || op.userId !== session.user.id) throw new ProblemCaseError("NOT_FOUND", "Operasi tidak ditemukan.", 404);
  if (op.status === "pending") throw new ProblemCaseError("NOT_EXECUTED", "Operasi masih pratinjau — belum dikonfirmasi.", 409);
  const outcome = op.status === "executed" ? "succeeded" : op.status === "failed" ? "failed" : "uncertain";
  const [event] = await getDb()
    .insert(aiProblemCaseEvents)
    .values({
      caseId,
      kind: "action_linked",
      caseVersion: current.version,
      operationId: op.id,
      ...actor(session),
      payload: {
        tool: op.tool,
        risk: op.risk,
        operationStatus: op.status,
        outcome,
        executedAt: op.executedAt?.toISOString() ?? null,
        argsDigest: op.argsDigest,
        resultHash: op.resultSummary ? summaryHashOf(op.resultSummary) : null,
      },
    })
    .returning();
  return event;
}

/** Verifikasi hasil: ukur ulang (tool R0) dan bandingkan metrik dengan analisis kasus saat ini. */
export async function verifyProblemCase(session: GarageSession, caseId: string, remeasure: ProblemSolverResult) {
  const current = await loadCase(session, caseId);
  const before = current.diagnosis as unknown as ProblemDiagnosis;
  const { comparisons, verdict } = compareOutcome(before, remeasure.diagnosis);
  const [event] = await getDb()
    .insert(aiProblemCaseEvents)
    .values({
      caseId,
      kind: "verification",
      caseVersion: current.version,
      ...actor(session),
      payload: {
        verdict,
        comparisons,
        measuredAt: remeasure.diagnosis.generatedAt,
        analysisStatus: remeasure.diagnosis.analysis.status,
        missing: remeasure.diagnosis.analysis.missingEvidence.slice(0, 10),
      },
    })
    .returning();
  return { event, verdict, comparisons };
}

export async function listProblemCases(session: GarageSession, params: { status?: CaseStatus; limit?: number } = {}) {
  assertOwner(session);
  const rows = await getDb()
    .select({
      id: aiProblemCases.id,
      caseNo: aiProblemCases.caseNo,
      question: aiProblemCases.question,
      status: aiProblemCases.status,
      analysisStatus: aiProblemCases.analysisStatus,
      domains: aiProblemCases.domains,
      version: aiProblemCases.version,
      createdAt: aiProblemCases.createdAt,
      updatedAt: aiProblemCases.updatedAt,
    })
    .from(aiProblemCases)
    .where(and(eq(aiProblemCases.ownerUserId, session.user.id), params.status ? eq(aiProblemCases.status, params.status) : undefined))
    .orderBy(desc(aiProblemCases.updatedAt))
    .limit(Math.min(Math.max(params.limit ?? 50, 1), 200));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
}

export async function getProblemCase(session: GarageSession, caseId: string) {
  const row = await loadCase(session, caseId);
  const events = await getDb()
    .select()
    .from(aiProblemCaseEvents)
    .where(eq(aiProblemCaseEvents.caseId, caseId))
    .orderBy(asc(aiProblemCaseEvents.createdAt));
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  };
}
