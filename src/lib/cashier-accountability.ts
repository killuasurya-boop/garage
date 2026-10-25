// =============================================================================
// Pertanggungjawaban kasir (owner, Okt 2026): petty cash (kas kecil terpisah
// dari laci), catatan kejadian shift, pemeriksaan Manajer atas laporan shift.
// Semua cek hak akses di sini (backend) + jejak di audit log.
// =============================================================================

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { cashSessions, pettyCashEntries, shiftIncidents, user } from "@/db/schema";
import { isValidDenominationKey, sumDenominations } from "@/lib/cash-denominations";
import { accountBalance, postAccountCash, type CashAccount } from "@/lib/cash-ledger";
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

/**
 * Kasir hanya boleh menyentuh shift miliknya; Manajer hanya shift outletnya (P4);
 * Owner semua outlet.
 */
export async function assertSessionAccess(sessionId: string, garage: GarageSession) {
  const [row] = await getDb()
    .select({
      id: cashSessions.id,
      openedBy: cashSessions.openedBy,
      closedBy: cashSessions.closedBy,
      outletId: cashSessions.outletId,
      status: cashSessions.status,
      code: cashSessions.code,
    })
    .from(cashSessions)
    .where(eq(cashSessions.id, sessionId))
    .limit(1);
  if (!row) throw new AccountabilityError("NOT_FOUND", "Shift tidak ditemukan.", 404);
  if (!isAdmin(garage) && row.openedBy !== garage.user.id) {
    throw new AccountabilityError("FORBIDDEN", "Kasir hanya bisa mengakses shift miliknya sendiri.", 403);
  }
  if (garage.profile.role === "Manajer" && row.outletId && row.outletId !== garage.profile.outlet.id) {
    throw new AccountabilityError("FORBIDDEN", "Manajer hanya bisa mengakses shift di outletnya sendiri.", 403);
  }
  return row;
}

// ── Petty cash ──────────────────────────────────────────────────────────────
// P2 (owner, Okt 2026): status persetujuan ≠ pembayaran. Saldo petty cash = buku
// kas akun `petty` (cash_ledger_entries) — hanya bergerak saat uang benar-benar
// diserahkan/diterima ("Bayar"). Pengaju ≠ penyetuju (Owner = pengecualian
// tercatat "tanpa pemeriksa kedua"). Bayar dikunci per outlet & tidak boleh
// melebihi saldo. Batal setelah dibayar = baris pembalik (riwayat tetap).

export const PETTY_FUND_SOURCES = ["bank_jago", "bank_bni", "external"] as const;
export type PettyFundSource = (typeof PETTY_FUND_SOURCES)[number];

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
  /** Uang sudah diserahkan/diterima (buku kas). null = belum. */
  paidAt?: string | null;
  paidByName?: string | null;
  /** Dibatalkan setelah dibayar — ada baris pembalik di buku kas. */
  reversed?: boolean;
  fundSource?: string | null;
  selfApproved?: boolean;
};

/** Efek entri ke saldo: top-up +, pengeluaran −, penyesuaian ± (amount bertanda). */
export function pettyCashDelta(entry: Pick<PettyCashEntryRow, "type" | "amount">) {
  if (entry.type === "topup") return entry.amount;
  if (entry.type === "expense") return -entry.amount;
  return entry.amount;
}

/** Uangnya bergerak (dibayar & tidak dibalik). Data tanpa info pembayaran = aturan lama (disetujui). */
function moved(entry: PettyCashEntryRow) {
  if (entry.paidAt === undefined) return entry.status === "approved";
  return Boolean(entry.paidAt) && !entry.reversed;
}

/**
 * Saldo akhir = saldo awal + dana masuk dibayar − pengeluaran dibayar (± penyesuaian).
 * Pengajuan/disetujui-belum-dibayar TIDAK mengubah saldo. `closingFromLedger` (buku
 * kas) menjadi saldo akhir resmi; beda dengan hitungan entri = pembatalan entri hari lain.
 */
export function summarizePettyCash(entries: PettyCashEntryRow[], openingBalance: number, closingFromLedger?: number) {
  const paid = entries.filter(moved);
  const topups = paid.filter((entry) => entry.type === "topup").reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = paid.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const adjustments = paid.filter((entry) => entry.type === "adjustment").reduce((sum, entry) => sum + entry.amount, 0);
  const pending = entries.filter((entry) => entry.status === "submitted");
  const awaitingPayment = entries.filter((entry) => entry.status === "approved" && entry.paidAt === null);
  let running = openingBalance;
  const ledger = entries.map((entry) => {
    if (moved(entry)) running += pettyCashDelta(entry);
    return { ...entry, runningBalance: moved(entry) ? running : null };
  });
  const computedClosing = openingBalance + topups - expenses + adjustments;
  return {
    openingBalance,
    topups,
    expenses,
    adjustments,
    closingBalance: closingFromLedger ?? computedClosing,
    /** Pembatalan (baris pembalik) atas entri di luar rentang tanggal ini. */
    otherDayReversals: closingFromLedger === undefined ? 0 : closingFromLedger - computedClosing,
    pendingCount: pending.length,
    pendingExpenseTotal: pending.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0),
    awaitingPaymentCount: awaitingPayment.length,
    awaitingPaymentTotal: awaitingPayment.reduce((sum, entry) => sum + Math.abs(pettyCashDelta(entry)), 0),
    rejectedCount: entries.filter((entry) => entry.status === "rejected").length,
    ledger,
  };
}

const approverUser = sql<string | null>`(select name from "user" where id = ${pettyCashEntries.approvedBy})`;
const payerUser = sql<string | null>`(select name from "user" where id = ${pettyCashEntries.paidBy})`;

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
      paidByName: payerUser,
    })
    .from(pettyCashEntries)
    .leftJoin(user, eq(user.id, pettyCashEntries.createdBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(pettyCashEntries.entryAt));
  return rows.map(({ entry, createdByName, approvedByName, paidByName }) => ({
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
    paidAt: entry.paidAt?.toISOString() ?? null,
    paidByName: paidByName ?? null,
    reversed: Boolean(entry.reversalLedgerEntryId),
    fundSource: entry.fundSource,
    selfApproved: entry.selfApproved,
  }));
}

/** Saldo petty cash outlet sebelum `before` menurut buku kas (riwayat tidak berubah). */
export async function pettyCashBalanceBefore(outletId: string | null, before: Date) {
  return accountBalance("petty", outletId, before);
}

/** Saldo petty cash outlet sampai `at` (default sekarang). */
export async function pettyCashBalance(outletId: string | null, at?: Date) {
  return accountBalance("petty", outletId, at);
}

export type PettyCashInput = {
  type: PettyCashType;
  category: string;
  description: string;
  amount: number;
  recipient?: string | null;
  receiptNo?: string | null;
  receiptUrl?: string | null;
  /** Top-up: sumber dana (Rekening Jago/BNI/uang pribadi Owner). */
  fundSource?: PettyFundSource | null;
};

type PettyRow = typeof pettyCashEntries.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function lockPettyOutlet(tx: Tx, outletId: string | null) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`petty:${outletId ?? "-"}`}))`);
}

/** Uang bergerak: posting buku kas akun petty (cek saldo untuk uang keluar). */
async function postPettyMovement(tx: Tx, entry: PettyRow, garage: GarageSession, at: Date) {
  const outflow = pettyCashDelta({ type: entry.type as PettyCashType, amount: entry.amount }) < 0;
  await lockPettyOutlet(tx, entry.outletId);
  if (outflow) {
    const balance = await accountBalance("petty", entry.outletId, undefined, tx as never);
    if (Math.abs(entry.amount) > balance) {
      throw new AccountabilityError(
        "PETTY_INSUFFICIENT",
        `Saldo petty cash ${rupiah(balance)} tidak cukup untuk ${rupiah(Math.abs(entry.amount))}. Isi dana dulu.`,
        409,
      );
    }
  }
  const from: CashAccount =
    entry.type === "topup" ? ((entry.fundSource as CashAccount | null) ?? "external") : outflow ? "petty" : "external";
  const to: CashAccount = outflow ? "external" : "petty";
  const posted = await postAccountCash(tx as never, {
    from,
    to,
    amount: Math.abs(entry.amount),
    outletId: entry.outletId,
    sourceType: entry.type === "topup" ? "petty_topup" : entry.type === "expense" ? "petty_expense" : "petty_adjustment",
    sourceId: entry.id,
    sourceRef: entry.entryNo,
    actorUserId: garage.user.id,
    approverUserId: entry.approvedBy,
    note: entry.description,
    occurredAt: at,
    idempotencyKey: `petty:${entry.id}`,
  });
  return posted.id;
}

function rupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export async function createPettyCashEntry(input: PettyCashInput, garage: GarageSession) {
  const admin = isAdmin(garage);
  const owner = garage.profile.role === "Owner";
  if (!admin && input.type !== "expense") {
    throw new AccountabilityError("FORBIDDEN", "Kasir hanya bisa mengajukan pengeluaran petty cash.", 403);
  }
  if (!Number.isInteger(input.amount) || input.amount === 0 || (input.type !== "adjustment" && input.amount < 0)) {
    throw new AccountabilityError("INVALID_AMOUNT", "Nominal petty cash tidak valid.");
  }
  if (input.description.trim().length < 3) {
    throw new AccountabilityError("DESCRIPTION_REQUIRED", "Uraian kebutuhan wajib diisi.");
  }
  if (input.type === "expense" && owner && !input.recipient?.trim()) {
    throw new AccountabilityError("RECIPIENT_REQUIRED", "Isi penerima dana — uang langsung diserahkan saat dicatat Owner.");
  }
  const now = new Date();
  const entryNo = `PC-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  // Owner mencatat = disetujui & dibayar sekarang (pengecualian tercatat, tanpa pemeriksa
  // kedua). Manajer & Kasir = pengajuan → disetujui Owner/Manajer lain → dibayar.
  const status: PettyCashStatus = owner ? "approved" : "submitted";
  // Di luar transaksi: query lewat koneksi lain di dalam tx bisa saling menunggu.
  const cashSessionId = await openSessionIdFor(garage);
  const row = await getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(pettyCashEntries)
      .values({
        entryNo,
        outletId: garage.profile.outlet.id,
        cashSessionId,
        type: input.type,
        category: input.category.trim(),
        description: input.description.trim(),
        amount: input.amount,
        recipient: input.recipient?.trim() || null,
        receiptNo: input.receiptNo?.trim() || null,
        receiptUrl: input.receiptUrl?.trim() || null,
        fundSource: input.type === "topup" ? (input.fundSource ?? "external") : null,
        status,
        selfApproved: owner,
        createdBy: garage.user.id,
        approvedBy: owner ? garage.user.id : null,
        approvedAt: owner ? now : null,
        entryAt: now,
      })
      .returning();
    if (!owner) return created;
    const ledgerEntryId = await postPettyMovement(tx, created, garage, now);
    const [paid] = await tx
      .update(pettyCashEntries)
      .set({ paidAt: now, paidBy: garage.user.id, ledgerEntryId })
      .where(eq(pettyCashEntries.id, created.id))
      .returning();
    return paid;
  });
  await createAuditLog({
    actor: actorLabel(garage),
    action: owner ? "Petty cash dicatat (Owner, tanpa pemeriksa kedua)" : "Petty cash diajukan",
    object: `${entryNo} · ${input.category}: ${input.description}`,
    device: garage.profile.deviceLabel,
    metadata: { pettyCashId: row.id, entryNo, type: input.type, amount: input.amount, status, selfApproved: owner },
  });
  return row;
}

export type PettyCashDecision = "approve" | "reject" | "cancel" | "pay";

export async function decidePettyCashEntry(
  id: string,
  input: { decision: PettyCashDecision; note?: string | null; recipient?: string | null; receiptNo?: string | null },
  garage: GarageSession,
) {
  const note = input.note?.trim() || null;
  const now = new Date();
  const result = await getDb().transaction(async (tx) => {
    // Kunci baris: dua keputusan bersamaan → hanya satu yang sah.
    const [entry] = await tx.select().from(pettyCashEntries).where(eq(pettyCashEntries.id, id)).for("update");
    if (!entry) throw new AccountabilityError("NOT_FOUND", "Entri petty cash tidak ditemukan.", 404);
    if (isAdmin(garage) && garage.profile.role !== "Owner" && entry.outletId && entry.outletId !== garage.profile.outlet.id) {
      throw new AccountabilityError("FORBIDDEN", "Entri petty cash outlet lain.", 403);
    }
    const label = PETTY_CASH_STATUS_LABEL[entry.status as PettyCashStatus] ?? entry.status;
    const before = { status: entry.status, paidAt: entry.paidAt?.toISOString() ?? null };

    if (input.decision === "approve" || input.decision === "reject") {
      assertAdmin(garage, "Persetujuan petty cash");
      if (entry.status !== "submitted") throw new AccountabilityError("INVALID_STATE", `Entri sudah ${label}.`, 409);
      if (entry.createdBy === garage.user.id) {
        throw new AccountabilityError("SELF_APPROVAL", "Pengajuan sendiri harus diputuskan Owner atau Manajer lain.", 403);
      }
      if (input.decision === "reject" && !note) throw new AccountabilityError("NOTE_REQUIRED", "Alasan wajib diisi.");
      const [updated] = await tx
        .update(pettyCashEntries)
        .set(
          input.decision === "approve"
            ? { status: "approved", approvedBy: garage.user.id, approvedAt: now, decisionNote: note }
            : { status: "rejected", decisionNote: note },
        )
        .where(and(eq(pettyCashEntries.id, id), eq(pettyCashEntries.status, "submitted")))
        .returning();
      return { entry, updated, action: input.decision === "approve" ? "Petty cash disetujui (belum dibayar)" : "Petty cash ditolak", before };
    }

    if (input.decision === "pay") {
      assertAdmin(garage, "Pembayaran petty cash");
      if (entry.status !== "approved") throw new AccountabilityError("INVALID_STATE", `Entri ${label} — hanya yang disetujui bisa dibayar.`, 409);
      if (entry.paidAt) throw new AccountabilityError("ALREADY_PAID", "Entri ini sudah dibayar.", 409);
      const recipient = input.recipient?.trim() || entry.recipient;
      if (entry.type === "expense" && !recipient) {
        throw new AccountabilityError("RECIPIENT_REQUIRED", "Isi penerima dana saat uang diserahkan.");
      }
      const prepared = { ...entry, recipient, receiptNo: input.receiptNo?.trim() || entry.receiptNo };
      const ledgerEntryId = await postPettyMovement(tx, prepared, garage, now);
      const [updated] = await tx
        .update(pettyCashEntries)
        .set({ paidAt: now, paidBy: garage.user.id, ledgerEntryId, recipient, receiptNo: prepared.receiptNo })
        .where(eq(pettyCashEntries.id, id))
        .returning();
      return { entry, updated, action: entry.type === "topup" ? "Dana petty cash diterima" : "Petty cash dibayar", before };
    }

    // cancel
    if (!note) throw new AccountabilityError("NOTE_REQUIRED", "Alasan wajib diisi.");
    if (entry.status === "submitted") {
      if (!isAdmin(garage) && entry.createdBy !== garage.user.id) {
        throw new AccountabilityError("FORBIDDEN", "Hanya pengaju atau Owner/Manajer yang bisa membatalkan.", 403);
      }
    } else if (entry.status === "approved") {
      assertAdmin(garage, "Pembatalan petty cash");
    } else {
      throw new AccountabilityError("INVALID_STATE", `Entri sudah ${label}.`, 409);
    }
    let reversalLedgerEntryId: string | null = null;
    if (entry.paidAt && entry.ledgerEntryId) {
      // Sudah dibayar → baris pembalik di buku kas (saldo historis tetap).
      const inflowBack = pettyCashDelta({ type: entry.type as PettyCashType, amount: entry.amount }) < 0;
      await lockPettyOutlet(tx, entry.outletId);
      if (!inflowBack) {
        const balance = await accountBalance("petty", entry.outletId, undefined, tx as never);
        if (Math.abs(entry.amount) > balance) {
          throw new AccountabilityError("PETTY_INSUFFICIENT", `Saldo petty cash ${rupiah(balance)} tidak cukup untuk membatalkan penambahan dana ini.`, 409);
        }
      }
      const reversal = await postAccountCash(tx as never, {
        from: inflowBack ? "external" : "petty",
        to: inflowBack ? "petty" : entry.type === "topup" ? ((entry.fundSource as CashAccount | null) ?? "external") : "external",
        amount: Math.abs(entry.amount),
        outletId: entry.outletId,
        sourceType: "petty_reversal",
        sourceId: entry.id,
        sourceRef: entry.entryNo,
        reversesId: entry.ledgerEntryId,
        actorUserId: garage.user.id,
        note,
        occurredAt: now,
        idempotencyKey: `petty_reversal:${entry.id}`,
      });
      reversalLedgerEntryId = reversal.id;
    }
    const [updated] = await tx
      .update(pettyCashEntries)
      .set({ status: "cancelled", decisionNote: note, reversalLedgerEntryId })
      .where(eq(pettyCashEntries.id, id))
      .returning();
    return { entry, updated, action: reversalLedgerEntryId ? "Petty cash dibatalkan (dibalik)" : "Petty cash dibatalkan", before };
  });

  await createAuditLog({
    actor: actorLabel(garage),
    action: result.action,
    object: `${result.entry.entryNo} · ${result.entry.description}`,
    device: garage.profile.deviceLabel,
    status: result.updated.status === "approved" ? "recorded" : "warning",
    metadata: {
      pettyCashId: id,
      entryNo: result.entry.entryNo,
      before: result.before,
      after: { status: result.updated.status, paidAt: result.updated.paidAt?.toISOString() ?? null },
      reason: note,
      amount: result.entry.amount,
    },
  });
  return result.updated;
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
  if (admin && garage.profile.role === "Manajer" && row.outletId && row.outletId !== garage.profile.outlet.id) {
    throw new AccountabilityError("FORBIDDEN", "Manajer hanya bisa mengubah catatan kejadian di outletnya sendiri.", 403);
  }
  if (input.managerNote !== undefined && !admin) {
    throw new AccountabilityError("FORBIDDEN", "Catatan Manajer hanya untuk Owner/Manajer.", 403);
  }
  const resolved = input.status === "resolved" && row.status !== "resolved";
  // P4: kejadian diselesaikan oleh pemeriksa, bukan pelapornya sendiri (Owner =
  // pengecualian tercatat). Pelapor tetap boleh menulis tindakan yang diambil.
  const selfResolved = resolved && row.reportedBy === garage.user.id;
  if (resolved && (!admin || (selfResolved && garage.profile.role !== "Owner"))) {
    throw new AccountabilityError(
      "INDEPENDENT_REVIEW_REQUIRED",
      "Kejadian ditandai selesai oleh Manajer/Owner lain — bukan oleh pelapornya sendiri.",
      403,
    );
  }
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
      ...(selfResolved ? { selfResolved: true, note: "tanpa pemeriksa kedua" } : {}),
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

export type ReviewCashSessionInput = {
  status: Exclude<ShiftReviewStatus, "pending">;
  note?: string | null;
  /** Hitung ulang uang laci oleh pemeriksa (pecahan). Hitungan pertama kasir tidak diubah. */
  recountDenominations?: Record<string, number> | null;
  /** Wajib true (+ catatan) untuk "verified" bila ada selisih ≠ Rp0. */
  acknowledgeDiscrepancy?: boolean;
};

/**
 * P3/P4 (owner, Okt 2026): verifikasi independen.
 * - Pemeriksa ≠ pemilik shift (yang buka/tutup). Owner = pengecualian berlabel
 *   "tanpa pemeriksa kedua"; Manajer harus diperiksa Manajer lain/Owner.
 * - Manajer hanya outletnya sendiri (assertSessionAccess).
 * - Selisih ≠ Rp0 (hitungan pertama atau hitung ulang) hanya bisa "verified" bila
 *   pemeriksa mengakui selisih + menulis catatan. Hitungan pertama tidak pernah ditimpa.
 */
export async function reviewCashSession(sessionId: string, input: ReviewCashSessionInput, garage: GarageSession) {
  assertAdmin(garage, "Verifikasi laporan shift");
  const session = await assertSessionAccess(sessionId, garage);
  if (session.status !== "closed") {
    throw new AccountabilityError("SHIFT_OPEN", "Shift masih berlangsung — verifikasi setelah ditutup.", 409);
  }
  const note = input.note?.trim() || null;
  if (input.status === "needs_followup" && !note) {
    throw new AccountabilityError("NOTE_REQUIRED", "Tuliskan tindak lanjut yang diperlukan.");
  }
  const ownShift = session.openedBy === garage.user.id || session.closedBy === garage.user.id;
  const selfVerified = ownShift && garage.profile.role === "Owner";
  if (ownShift && !selfVerified) {
    throw new AccountabilityError(
      "INDEPENDENT_REVIEW_REQUIRED",
      "Shift ini milik Anda — minta Manajer lain atau Owner memeriksanya.",
      403,
    );
  }
  const db = getDb();
  const [before] = await db
    .select({
      reviewStatus: cashSessions.reviewStatus,
      reviewNote: cashSessions.reviewNote,
      expectedCash: cashSessions.expectedCash,
      actualCash: cashSessions.actualCash,
      discrepancy: cashSessions.discrepancy,
      recountCash: cashSessions.recountCash,
      discrepancyAcknowledged: cashSessions.discrepancyAcknowledged,
    })
    .from(cashSessions)
    .where(eq(cashSessions.id, sessionId))
    .limit(1);

  const recountGiven =
    input.recountDenominations && Object.keys(input.recountDenominations).some(isValidDenominationKey);
  const recountCash = recountGiven ? sumDenominations(input.recountDenominations!) : before.recountCash;
  const recountDiff = recountCash === null ? 0 : recountCash - before.expectedCash;
  const hasDiscrepancy = before.discrepancy !== 0 || recountDiff !== 0;
  if (input.status === "verified" && hasDiscrepancy && (!input.acknowledgeDiscrepancy || !note)) {
    throw new AccountabilityError(
      "DISCREPANCY_NOT_ACKNOWLEDGED",
      "Shift ini berselisih — centang \"selisih diakui\" dan tulis catatan pemeriksaan sebelum verifikasi.",
    );
  }
  const acknowledged = input.status === "verified" && hasDiscrepancy;
  const now = new Date();
  await db
    .update(cashSessions)
    .set({
      reviewStatus: input.status,
      reviewNote: note,
      reviewedBy: garage.user.id,
      reviewedAt: now,
      reviewSelfVerified: selfVerified,
      discrepancyAcknowledged: acknowledged,
      ...(recountGiven
        ? { recountCash, recountDenominations: input.recountDenominations!, recountBy: garage.user.id, recountAt: now }
        : {}),
    })
    .where(eq(cashSessions.id, sessionId));
  await createAuditLog({
    actor: actorLabel(garage),
    action: input.status === "verified" ? "Laporan shift diverifikasi" : "Laporan shift perlu tindak lanjut",
    object: session.code,
    device: garage.profile.deviceLabel,
    status: input.status === "verified" && !hasDiscrepancy ? "recorded" : "warning",
    metadata: {
      cashSessionId: sessionId,
      before: { reviewStatus: before.reviewStatus, reviewNote: before.reviewNote },
      after: { reviewStatus: input.status, reviewNote: note },
      firstCount: before.actualCash,
      expectedCash: before.expectedCash,
      recountCash,
      discrepancyAcknowledged: acknowledged,
      ...(selfVerified ? { selfVerified: true, note: "tanpa pemeriksa kedua" } : {}),
    },
  });
  return {
    id: sessionId,
    reviewStatus: input.status,
    reviewNote: note,
    reviewedAt: now.toISOString(),
    recountCash,
    discrepancyAcknowledged: acknowledged,
    selfVerified,
  };
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
