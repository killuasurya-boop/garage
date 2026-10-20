// =============================================================================
// Pertanggungjawaban kasir (owner, Okt 2026): petty cash (kas kecil terpisah
// dari laci), catatan kejadian shift, pemeriksaan Manajer atas laporan shift.
// Semua cek hak akses di sini (backend) + jejak di audit log.
// =============================================================================

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { cashSessions, pettyCashEntries, shiftIncidents, user } from "@/db/schema";
import { createAuditLog, roleDisplayName } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

export const PETTY_CASH_TYPES = ["topup", "expense", "adjustment"] as const;
export type PettyCashType = (typeof PETTY_CASH_TYPES)[number];
export const PETTY_CASH_STATUSES = ["submitted", "approved", "rejected", "cancelled"] as const;
export type PettyCashStatus = (typeof PETTY_CASH_STATUSES)[number];

export const PETTY_CASH_STATUS_LABEL: Record<PettyCashStatus, string> = {
  submitted: "Diajukan",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

export const PETTY_CASH_EXPENSE_CATEGORIES = [
  "Kebutuhan operasional",
  "Bahan mendadak",
  "Kebersihan",
  "Transport / ongkir",
  "Perbaikan kecil",
  "Lain-lain",
] as const;

export const PETTY_CASH_TOPUP_CATEGORIES = ["Pengisian dana", "Pengembalian sisa dana", "Lain-lain"] as const;

export const INCIDENT_CATEGORIES = [
  "Selisih kas",
  "Kesalahan transaksi",
  "Permintaan void",
  "Refund pelanggan",
  "Gangguan QRIS",
  "Pembayaran tidak teridentifikasi",
  "Produk habis",
  "Komplain pelanggan",
  "Perubahan metode bayar",
  "Pengeluaran mendadak",
  "Pergantian kasir",
  "Gangguan POS / printer",
  "Masalah stok",
  "Lainnya",
] as const;

export const INCIDENT_STATUSES = ["open", "follow_up", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  open: "Terbuka",
  follow_up: "Tindak lanjut",
  resolved: "Selesai",
};

export const SHIFT_REVIEW_STATUSES = ["pending", "verified", "needs_followup"] as const;
export type ShiftReviewStatus = (typeof SHIFT_REVIEW_STATUSES)[number];
export const SHIFT_REVIEW_LABEL: Record<ShiftReviewStatus, string> = {
  pending: "Menunggu pemeriksaan",
  verified: "Diverifikasi",
  needs_followup: "Perlu tindak lanjut",
};

export class AccountabilityError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function isAdmin(garage: GarageSession) {
  return garage.profile.role === "Owner" || garage.profile.role === "Manajer";
}

function assertAdmin(garage: GarageSession, action: string) {
  if (!isAdmin(garage)) {
    throw new AccountabilityError("FORBIDDEN", `${action} hanya untuk Owner/Manajer.`, 403);
  }
}

function actorLabel(garage: GarageSession) {
  return `${garage.user.name} / ${roleDisplayName[garage.profile.role]}`;
}

async function openSessionIdFor(garage: GarageSession) {
  const [row] = await getDb()
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(and(eq(cashSessions.openedBy, garage.user.id), eq(cashSessions.status, "open")))
    .limit(1);
  return row?.id ?? null;
}

/** Kasir hanya boleh menyentuh shift miliknya; Owner/Manajer semua. */
export async function assertSessionAccess(sessionId: string, garage: GarageSession) {
  const [row] = await getDb()
    .select({ id: cashSessions.id, openedBy: cashSessions.openedBy, outletId: cashSessions.outletId, status: cashSessions.status, code: cashSessions.code })
    .from(cashSessions)
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  if (!row) throw new AccountabilityError("NOT_FOUND", "Shift tidak ditemukan.", 404);
  if (!isAdmin(garage) && row.openedBy !== garage.user.id) {
    throw new AccountabilityError("FORBIDDEN", "Kasir hanya bisa mengakses shift miliknya sendiri.", 403);
  }
  return row;
}

// ── Petty cash ──────────────────────────────────────────────────────────────

export type PettyCashEntryRow = {
  id: string;
  entryNo: string;
  type: PettyCashType;
  category: string;
  description: string;
  amount: number;
  recipient: string | null;
  receiptNo: string | null;
  receiptUrl: string | null;
  status: PettyCashStatus;
  decisionNote: string | null;
  cashSessionId: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  entryAt: string;
};

/** Efek entri ke saldo: top-up +, pengeluaran −, penyesuaian ± (amount bertanda). */
export function pettyCashDelta(entry: Pick<PettyCashEntryRow, "type" | "amount">) {
  if (entry.type === "topup") return entry.amount;
  if (entry.type === "expense") return -entry.amount;
  return entry.amount;
}

/**
 * Saldo akhir = saldo awal + penambahan disetujui − pengeluaran disetujui
 * (± penyesuaian). Pengajuan yang belum diputuskan TIDAK mengubah saldo.
 */
export function summarizePettyCash(entries: PettyCashEntryRow[], openingBalance: number) {
  const approved = entries.filter((entry) => entry.status === "approved");
  const topups = approved.filter((entry) => entry.type === "topup").reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = approved.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const adjustments = approved.filter((entry) => entry.type === "adjustment").reduce((sum, entry) => sum + entry.amount, 0);
  const pending = entries.filter((entry) => entry.status === "submitted");
  let running = openingBalance;
  const ledger = entries.map((entry) => {
    if (entry.status === "approved") running += pettyCashDelta(entry);
    return { ...entry, runningBalance: entry.status === "approved" ? running : null };
  });
  return {
    openingBalance,
    topups,
    expenses,
    adjustments,
    closingBalance: openingBalance + topups - expenses + adjustments,
    pendingCount: pending.length,
    pendingExpenseTotal: pending.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0),
    rejectedCount: entries.filter((entry) => entry.status === "rejected").length,
    ledger,
  };
}

const approverUser = sql<string | null>`(select name from "user" where id = ${pettyCashEntries.approvedBy})`;

export async function listPettyCashEntries(filter: {
  outletId: string | null;
  from?: Date;
  to?: Date;
  cashSessionId?: string;
}): Promise<PettyCashEntryRow[]> {
  const conditions = [];
  if (filter.outletId) conditions.push(eq(pettyCashEntries.outletId, filter.outletId));
  if (filter.cashSessionId) conditions.push(eq(pettyCashEntries.cashSessionId, filter.cashSessionId));
  if (filter.from) conditions.push(gte(pettyCashEntries.entryAt, filter.from));
  if (filter.to) conditions.push(lt(pettyCashEntries.entryAt, filter.to));
  const rows = await getDb()
    .select({
      entry: pettyCashEntries,
      createdByName: user.name,
      approvedByName: approverUser,
    })
    .from(pettyCashEntries)
    .leftJoin(user, eq(user.id, pettyCashEntries.createdBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(pettyCashEntries.entryAt));
  return rows.map(({ entry, createdByName, approvedByName }) => ({
    id: entry.id,
    entryNo: entry.entryNo,
    type: entry.type as PettyCashType,
    category: entry.category,
    description: entry.description,
    amount: entry.amount,
    recipient: entry.recipient,
    receiptNo: entry.receiptNo,
    receiptUrl: entry.receiptUrl,
    status: entry.status as PettyCashStatus,
    decisionNote: entry.decisionNote,
    cashSessionId: entry.cashSessionId,
    createdByName: createdByName ?? null,
    approvedByName: approvedByName ?? null,
    approvedAt: entry.approvedAt?.toISOString() ?? null,
    entryAt: entry.entryAt.toISOString(),
  }));
}

/** Saldo petty cash outlet sebelum `before` (hanya entri disetujui). */
export async function pettyCashBalanceBefore(outletId: string | null, before: Date) {
  const conditions = [eq(pettyCashEntries.status, "approved"), lt(pettyCashEntries.entryAt, before)];
  if (outletId) conditions.push(eq(pettyCashEntries.outletId, outletId));
  const [row] = await getDb()
    .select({
      balance: sql<number>`coalesce(sum(case
        when ${pettyCashEntries.type} = 'topup' then ${pettyCashEntries.amount}
        when ${pettyCashEntries.type} = 'expense' then -${pettyCashEntries.amount}
        else ${pettyCashEntries.amount} end), 0)::int`,
    })
    .from(pettyCashEntries)
    .where(and(...conditions));
  return Number(row?.balance ?? 0);
}

export type PettyCashInput = {
  type: PettyCashType;
  category: string;
  description: string;
  amount: number;
  recipient?: string | null;
  receiptNo?: string | null;
  receiptUrl?: string | null;
};

export async function createPettyCashEntry(input: PettyCashInput, garage: GarageSession) {
  const admin = isAdmin(garage);
  if (!admin && input.type !== "expense") {
    throw new AccountabilityError("FORBIDDEN", "Kasir hanya bisa mengajukan pengeluaran petty cash.", 403);
  }
  if (!Number.isInteger(input.amount) || input.amount === 0 || (input.type !== "adjustment" && input.amount < 0)) {
    throw new AccountabilityError("INVALID_AMOUNT", "Nominal petty cash tidak valid.");
  }
  if (input.description.trim().length < 3) {
    throw new AccountabilityError("DESCRIPTION_REQUIRED", "Uraian kebutuhan wajib diisi.");
  }
  const now = new Date();
  const entryNo = `PC-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  // Owner/Manajer mencatat langsung (sudah disetujui); pengajuan kasir menunggu keputusan.
  const status: PettyCashStatus = admin ? "approved" : "submitted";
  const [row] = await getDb()
    .insert(pettyCashEntries)
    .values({
      entryNo,
      outletId: garage.profile.outlet.id,
      cashSessionId: await openSessionIdFor(garage),
      type: input.type,
      category: input.category.trim(),
      description: input.description.trim(),
      amount: input.amount,
      recipient: input.recipient?.trim() || null,
      receiptNo: input.receiptNo?.trim() || null,
      receiptUrl: input.receiptUrl?.trim() || null,
      status,
      createdBy: garage.user.id,
      approvedBy: admin ? garage.user.id : null,
      approvedAt: admin ? now : null,
      entryAt: now,
    })
    .returning();
  await createAuditLog({
    actor: actorLabel(garage),
    action: admin ? "Petty cash dicatat" : "Petty cash diajukan",
    object: `${entryNo} · ${input.category}: ${input.description}`,
    device: garage.profile.deviceLabel,
    metadata: { pettyCashId: row.id, entryNo, type: input.type, amount: input.amount, status },
  });
  return row;
}

export async function decidePettyCashEntry(
  id: string,
  input: { decision: "approve" | "reject" | "cancel"; note?: string | null },
  garage: GarageSession,
) {
  const db = getDb();
  const [entry] = await db.select().from(pettyCashEntries).where(eq(pettyCashEntries.id, id)).limit(1);
  if (!entry) throw new AccountabilityError("NOT_FOUND", "Entri petty cash tidak ditemukan.", 404);
  if (entry.status !== "submitted" && !(input.decision === "cancel" && entry.status === "approved" && isAdmin(garage))) {
    throw new AccountabilityError("INVALID_STATE", `Entri sudah ${PETTY_CASH_STATUS_LABEL[entry.status as PettyCashStatus] ?? entry.status}.`, 409);
  }
  if (input.decision === "cancel") {
    if (!isAdmin(garage) && entry.createdBy !== garage.user.id) {
      throw new AccountabilityError("FORBIDDEN", "Hanya pengaju atau Owner/Manajer yang bisa membatalkan.", 403);
    }
  } else {
    assertAdmin(garage, "Persetujuan petty cash");
  }
  if (input.decision !== "approve" && !(input.note ?? "").trim()) {
    throw new AccountabilityError("NOTE_REQUIRED", "Alasan wajib diisi.");
  }
  const status: PettyCashStatus =
    input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "cancelled";
  const now = new Date();
  const [updated] = await db
    .update(pettyCashEntries)
    .set({
      status,
      decisionNote: input.note?.trim() || null,
      approvedBy: input.decision === "approve" ? garage.user.id : entry.approvedBy,
      approvedAt: input.decision === "approve" ? now : entry.approvedAt,
    })
    .where(eq(pettyCashEntries.id, id))
    .returning();
  await createAuditLog({
    actor: actorLabel(garage),
    action: `Petty cash ${PETTY_CASH_STATUS_LABEL[status].toLowerCase()}`,
    object: `${entry.entryNo} · ${entry.description}`,
    device: garage.profile.deviceLabel,
    status: status === "approved" ? "recorded" : "warning",
    metadata: {
      pettyCashId: id,
      entryNo: entry.entryNo,
      before: { status: entry.status },
      after: { status },
      reason: input.note?.trim() || null,
      amount: entry.amount,
    },
  });
  return updated;
}

// ── Catatan kejadian ────────────────────────────────────────────────────────

export type IncidentInput = {
  cashSessionId?: string | null;
  category: string;
  description: string;
  occurredAt?: string | null;
  orderNo?: string | null;
  financialImpact?: number | null;
  actionTaken?: string | null;
  responsibleName?: string | null;
  status?: IncidentStatus;
};

export async function createShiftIncident(input: IncidentInput, garage: GarageSession) {
  const sessionId = input.cashSessionId || (await openSessionIdFor(garage));
  if (sessionId) await assertSessionAccess(sessionId, garage);
  if (input.description.trim().length < 3) {
    throw new AccountabilityError("DESCRIPTION_REQUIRED", "Deskripsi kejadian wajib diisi.");
  }
  const [row] = await getDb()
    .insert(shiftIncidents)
    .values({
      outletId: garage.profile.outlet.id,
      cashSessionId: sessionId,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      category: input.category.trim(),
      description: input.description.trim(),
      orderNo: input.orderNo?.trim() || null,
      financialImpact: input.financialImpact ?? null,
      actionTaken: input.actionTaken?.trim() || null,
      responsibleName: input.responsibleName?.trim() || null,
      status: input.status ?? "open",
      reportedBy: garage.user.id,
    })
    .returning();
  await createAuditLog({
    actor: actorLabel(garage),
    action: "Catatan kejadian shift",
    object: `${input.category}: ${input.description.trim().slice(0, 80)}`,
    device: garage.profile.deviceLabel,
    status: "warning",
    metadata: { incidentId: row.id, cashSessionId: sessionId, orderNo: row.orderNo, financialImpact: row.financialImpact },
  });
  return row;
}

export async function updateShiftIncident(
  id: string,
  input: { actionTaken?: string | null; status?: IncidentStatus; managerNote?: string | null; responsibleName?: string | null },
  garage: GarageSession,
) {
  const db = getDb();
  const [row] = await db.select().from(shiftIncidents).where(eq(shiftIncidents.id, id)).limit(1);
  if (!row) throw new AccountabilityError("NOT_FOUND", "Catatan kejadian tidak ditemukan.", 404);
  const admin = isAdmin(garage);
  if (!admin && row.reportedBy !== garage.user.id) {
    throw new AccountabilityError("FORBIDDEN", "Hanya pelapor atau Owner/Manajer yang bisa mengubah catatan ini.", 403);
  }
  if (input.managerNote !== undefined && !admin) {
    throw new AccountabilityError("FORBIDDEN", "Catatan Manajer hanya untuk Owner/Manajer.", 403);
  }
  const resolved = input.status === "resolved" && row.status !== "resolved";
  const [updated] = await db
    .update(shiftIncidents)
    .set({
      ...(input.actionTaken !== undefined ? { actionTaken: input.actionTaken?.trim() || null } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.managerNote !== undefined ? { managerNote: input.managerNote?.trim() || null } : {}),
      ...(input.responsibleName !== undefined ? { responsibleName: input.responsibleName?.trim() || null } : {}),
      ...(resolved ? { resolvedBy: garage.user.id, resolvedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(shiftIncidents.id, id))
    .returning();
  await createAuditLog({
    actor: actorLabel(garage),
    action: "Catatan kejadian diperbarui",
    object: `${row.category}: ${row.description.slice(0, 60)}`,
    device: garage.profile.deviceLabel,
    metadata: {
      incidentId: id,
      before: { status: row.status, actionTaken: row.actionTaken, managerNote: row.managerNote },
      after: { status: updated.status, actionTaken: updated.actionTaken, managerNote: updated.managerNote },
    },
  });
  return updated;
}

export async function listShiftIncidents(filter: { cashSessionIds?: string[]; outletId?: string | null; from?: Date; to?: Date }) {
  const conditions = [];
  if (filter.cashSessionIds) {
    if (!filter.cashSessionIds.length) return [];
    conditions.push(inArray(shiftIncidents.cashSessionId, filter.cashSessionIds));
  }
  if (filter.outletId) conditions.push(eq(shiftIncidents.outletId, filter.outletId));
  if (filter.from) conditions.push(gte(shiftIncidents.occurredAt, filter.from));
  if (filter.to) conditions.push(lt(shiftIncidents.occurredAt, filter.to));
  const resolver = sql<string | null>`(select name from "user" where id = ${shiftIncidents.resolvedBy})`;
  const rows = await getDb()
    .select({ incident: shiftIncidents, reportedByName: user.name, resolvedByName: resolver })
    .from(shiftIncidents)
    .leftJoin(user, eq(user.id, shiftIncidents.reportedBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(shiftIncidents.occurredAt));
  return rows.map(({ incident, reportedByName, resolvedByName }) => ({
    id: incident.id,
    cashSessionId: incident.cashSessionId,
    occurredAt: incident.occurredAt.toISOString(),
    category: incident.category,
    description: incident.description,
    orderNo: incident.orderNo,
    financialImpact: incident.financialImpact,
    actionTaken: incident.actionTaken,
    status: incident.status as IncidentStatus,
    responsibleName: incident.responsibleName,
    managerNote: incident.managerNote,
    reportedByName: reportedByName ?? null,
    resolvedByName: resolvedByName ?? null,
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
  }));
}

// ── Pemeriksaan Manajer ─────────────────────────────────────────────────────

export async function reviewCashSession(
  sessionId: string,
  input: { status: Exclude<ShiftReviewStatus, "pending">; note?: string | null },
  garage: GarageSession,
) {
  assertAdmin(garage, "Verifikasi laporan shift");
  const session = await assertSessionAccess(sessionId, garage);
  if (session.status !== "closed") {
    throw new AccountabilityError("SHIFT_OPEN", "Shift masih berlangsung — verifikasi setelah ditutup.", 409);
  }
  if (input.status === "needs_followup" && !(input.note ?? "").trim()) {
    throw new AccountabilityError("NOTE_REQUIRED", "Tuliskan tindak lanjut yang diperlukan.");
  }
  const db = getDb();
  const [before] = await db
    .select({ reviewStatus: cashSessions.reviewStatus, reviewNote: cashSessions.reviewNote })
    .from(cashSessions)
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  const now = new Date();
  await db
    .update(cashSessions)
    .set({ reviewStatus: input.status, reviewNote: input.note?.trim() || null, reviewedBy: garage.user.id, reviewedAt: now })
    .where(eq(cashSessions.id, sessionId));
  await createAuditLog({
    actor: actorLabel(garage),
    action: input.status === "verified" ? "Laporan shift diverifikasi" : "Laporan shift perlu tindak lanjut",
    object: session.code,
    device: garage.profile.deviceLabel,
    status: input.status === "verified" ? "recorded" : "warning",
    metadata: { cashSessionId: sessionId, before, after: { reviewStatus: input.status, reviewNote: input.note ?? null } },
  });
  return { id: sessionId, reviewStatus: input.status, reviewNote: input.note?.trim() || null, reviewedAt: now.toISOString() };
}

export async function verifyOpeningCash(sessionId: string, garage: GarageSession) {
  assertAdmin(garage, "Verifikasi modal awal");
  const session = await assertSessionAccess(sessionId, garage);
  const now = new Date();
  await getDb()
    .update(cashSessions)
    .set({ openingVerifiedBy: garage.user.id, openingVerifiedAt: now })
    .where(eq(cashSessions.id, sessionId));
  await createAuditLog({
    actor: actorLabel(garage),
    action: "Modal awal diverifikasi",
    object: session.code,
    device: garage.profile.deviceLabel,
    metadata: { cashSessionId: sessionId },
  });
  return { id: sessionId, openingVerifiedAt: now.toISOString(), openingVerifiedByName: garage.user.name };
}
