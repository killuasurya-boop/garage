import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { cashLedgerEntries, cashSessions } from "@/db/schema";

// =============================================================================
// Buku kas tunggal (owner, Okt 2026 — P1 closing, docs/AUDIT-P0-CLOSING-2026-10.md).
// Setiap rupiah yang benar-benar berpindah = satu baris `cash_ledger_entries`
// (dari akun → ke akun, nominal > 0). Saldo laci shift = Σ baris akun `drawer`
// sesi itu; `cash_sessions.expected_cash` hanya cache yang diperbarui di
// transaksi yang sama. Baris tidak pernah diubah/dihapus (trigger DB): koreksi =
// baris pembalik dengan `reverses_id`.
// =============================================================================

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

export const CASH_ACCOUNTS = [
  "drawer",
  "petty",
  "bank_jago",
  "bank_bni",
  "qris_clearing",
  "deposit_transit",
  "external",
] as const;
export type CashAccount = (typeof CASH_ACCOUNTS)[number];

export { EXPENSE_CASH_SOURCE_LABEL, EXPENSE_CASH_SOURCES, type ExpenseCashSource } from "@/lib/cash-sources";

export const CASH_SOURCE_TYPES = [
  "opening",
  "legacy_opening",
  "sale",
  "final_pay",
  "refund",
  "void",
  "method_fix",
  "payment_revert",
  "drawer_out",
  "drawer_in",
  "drawer_reversal",
  "expense",
  "expense_cancel",
  "petty_topup",
  "petty_expense",
  "petty_adjustment",
  "petty_reversal",
  "deposit_confirm",
] as const;
export type CashSourceType = (typeof CASH_SOURCE_TYPES)[number];

export const CASH_SOURCE_LABEL: Record<CashSourceType, string> = {
  opening: "Modal awal",
  legacy_opening: "Saldo awal buku kas",
  sale: "Penjualan tunai",
  final_pay: "Pelunasan tunai (Final Bayar)",
  refund: "Refund tunai",
  void: "Batal pesanan (tunai)",
  method_fix: "Koreksi metode bayar",
  payment_revert: "Batal pelunasan",
  drawer_out: "Kas keluar",
  drawer_in: "Kas masuk",
  drawer_reversal: "Pembatalan/koreksi kas laci",
  expense: "Biaya Finance dari laci",
  expense_cancel: "Batal biaya Finance",
  petty_topup: "Isi dana petty cash",
  petty_expense: "Pengeluaran petty cash",
  petty_adjustment: "Penyesuaian petty cash",
  petty_reversal: "Pembatalan petty cash",
  deposit_confirm: "Setoran diterima di rekening",
};

export class CashLedgerError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
export function businessDateOf(at: Date) {
  return jakartaDate.format(at);
}

function hashOf(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function existingByKey(db: DbOrTx, key: string) {
  const [row] = await db.select().from(cashLedgerEntries).where(eq(cashLedgerEntries.idempotencyKey, key)).limit(1);
  return row ?? null;
}

export type DrawerPostingInput = {
  sessionId: string;
  /** + uang masuk laci, − uang keluar laci. 0 = tidak ada posting. */
  delta: number;
  sourceType: CashSourceType;
  sourceId?: string | null;
  sourceRef?: string | null;
  /** Akun lawan (default pihak luar). */
  counterAccount?: CashAccount;
  reversesId?: string | null;
  actorUserId?: string | null;
  approverUserId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  /** Kunci dari klien/retry: kunci sama + isi sama = posting lama; isi beda = ditolak. */
  idempotencyKey?: string | null;
  occurredAt?: Date;
  /** Default true: posting hanya ke shift yang masih buka. */
  requireOpen?: boolean;
};

export type DrawerPosting = { entryId: string; balanceAfter: number; balanceBefore: number; replay: boolean };

/**
 * Catat uang masuk/keluar laci shift + perbarui cache `expected_cash` atomik.
 * Mengembalikan null bila shift tidak ada / sudah tutup (pemanggil memutuskan
 * apakah itu error). `delta` 0 → null tanpa posting.
 */
export async function postDrawerCash(db: DbOrTx, input: DrawerPostingInput): Promise<DrawerPosting | null> {
  if (!Number.isInteger(input.delta)) throw new CashLedgerError("INVALID_AMOUNT", "Nominal kas harus rupiah bulat.", 400);
  if (input.delta === 0) return null;
  const counter = input.counterAccount ?? "external";
  const requestHash = hashOf({
    sessionId: input.sessionId,
    delta: input.delta,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    counter,
  });
  if (input.idempotencyKey) {
    const prior = await existingByKey(db, input.idempotencyKey);
    if (prior) {
      if (prior.requestHash !== requestHash) {
        throw new CashLedgerError("IDEMPOTENCY_MISMATCH", "Kunci transaksi sudah dipakai untuk isi yang berbeda — muat ulang lalu coba lagi.");
      }
      const [session] = await db.select({ expectedCash: cashSessions.expectedCash }).from(cashSessions).where(eq(cashSessions.id, input.sessionId));
      return { entryId: prior.id, balanceAfter: session?.expectedCash ?? 0, balanceBefore: (session?.expectedCash ?? 0) - input.delta, replay: true };
    }
  }

  const conditions = [eq(cashSessions.id, input.sessionId)];
  if (input.requireOpen !== false) conditions.push(eq(cashSessions.status, "open"));
  const [updated] = await db
    .update(cashSessions)
    .set({ expectedCash: sql`${cashSessions.expectedCash} + ${input.delta}` })
    .where(and(...conditions))
    .returning({ expectedCash: cashSessions.expectedCash, outletId: cashSessions.outletId });
  if (!updated) return null;

  const at = input.occurredAt ?? new Date();
  const amount = Math.abs(input.delta);
  const [entry] = await db
    .insert(cashLedgerEntries)
    .values({
      idempotencyKey: input.idempotencyKey ?? `${input.sourceType}:${input.sourceId ?? "-"}:${randomUUID()}`,
      requestHash,
      occurredAt: at,
      businessDate: businessDateOf(at),
      outletId: updated.outletId,
      cashSessionId: input.sessionId,
      fromAccount: input.delta > 0 ? counter : "drawer",
      toAccount: input.delta > 0 ? "drawer" : counter,
      amount,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceRef: input.sourceRef ?? null,
      reversesId: input.reversesId ?? null,
      actorUserId: input.actorUserId ?? null,
      approverUserId: input.approverUserId ?? null,
      note: input.note ?? null,
      metadata: input.metadata ?? null,
    })
    .returning({ id: cashLedgerEntries.id });
  return { entryId: entry.id, balanceAfter: updated.expectedCash, balanceBefore: updated.expectedCash - input.delta, replay: false };
}

/** Perpindahan uang di luar laci (mis. biaya dibayar dari Rekening Jago). */
export async function postAccountCash(
  db: DbOrTx,
  input: {
    from: CashAccount;
    to: CashAccount;
    amount: number;
    outletId: string | null;
    sourceType: CashSourceType;
    sourceId?: string | null;
    sourceRef?: string | null;
    reversesId?: string | null;
    actorUserId?: string | null;
    approverUserId?: string | null;
    note?: string | null;
    occurredAt?: Date;
    idempotencyKey?: string | null;
  },
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new CashLedgerError("INVALID_AMOUNT", "Nominal kas harus rupiah bulat > 0.", 400);
  if (input.from === "drawer" || input.to === "drawer") throw new CashLedgerError("USE_DRAWER_POSTING", "Uang laci dicatat lewat postDrawerCash.", 500);
  const at = input.occurredAt ?? new Date();
  const [entry] = await db
    .insert(cashLedgerEntries)
    .values({
      idempotencyKey: input.idempotencyKey ?? `${input.sourceType}:${input.sourceId ?? "-"}:${randomUUID()}`,
      requestHash: hashOf({ from: input.from, to: input.to, amount: input.amount, sourceType: input.sourceType, sourceId: input.sourceId ?? null }),
      occurredAt: at,
      businessDate: businessDateOf(at),
      outletId: input.outletId,
      fromAccount: input.from,
      toAccount: input.to,
      amount: input.amount,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceRef: input.sourceRef ?? null,
      reversesId: input.reversesId ?? null,
      actorUserId: input.actorUserId ?? null,
      approverUserId: input.approverUserId ?? null,
      note: input.note ?? null,
    })
    .returning();
  return entry;
}

/**
 * Saldo satu akun non-laci per outlet menurut buku kas (mis. petty cash), opsional
 * sebelum waktu tertentu. Riwayat tidak berubah: koreksi selalu baris baru.
 */
export async function accountBalance(account: CashAccount, outletId: string | null, before?: Date, db: DbOrTx = getDb()) {
  const conditions = [sql`(${cashLedgerEntries.fromAccount} = ${account} or ${cashLedgerEntries.toAccount} = ${account})`];
  if (outletId) conditions.push(eq(cashLedgerEntries.outletId, outletId));
  if (before) conditions.push(sql`${cashLedgerEntries.occurredAt} < ${before}`);
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(case when ${cashLedgerEntries.toAccount} = ${account} then ${cashLedgerEntries.amount}
        when ${cashLedgerEntries.fromAccount} = ${account} then -${cashLedgerEntries.amount} else 0 end), 0)::int`,
    })
    .from(cashLedgerEntries)
    .where(and(...conditions));
  return Number(row?.balance ?? 0);
}

/** Baris buku kas satu akun per outlet dalam rentang waktu (urut). */
export async function accountEntries(account: CashAccount, outletId: string | null, from: Date, to: Date, db: DbOrTx = getDb()) {
  const conditions = [
    sql`(${cashLedgerEntries.fromAccount} = ${account} or ${cashLedgerEntries.toAccount} = ${account})`,
    sql`${cashLedgerEntries.occurredAt} >= ${from}`,
    sql`${cashLedgerEntries.occurredAt} < ${to}`,
  ];
  if (outletId) conditions.push(eq(cashLedgerEntries.outletId, outletId));
  const rows = await db.select().from(cashLedgerEntries).where(and(...conditions)).orderBy(asc(cashLedgerEntries.occurredAt), asc(cashLedgerEntries.seq));
  return rows.map((row) => ({ ...row, signed: row.toAccount === account ? row.amount : -row.amount }));
}

export type DrawerLedgerLine = {
  id: string;
  seq: number;
  at: string;
  sourceType: CashSourceType;
  label: string;
  sourceRef: string | null;
  note: string | null;
  signed: number;
  running: number;
  reversesId: string | null;
};

/** Buku kas laci satu shift + ringkasan per jenis (sumber tunggal laporan shift). */
export async function getDrawerLedger(sessionId: string, db: DbOrTx = getDb()) {
  const rows = await db
    .select()
    .from(cashLedgerEntries)
    .where(eq(cashLedgerEntries.cashSessionId, sessionId))
    .orderBy(asc(cashLedgerEntries.seq));
  let running = 0;
  const lines: DrawerLedgerLine[] = [];
  const byType = new Map<CashSourceType, { inflow: number; outflow: number; count: number }>();
  for (const row of rows) {
    const signed = row.toAccount === "drawer" ? row.amount : row.fromAccount === "drawer" ? -row.amount : 0;
    if (!signed) continue;
    running += signed;
    const type = row.sourceType as CashSourceType;
    const bucket = byType.get(type) ?? { inflow: 0, outflow: 0, count: 0 };
    if (signed > 0) bucket.inflow += signed;
    else bucket.outflow += -signed;
    bucket.count += 1;
    byType.set(type, bucket);
    lines.push({
      id: row.id,
      seq: Number(row.seq),
      at: row.occurredAt.toISOString(),
      sourceType: type,
      label: CASH_SOURCE_LABEL[type] ?? row.sourceType,
      sourceRef: row.sourceRef,
      note: row.note,
      signed,
      running,
      reversesId: row.reversesId,
    });
  }
  const summary = CASH_SOURCE_TYPES.filter((type) => byType.has(type)).map((type) => ({
    sourceType: type,
    label: CASH_SOURCE_LABEL[type],
    ...byType.get(type)!,
    net: byType.get(type)!.inflow - byType.get(type)!.outflow,
  }));
  return { balance: running, lines, summary };
}

/** Saldo laci menurut buku kas (bukan cache). */
export async function drawerBalance(sessionId: string, db: DbOrTx = getDb()) {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(case when ${cashLedgerEntries.toAccount} = 'drawer' then ${cashLedgerEntries.amount}
        when ${cashLedgerEntries.fromAccount} = 'drawer' then -${cashLedgerEntries.amount} else 0 end), 0)::int`,
    })
    .from(cashLedgerEntries)
    .where(eq(cashLedgerEntries.cashSessionId, sessionId));
  return Number(row?.balance ?? 0);
}

/** Cache `expected_cash` vs buku kas — beda = bug (dicatat pemanggil), tidak ditambal. */
export async function checkDrawerCache(sessionId: string, db: DbOrTx = getDb()) {
  const [session] = await db
    .select({ expectedCash: cashSessions.expectedCash, ledgerMode: cashSessions.ledgerMode })
    .from(cashSessions)
    .where(eq(cashSessions.id, sessionId));
  if (!session) return null;
  const ledger = await drawerBalance(sessionId, db);
  return { ledgerMode: session.ledgerMode, cache: session.expectedCash, ledger, difference: session.expectedCash - ledger };
}
