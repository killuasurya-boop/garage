// =============================================================================
// B7c (PRD §13.5 F35, §20.2 F38) — Buku kas rinci & arus kas Owner per periode.
// Sumber tunggal: cash_ledger_entries (append-only). Setiap baris punya ID stabil
// (id + seq), saldo berjalan per akun, dan pemeriksaan
//   saldo awal + masuk − keluar = saldo akhir (dihitung terpisah dari DB).
// Akun "external" (uang pribadi Owner / pihak luar) bukan uang Garage: hanya arusnya
// yang dicatat, tanpa saldo — diberi label non-laci.
// =============================================================================
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { cashLedgerEntries, cashSessions, outlets } from "@/db/schema";
import { accountBalance, CASH_ACCOUNTS, CASH_SOURCE_LABEL, isLegacyLedgerRow, type CashAccount, type CashSourceType } from "@/lib/cash-ledger";
import { OwnerReportError } from "@/lib/owner-reports";
import { outletSlug, summaryHash } from "@/lib/owner-reports-build";

export const LEDGER_ACCOUNT_LABEL: Record<CashAccount, string> = {
  drawer: "Laci kasir",
  petty: "Petty cash",
  bank_jago: "Rekening Jago",
  bank_bni: "Rekening BNI",
  qris_clearing: "QRIS (belum settle)",
  deposit_transit: "Setoran dalam perjalanan",
  external: "Pihak luar (modal awal, uang pribadi Owner, pembayaran keluar)",
};

/** Akun milik Garage yang punya saldo. `external` hanya arus. */
export const BALANCE_ACCOUNTS = CASH_ACCOUNTS.filter((account) => account !== "external");

const MAX_RANGE_DAYS = 93;

export type LedgerEntryInput = {
  id: string;
  seq: number;
  at: string;
  businessDate: string;
  fromAccount: CashAccount;
  toAccount: CashAccount;
  amount: number;
  sourceType: CashSourceType;
  sourceRef: string | null;
  sourceId: string | null;
  note: string | null;
  reversesId: string | null;
  legacy: boolean;
  actorName: string | null;
  approverName: string | null;
  sessionCode: string | null;
  outletCode: string | null;
};

export type CashLedgerInput = {
  from: string;
  to: string;
  outletName: string | null;
  opening: Partial<Record<CashAccount, number>>;
  /** Saldo akhir dari DB (dihitung terpisah) untuk rekonsiliasi. */
  closing: Partial<Record<CashAccount, number>>;
  entries: LedgerEntryInput[];
  generatedAt: string;
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export function buildCashLedgerReport(input: CashLedgerInput) {
  const entries = [...input.entries].sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
  const reversedBy = new Map(entries.filter((e) => e.reversesId).map((e) => [e.reversesId as string, e.id]));

  const accounts = BALANCE_ACCOUNTS.map((account) => {
    const opening = input.opening[account] ?? 0;
    let running = opening;
    const lines = entries
      .filter((e) => e.fromAccount === account || e.toAccount === account)
      .map((e) => {
        const signed = e.toAccount === account ? e.amount : -e.amount;
        running += signed;
        return {
          id: e.id,
          seq: e.seq,
          at: e.at,
          sourceType: e.sourceType,
          label: CASH_SOURCE_LABEL[e.sourceType] ?? e.sourceType,
          counterparty: e.toAccount === account ? e.fromAccount : e.toAccount,
          inflow: signed > 0 ? signed : 0,
          outflow: signed < 0 ? -signed : 0,
          running,
          ref: e.sourceRef,
          note: e.note,
          by: e.actorName,
          sessionCode: e.sessionCode,
          reversesId: e.reversesId,
          reversedById: reversedBy.get(e.id) ?? null,
          legacy: e.legacy,
        };
      });
    const inflow = sum(lines.map((l) => l.inflow));
    const outflow = sum(lines.map((l) => l.outflow));
    const computedClosing = opening + inflow - outflow;
    const recordedClosing = input.closing[account] ?? computedClosing;
    const bySource = Array.from(new Set(lines.map((l) => l.sourceType)))
      .map((sourceType) => {
        const rows = lines.filter((l) => l.sourceType === sourceType);
        return { sourceType, label: CASH_SOURCE_LABEL[sourceType] ?? sourceType, count: rows.length, inflow: sum(rows.map((r) => r.inflow)), outflow: sum(rows.map((r) => r.outflow)) };
      })
      .sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow));
    return {
      account,
      label: LEDGER_ACCOUNT_LABEL[account],
      opening,
      inflow,
      outflow,
      closing: computedClosing,
      recordedClosing,
      // Selisih ≠ 0 = ada baris yang tercatat dengan waktu di luar urutan (mis. backdate) — wajib diperiksa.
      reconciled: computedClosing === recordedClosing,
      lines,
      bySource,
    };
  });

  // Arus dengan pihak luar (uang pribadi Owner / pembayaran ke luar) — bukan uang laci.
  const externalIn = entries.filter((e) => e.fromAccount === "external");
  const externalOut = entries.filter((e) => e.toAccount === "external");
  const external = {
    inflow: sum(externalIn.map((e) => e.amount)),
    outflow: sum(externalOut.map((e) => e.amount)),
    bySource: Array.from(new Set([...externalIn, ...externalOut].map((e) => e.sourceType))).map((sourceType) => ({
      sourceType,
      label: CASH_SOURCE_LABEL[sourceType] ?? sourceType,
      inflow: sum(externalIn.filter((e) => e.sourceType === sourceType).map((e) => e.amount)),
      outflow: sum(externalOut.filter((e) => e.sourceType === sourceType).map((e) => e.amount)),
    })),
  };

  const totals = {
    entries: entries.length,
    reversals: entries.filter((e) => e.reversesId).length,
    legacyRows: entries.filter((e) => e.legacy).length,
    unreconciled: accounts.filter((a) => !a.reconciled).map((a) => a.account),
  };

  const hash = summaryHash({ from: input.from, to: input.to, entries: entries.map((e) => [e.id, e.amount]), closing: accounts.map((a) => [a.account, a.closing]) });
  return {
    from: input.from,
    to: input.to,
    outletName: input.outletName,
    accounts,
    external,
    totals,
    entries: entries.map((e) => ({
      ...e,
      label: CASH_SOURCE_LABEL[e.sourceType] ?? e.sourceType,
      reversedById: reversedBy.get(e.id) ?? null,
    })),
    meta: {
      reportId: `LED-${input.from.replace(/-/g, "")}-${input.to.replace(/-/g, "")}-${hash.slice(0, 8).toUpperCase()}`,
      hash,
      generatedAt: input.generatedAt,
      fileBase: `GARAGE_${outletSlug(input.outletName)}_CASH_LEDGER_${input.from}_${input.to}`,
    },
  };
}

export type CashLedgerReport = ReturnType<typeof buildCashLedgerReport>;

const nameOf = (column: unknown) => sql<string | null>`(select name from "user" where id = ${column})`;

/** Buku kas periode (tanggal WIB inklusif). `outletId` null = semua outlet (rekening bersifat global). */
export async function getCashLedgerReport(params: { from: string; to: string; outletId?: string | null; now?: Date }) {
  if (params.from > params.to) throw new OwnerReportError("INVALID_RANGE", "Tanggal awal setelah tanggal akhir.");
  const start = new Date(`${params.from}T00:00:00+07:00`);
  const end = new Date(new Date(`${params.to}T00:00:00+07:00`).getTime() + 86_400_000);
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw new OwnerReportError("RANGE_TOO_LONG", `Rentang buku kas maksimal ${MAX_RANGE_DAYS} hari.`);
  }
  const outletId = params.outletId ?? null;
  const db = getDb();
  const conditions = [gte(cashLedgerEntries.occurredAt, start), lt(cashLedgerEntries.occurredAt, end)];
  if (outletId) conditions.push(eq(cashLedgerEntries.outletId, outletId));
  const rows = await db
    .select({
      e: cashLedgerEntries,
      actorName: nameOf(cashLedgerEntries.actorUserId),
      approverName: nameOf(cashLedgerEntries.approverUserId),
      sessionCode: cashSessions.code,
      outletCode: outlets.code,
    })
    .from(cashLedgerEntries)
    .leftJoin(cashSessions, eq(cashSessions.id, cashLedgerEntries.cashSessionId))
    .leftJoin(outlets, eq(outlets.id, cashLedgerEntries.outletId))
    .where(and(...conditions))
    .orderBy(asc(cashLedgerEntries.occurredAt), asc(cashLedgerEntries.seq));

  const opening: Partial<Record<CashAccount, number>> = {};
  const closing: Partial<Record<CashAccount, number>> = {};
  for (const account of BALANCE_ACCOUNTS) {
    opening[account] = await accountBalance(account, outletId, start);
    closing[account] = await accountBalance(account, outletId, end);
  }
  const [outlet] = outletId ? await db.select({ name: outlets.name }).from(outlets).where(eq(outlets.id, outletId)).limit(1) : [];

  return buildCashLedgerReport({
    from: params.from,
    to: params.to,
    outletName: outlet?.name ?? null,
    opening,
    closing,
    entries: rows.map(({ e, actorName, approverName, sessionCode, outletCode }) => ({
      id: e.id,
      seq: e.seq,
      at: e.occurredAt.toISOString(),
      businessDate: e.businessDate,
      fromAccount: e.fromAccount as CashAccount,
      toAccount: e.toAccount as CashAccount,
      amount: e.amount,
      sourceType: e.sourceType as CashSourceType,
      sourceRef: e.sourceRef,
      sourceId: e.sourceId,
      note: e.note,
      reversesId: e.reversesId,
      legacy: isLegacyLedgerRow(e),
      actorName,
      approverName,
      sessionCode,
      outletCode,
    })),
    generatedAt: (params.now ?? new Date()).toISOString(),
  });
}
