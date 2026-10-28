import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  cashLedgerEntries,
  cashMovements,
  cashSessionCounts,
  cashSessionFinalSnapshots,
  cashSessions,
  shiftIncidents,
} from "@/db/schema";
import { AccountabilityError } from "@/lib/cashier-accountability";
import { consumeStepUpChallenge, createStepUpChallenge, summaryHashOf } from "@/lib/step-up-totp";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// B4 — Final closing Owner (PRD §13). Tutup kasir & verifikasi Manajer bukan final.
// Final hanya Owner + TOTP fresh yang diikat ke hash ringkasan shift + nonce sekali pakai.
// Data berubah setelah ringkasan dibuka → STALE. Dua keputusan bersamaan → hanya satu
// yang tercatat (row lock + final_version).
// =============================================================================

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const FINAL_PURPOSE = "cash_session_final";

/** ID laporan final per versi (PRD §20.2): revisi sah → V02, V03 … arsip lama tetap. */
export function finalReportId(sessionCode: string, version: number) {
  return `FIN-${sessionCode}-V${String(version).padStart(2, "0")}`;
}

export type FinalDecision = "approve" | "approve_with_exception" | "return";
export type FinalStatus = "pending" | "approved" | "approved_with_exception" | "returned" | "legacy";

export const FINAL_STATUS_LABELS: Record<FinalStatus, string> = {
  pending: "Belum final",
  approved: "Final disetujui Owner",
  approved_with_exception: "Final dengan pengecualian",
  returned: "Dikembalikan Owner",
  legacy: "Ditutup sebelum final Owner",
};

/** Status final yang masih boleh diputuskan Owner (setelah verifikasi Manajer). */
const DECIDABLE: FinalStatus[] = ["pending", "returned", "legacy"];

async function loadSummary(tx: Db | Tx, sessionId: string, lock: boolean) {
  const base = tx.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).limit(1);
  const [session] = lock ? await base.for("update") : await base;
  if (!session) throw new AccountabilityError("NOT_FOUND", "Shift tidak ditemukan.", 404);

  const counts = await tx
    .select({ kind: cashSessionCounts.kind, total: cashSessionCounts.total, createdAt: cashSessionCounts.createdAt })
    .from(cashSessionCounts)
    .where(eq(cashSessionCounts.cashSessionId, sessionId))
    .orderBy(asc(cashSessionCounts.createdAt));
  const [ledger] = await tx
    .select({
      entries: sql<number>`count(*)::int`,
      lastSeq: sql<number>`coalesce(max(${cashLedgerEntries.seq}), 0)::int`,
    })
    .from(cashLedgerEntries)
    .where(eq(cashLedgerEntries.cashSessionId, sessionId));
  const [incidents] = await tx
    .select({ open: sql<number>`count(*)::int` })
    .from(shiftIncidents)
    .where(and(eq(shiftIncidents.cashSessionId, sessionId), inArray(shiftIncidents.status, ["open", "follow_up"])));
  const [movements] = await tx
    .select({ pending: sql<number>`count(*)::int` })
    .from(cashMovements)
    .where(and(eq(cashMovements.cashSessionId, sessionId), eq(cashMovements.status, "pending_approval")));

  const recountDiff = session.recountCash === null ? null : session.recountCash - session.expectedCash;
  // Isi ringkasan = yang dilihat Owner. Hash dihitung dari objek ini, jadi angka apa pun
  // yang berubah (hitungan, buku kas, verifikasi, kasus) membatalkan persetujuan lama.
  const summary = {
    sessionId: session.id,
    code: session.code,
    outletId: session.outletId,
    status: session.status,
    openedBy: session.openedBy,
    closedBy: session.closedBy,
    closedAt: session.closedAt?.toISOString() ?? null,
    openingCash: session.openingCash,
    expectedCash: session.expectedCash,
    actualCash: session.actualCash,
    discrepancy: session.discrepancy,
    discrepancyStatus: session.discrepancyStatus,
    countSkippedReason: session.countSkippedReason,
    recountCash: session.recountCash,
    recountDiff,
    qrisRecorded: session.qrisRecorded,
    qrisCounted: session.qrisCounted,
    qrisDiscrepancy: session.qrisDiscrepancy,
    depositAmount: session.depositAmount,
    floatLeft: session.floatLeft,
    reviewStatus: session.reviewStatus,
    reviewedBy: session.reviewedBy,
    reviewNote: session.reviewNote,
    reviewSelfVerified: session.reviewSelfVerified,
    discrepancyAcknowledged: session.discrepancyAcknowledged,
    finalStatus: session.finalStatus as FinalStatus,
    finalVersion: session.finalVersion,
    counts: counts.map((count) => ({ kind: count.kind, total: count.total, at: count.createdAt.toISOString() })),
    ledger: { entries: Number(ledger?.entries ?? 0), lastSeq: Number(ledger?.lastSeq ?? 0) },
    openIncidents: Number(incidents?.open ?? 0),
    pendingCashMovements: Number(movements?.pending ?? 0),
  };
  const exceptions: string[] = [];
  if (summary.countSkippedReason) exceptions.push("Ditutup tanpa hitungan pecahan (darurat)");
  if (summary.counts.some((count) => count.kind === "count_3")) {
    exceptions.push("Hitungan kasir #1 ≠ #2 (dipakai hitungan #3)");
  }
  if (summary.discrepancy !== 0) exceptions.push(`Selisih laci Rp${summary.discrepancy.toLocaleString("id-ID")}`);
  if (recountDiff !== null && recountDiff !== 0) {
    exceptions.push(`Hitung ulang pemeriksa selisih Rp${recountDiff.toLocaleString("id-ID")}`);
  }
  if (summary.qrisDiscrepancy !== null && summary.qrisDiscrepancy !== 0) {
    exceptions.push(`Selisih QRIS Rp${summary.qrisDiscrepancy.toLocaleString("id-ID")}`);
  }
  if (summary.openIncidents > 0) exceptions.push(`${summary.openIncidents} insiden belum selesai`);
  if (summary.pendingCashMovements > 0) exceptions.push(`${summary.pendingCashMovements} kas laci menunggu persetujuan`);
  if (summary.reviewSelfVerified) exceptions.push("Diverifikasi tanpa pemeriksa kedua");
  return { session, summary, exceptions, hash: summaryHashOf(summary) };
}

function assertOwner(garage: GarageSession) {
  if (garage.profile.role !== "Owner") {
    throw new AccountabilityError("OWNER_ONLY", "Final closing hanya oleh Owner.", 403);
  }
}

function assertDecidable(summary: Awaited<ReturnType<typeof loadSummary>>["summary"]) {
  if (summary.status !== "closed") {
    throw new AccountabilityError("SHIFT_OPEN", "Shift masih berlangsung — final setelah ditutup kasir.", 409);
  }
  if (summary.reviewStatus !== "verified") {
    throw new AccountabilityError(
      "MANAGER_REVIEW_REQUIRED",
      "Shift belum diverifikasi Manajer/pemeriksa. Final Owner setelah verifikasi.",
      409,
    );
  }
  if (!DECIDABLE.includes(summary.finalStatus)) {
    throw new AccountabilityError("ALREADY_FINAL", "Shift ini sudah final. Koreksi lewat pembalik/kasus.", 409);
  }
}

/** Ringkasan untuk layar persetujuan + tantangan 2FA (nonce sekali pakai, 5 menit). */
export async function getFinalApprovalPreview(sessionId: string, garage: GarageSession) {
  assertOwner(garage);
  const { summary, exceptions, hash } = await loadSummary(getDb(), sessionId, false);
  assertDecidable(summary);
  const challenge = await createStepUpChallenge({
    userId: garage.user.id,
    purpose: FINAL_PURPOSE,
    subjectId: sessionId,
    summaryHash: hash,
  });
  return { summary, exceptions, summaryHash: hash, ...challenge };
}

export type FinalDecisionInput = {
  decision: FinalDecision;
  note?: string | null;
  challengeId: string;
  nonce: string;
  code: string;
};

export async function decideFinalApproval(sessionId: string, input: FinalDecisionInput, garage: GarageSession) {
  assertOwner(garage);
  const note = input.note?.trim() || null;
  const result = await getDb().transaction(async (tx) => {
    // Kunci baris shift lalu hitung ulang ringkasan dari data terkunci: hash harus sama
    // dengan yang dilihat Owner saat tantangan dibuat.
    const { session, summary, exceptions, hash } = await loadSummary(tx, sessionId, true);
    assertDecidable(summary);
    if (input.decision === "approve" && exceptions.length > 0) {
      throw new AccountabilityError(
        "EXCEPTION_REQUIRED",
        `Shift ini punya pengecualian (${exceptions.join("; ")}). Pilih "Setujui dengan pengecualian" + catatan, atau kembalikan.`,
        409,
      );
    }
    if (input.decision !== "approve" && (!note || note.length < 10)) {
      throw new AccountabilityError("NOTE_REQUIRED", "Tulis alasan/catatan keputusan (minimal 10 karakter).");
    }
    await consumeStepUpChallenge(tx, {
      challengeId: input.challengeId,
      nonce: input.nonce,
      userId: garage.user.id,
      purpose: FINAL_PURPOSE,
      subjectId: sessionId,
      summaryHash: hash,
      code: input.code,
    });

    const now = new Date();
    const finalStatus: FinalStatus =
      input.decision === "approve" ? "approved" : input.decision === "approve_with_exception" ? "approved_with_exception" : "returned";
    const [updated] = await tx
      .update(cashSessions)
      .set({
        finalStatus,
        finalDecidedBy: garage.user.id,
        finalDecidedAt: now,
        finalNote: note,
        finalSummaryHash: hash,
        finalVersion: session.finalVersion + 1,
        // Dikembalikan = kembali ke pemeriksa (verifikasi ulang, hitung ulang bila perlu).
        ...(finalStatus === "returned"
          ? { reviewStatus: "needs_followup", reviewNote: `Dikembalikan Owner: ${note}` }
          : {}),
      })
      .where(and(eq(cashSessions.id, sessionId), eq(cashSessions.finalVersion, session.finalVersion)))
      .returning({ id: cashSessions.id });
    if (!updated) throw new AccountabilityError("ALREADY_FINAL", "Shift ini baru saja diputuskan. Muat ulang.", 409);

    // B7 (AC-F30): snapshot append-only dari ringkasan yang disetujui — PDF final dibaca dari sini.
    const version = session.finalVersion + 1;
    const reportId = finalReportId(session.code, version);
    await tx.insert(cashSessionFinalSnapshots).values({
      cashSessionId: sessionId,
      version,
      reportId,
      decision: input.decision,
      finalStatus,
      summary: summary as unknown as Record<string, unknown>,
      summaryHash: hash,
      exceptions,
      note,
      decidedBy: garage.user.id,
      decidedAt: now,
    });

    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      }).format(now),
      actor: `${garage.user.name} / Owner`,
      action:
        finalStatus === "approved"
          ? "Final closing disetujui"
          : finalStatus === "approved_with_exception"
            ? "Final closing disetujui dengan pengecualian"
            : "Closing dikembalikan Owner",
      object: session.code,
      device: garage.profile.deviceLabel,
      status: finalStatus === "approved" ? "recorded" : "warning",
      metadata: {
        cashSessionId: sessionId,
        decision: input.decision,
        before: { finalStatus: session.finalStatus, finalVersion: session.finalVersion },
        after: { finalStatus, finalVersion: version, reportId },
        summaryHash: hash,
        exceptions,
        note,
        stepUp: "totp",
        ownShift: session.openedBy === garage.user.id || session.closedBy === garage.user.id,
      },
    });
    return { finalStatus, finalVersion: version, reportId, summaryHash: hash, decidedAt: now.toISOString(), exceptions };
  });
  return { id: sessionId, ...result, decidedByName: garage.user.name, note };
}
