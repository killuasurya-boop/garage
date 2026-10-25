import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { cashLedgerEntries, cashOpeningCertifications, outlets, user } from "@/db/schema";
import { accountBalance, CASH_ACCOUNTS, LEGACY_REQUEST_HASH, postAccountCash } from "@/lib/cash-ledger";
import {
  CERTIFIABLE_ACCOUNT_LABEL,
  CERTIFIABLE_ACCOUNTS,
  isOutletScoped,
  openingScopeKey,
  type CertifiableAccount,
  type LedgerFingerprint,
  type OpeningScope,
  type OpeningStatus,
} from "@/lib/cash-opening-meta";
import { createAuditLog } from "@/lib/garage-service";
import type { GarageSession } from "@/lib/server-auth";

// =============================================================================
// Saldo pembuka disahkan Owner (P6, docs/AUDIT-P0-CLOSING-2026-10.md).
// Data lama masuk buku kas lewat migrasi 0159/0160 (request_hash 'legacy') tanpa
// dihitung ulang → `legacy_unverified`. Owner mengesahkan saldo nyata (hitung fisik
// petty / mutasi rekening) satu kali per akun; selisihnya diposting sebagai baris
// `opening_balance`, bukan menebak atau mengubah baris lama. Laci tidak disahkan di
// sini: setiap shift dibuka dengan hitungan pecahan (batas shift).
// =============================================================================

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

export class CashOpeningError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

export const certifyOpeningSchema = z.object({
  account: z.enum(CERTIFIABLE_ACCOUNTS),
  outletId: z.string().uuid().nullable().optional(),
  countedBalance: z.number().int().min(0).max(10_000_000_000),
  /** Saldo buku kas yang dilihat Owner saat mengisi; berubah sejak itu = ditolak. */
  expectedLedgerBalance: z.number().int(),
  evidenceRef: z.string().trim().min(3).max(120),
  note: z.string().trim().max(500).nullable().optional(),
});
export type CertifyOpeningInput = z.infer<typeof certifyOpeningSchema>;

const accountCond = (account: string) =>
  sql`(${cashLedgerEntries.fromAccount} = ${account} or ${cashLedgerEntries.toAccount} = ${account})`;

const signedFor = (account: string) =>
  sql<number>`coalesce(sum(case when ${cashLedgerEntries.toAccount} = ${account} then ${cashLedgerEntries.amount}
    when ${cashLedgerEntries.fromAccount} = ${account} then -${cashLedgerEntries.amount} else 0 end), 0)::int`;

async function legacyFor(db: DbOrTx, account: string, outletId: string | null) {
  const conditions = [accountCond(account), eq(cashLedgerEntries.requestHash, LEGACY_REQUEST_HASH)];
  if (outletId) conditions.push(eq(cashLedgerEntries.outletId, outletId));
  const [row] = await db
    .select({ entries: sql<number>`count(*)::int`, total: signedFor(account) })
    .from(cashLedgerEntries)
    .where(and(...conditions));
  return { entries: Number(row?.entries ?? 0), total: Number(row?.total ?? 0) };
}

/**
 * Sidik buku kas (T25). Query yang sama persis ada di scripts/cash-ledger-fingerprint.sql
 * (dijaga tes) supaya bisa dijalankan dengan psql di DB produksi sebelum backup dan di DB
 * hasil restore — hasil identik = saldo, referensi dan riwayat utuh.
 */
export const FINGERPRINT_SUMMARY_SQL = `SELECT
  (SELECT count(*)::int FROM cash_ledger_entries) AS entries,
  (SELECT coalesce(max(seq), 0)::int FROM cash_ledger_entries) AS last_seq,
  (SELECT count(*)::int FROM cash_opening_certifications) AS certifications,
  md5(
    coalesce((SELECT string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', id, seq, idempotency_key,
      to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), business_date, outlet_id, cash_session_id,
      from_account, to_account, amount, source_type, source_id, source_ref, reverses_id), E'\\n' ORDER BY seq) FROM cash_ledger_entries), '')
    || '#' ||
    coalesce((SELECT string_agg(format('%s|%s|%s|%s|%s|%s|%s', scope_key, to_char(as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      ledger_balance, counted_balance, adjustment, adjustment_entry_id, evidence_ref), E'\\n' ORDER BY scope_key) FROM cash_opening_certifications), '')
  ) AS digest;`;
export const FINGERPRINT_BALANCE_SQL = `SELECT account, sum(delta)::int AS balance FROM (
  SELECT to_account AS account, amount AS delta FROM cash_ledger_entries
  UNION ALL SELECT from_account, -amount FROM cash_ledger_entries
) moves GROUP BY account ORDER BY account;`;

type ExecDb = { execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown> };
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[];
}

export async function cashLedgerFingerprint(db: DbOrTx = getDb()): Promise<LedgerFingerprint> {
  const exec = db as unknown as ExecDb;
  const [summary] = rowsOf<{ entries: number; last_seq: number; certifications: number; digest: string }>(
    await exec.execute(sql.raw(FINGERPRINT_SUMMARY_SQL)),
  );
  const balanceRows = rowsOf<{ account: string; balance: number }>(await exec.execute(sql.raw(FINGERPRINT_BALANCE_SQL)));
  const balances: Record<string, number> = Object.fromEntries(CASH_ACCOUNTS.map((account) => [account, 0]));
  for (const row of balanceRows) balances[row.account] = Number(row.balance);
  return {
    entries: Number(summary.entries),
    lastSeq: Number(summary.last_seq),
    certifications: Number(summary.certifications),
    balances,
    digest: summary.digest,
  };
}

/** Status saldo pembuka per akun (petty per outlet aktif, rekening global) + baris lama. */
export async function getOpeningStatus(db: DbOrTx = getDb()): Promise<OpeningStatus> {
  const outletRows = await db
    .select({ id: outlets.id, code: outlets.code })
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(asc(outlets.code));
  const certRows = await db
    .select({ cert: cashOpeningCertifications, name: user.name })
    .from(cashOpeningCertifications)
    .leftJoin(user, eq(user.id, cashOpeningCertifications.certifiedBy));
  const certs = new Map(certRows.map((row) => [row.cert.scopeKey, row]));

  const targets: Array<{ account: CertifiableAccount; outletId: string | null; outletCode: string | null }> = [];
  for (const account of CERTIFIABLE_ACCOUNTS) {
    if (isOutletScoped(account)) for (const outlet of outletRows) targets.push({ account, outletId: outlet.id, outletCode: outlet.code });
    else targets.push({ account, outletId: null, outletCode: null });
  }

  const scopes: OpeningScope[] = [];
  for (const target of targets) {
    const scopeKey = openingScopeKey(target.account, target.outletId);
    const found = certs.get(scopeKey);
    const legacy = await legacyFor(db, target.account, target.outletId);
    scopes.push({
      scopeKey,
      account: target.account,
      label: CERTIFIABLE_ACCOUNT_LABEL[target.account],
      outletId: target.outletId,
      outletCode: target.outletCode,
      ledgerBalance: await accountBalance(target.account, target.outletId, undefined, db),
      legacyEntries: legacy.entries,
      legacyTotal: legacy.total,
      certification: found
        ? {
            id: found.cert.id,
            asOf: found.cert.asOf.toISOString(),
            ledgerBalance: found.cert.ledgerBalance,
            countedBalance: found.cert.countedBalance,
            adjustment: found.cert.adjustment,
            evidenceRef: found.cert.evidenceRef,
            note: found.cert.note,
            certifiedBy: found.cert.certifiedBy,
            certifiedByName: found.name ?? null,
          }
        : null,
    });
  }

  const drawerLegacy = await legacyFor(db, "drawer", null);
  const uncovered = scopes.filter((scope) => !scope.certification);
  return {
    scopes,
    pending: uncovered.length,
    drawerLegacy,
    legacyUnverified: {
      entries: drawerLegacy.entries + uncovered.reduce((sum, scope) => sum + scope.legacyEntries, 0),
      total: drawerLegacy.total + uncovered.reduce((sum, scope) => sum + scope.legacyTotal, 0),
    },
    fingerprint: await cashLedgerFingerprint(db),
  };
}

/**
 * Owner mengesahkan saldo nyata satu akun, satu kali. Selisih (nyata − buku kas)
 * diposting `opening_balance` dari/ke pihak luar; baris lama tidak diubah.
 */
export async function certifyOpeningBalance(input: CertifyOpeningInput, garage: GarageSession) {
  if (garage.profile.role !== "Owner") throw new CashOpeningError("FORBIDDEN", "Hanya Owner yang mengesahkan saldo pembuka.", 403);
  const account = input.account;
  const outletId = isOutletScoped(account) ? input.outletId ?? null : null;
  if (isOutletScoped(account) && !outletId) throw new CashOpeningError("OUTLET_REQUIRED", "Pilih outlet petty cash yang disahkan.", 400);
  const scopeKey = openingScopeKey(account, outletId);
  const evidenceRef = input.evidenceRef.trim();
  const note = input.note?.trim() || null;
  const now = new Date();
  let outletCode: string | null = null;

  const result = await getDb().transaction(async (tx) => {
    // Petty: kunci yang sama dengan pembayaran petty (saldo tidak bergeser di tengah).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${account === "petty" ? `petty:${outletId}` : `cash_opening:${account}`}))`);
    if (outletId) {
      const [outlet] = await tx.select({ code: outlets.code }).from(outlets).where(eq(outlets.id, outletId));
      if (!outlet) throw new CashOpeningError("OUTLET_NOT_FOUND", "Outlet tidak ditemukan.", 404);
      outletCode = outlet.code;
    }
    const [existing] = await tx
      .select({ id: cashOpeningCertifications.id })
      .from(cashOpeningCertifications)
      .where(eq(cashOpeningCertifications.scopeKey, scopeKey));
    if (existing) {
      throw new CashOpeningError("ALREADY_CERTIFIED", "Saldo pembuka akun ini sudah disahkan. Koreksi berikutnya lewat transaksi biasa (isi/penyesuaian petty, setoran).");
    }
    const ledgerBalance = await accountBalance(account, outletId, undefined, tx as never);
    if (ledgerBalance !== input.expectedLedgerBalance) {
      throw new CashOpeningError("LEDGER_CHANGED", "Saldo buku kas berubah sejak layar dibuka — muat ulang dan periksa lagi.");
    }
    const legacy = await legacyFor(tx, account, outletId);
    const adjustment = input.countedBalance - ledgerBalance;
    const entry = adjustment
      ? await postAccountCash(tx as never, {
          from: adjustment > 0 ? "external" : account,
          to: adjustment > 0 ? account : "external",
          amount: Math.abs(adjustment),
          outletId,
          sourceType: "opening_balance",
          sourceId: scopeKey,
          sourceRef: evidenceRef,
          actorUserId: garage.user.id,
          note: note ?? `Saldo pembuka disahkan: buku kas ${ledgerBalance} → nyata ${input.countedBalance}`,
          occurredAt: now,
          idempotencyKey: `opening_balance:${scopeKey}`,
        })
      : null;
    const [cert] = await tx
      .insert(cashOpeningCertifications)
      .values({
        scopeKey,
        account,
        outletId,
        asOf: now,
        ledgerBalance,
        countedBalance: input.countedBalance,
        adjustment,
        adjustmentEntryId: entry?.id ?? null,
        legacyEntries: legacy.entries,
        legacyTotal: legacy.total,
        evidenceRef,
        note,
        certifiedBy: garage.user.id,
      })
      .returning();
    return cert;
  });

  await createAuditLog({
    actor: `${garage.user.name} (Owner)`,
    action: "Saldo pembuka disahkan",
    object: `${CERTIFIABLE_ACCOUNT_LABEL[account]}${outletCode ? ` · ${outletCode}` : ""}: ${result.countedBalance}`,
    device: garage.profile.deviceLabel,
    metadata: {
      certificationId: result.id,
      scopeKey,
      account,
      outletId,
      before: { ledgerBalance: result.ledgerBalance },
      after: { countedBalance: result.countedBalance },
      adjustment: result.adjustment,
      legacyEntries: result.legacyEntries,
      evidenceRef,
    },
  });
  return result;
}

/** Scope yang sudah disahkan (untuk label saldo di Pengawasan Kas). */
export async function certifiedScopes(db: DbOrTx = getDb()) {
  const rows = await db
    .select({ scopeKey: cashOpeningCertifications.scopeKey, asOf: cashOpeningCertifications.asOf })
    .from(cashOpeningCertifications)
    .where(inArray(cashOpeningCertifications.account, [...CERTIFIABLE_ACCOUNTS]));
  return new Map(rows.map((row) => [row.scopeKey, row.asOf]));
}
