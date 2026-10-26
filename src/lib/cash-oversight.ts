import { businessDayRange, CALENDAR_POLICY, type BusinessDayPolicy } from "@/lib/business-date";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, cashMovements, cashSessions, outlets, pettyCashEntries, shiftIncidents, user } from "@/db/schema";
import { DEPOSIT_ACCOUNT_LABEL, type DepositAccount } from "@/lib/cash-drawer";
import { accountBalance, checkDrawerCache } from "@/lib/cash-ledger";
import { certifiedScopes } from "@/lib/cash-opening";
import { openingScopeKey } from "@/lib/cash-opening-meta";
import {
  OVERSIGHT_ACCOUNT_CERTIFIED_LABEL,
  OVERSIGHT_ACCOUNT_LABEL,
  OVERSIGHT_ACCOUNTS,
  OVERSIGHT_EXCEPTIONS,
  OVERSIGHT_QUEUES,
  REVIEW_OVERDUE_HOURS,
  type CashOversight,
  type OversightItem,
} from "@/lib/cash-oversight-meta";
import { shiftHasDiscrepancy } from "@/lib/shift-accountability-report";

// =============================================================================
// Pengawasan Kas Owner (P5 closing, owner Okt 2026 — docs/AUDIT-P0-CLOSING-2026-10.md).
// Satu sumber untuk layar /control/cash-closing DAN ekspor Excel: apa yang masih
// menggantung, siapa yang harus bertindak, dan pengecualian kontrol.
//   - Antrean berbasis shift (selisih, pemeriksaan, QRIS) = shift dibuka di periode.
//   - Antrean terbuka (setoran, petty, kejadian, kas keluar) = SEMUA yang masih
//     terbuka sampai akhir periode, berapa pun umurnya.
// Hanya baca; tidak mengubah data.
// =============================================================================

export {
  OVERSIGHT_ACCOUNT_LABEL,
  OVERSIGHT_ACCOUNTS,
  OVERSIGHT_EXCEPTION_LABEL,
  OVERSIGHT_EXCEPTIONS,
  OVERSIGHT_QUEUE_META,
  OVERSIGHT_QUEUES,
  REVIEW_OVERDUE_HOURS,
  type CashOversight,
  type OversightException,
  type OversightItem,
  type OversightQueue,
} from "@/lib/cash-oversight-meta";

/** Rentang tanggal operasional [awal from, awal to+1) — kalender WIB atau cut-off (business-date.ts). */
export function oversightRange(fromDate: string, toDate: string, policy: BusinessDayPolicy = CALENDAR_POLICY) {
  const { start: from, end: to } = businessDayRange(fromDate, toDate, policy);
  return { from, to };
}

export function jakartaDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

export async function getCashOversight(input: { fromDate: string; toDate: string; outletId?: string | null; now?: Date }): Promise<CashOversight> {
  const db = getDb();
  const now = input.now ?? new Date();
  const { from, to } = oversightRange(input.fromDate, input.toDate, await loadBusinessDayPolicy());
  const outletId = input.outletId || null;
  const ageHours = (at: Date) => Math.max(0, Math.round(((now.getTime() - at.getTime()) / 3_600_000) * 10) / 10);
  const outletCond = <T>(column: T) => (outletId ? eq(column as never, outletId) : undefined);

  const outletRows = await db.select({ id: outlets.id, code: outlets.code, name: outlets.name }).from(outlets).orderBy(asc(outlets.code));
  const outletCode = new Map(outletRows.map((row) => [row.id, row.code]));
  const codeOf = (id: string | null) => (id ? outletCode.get(id) ?? null : null);

  // ── Shift di periode ─────────────────────────────────────────────────────
  const sessions = await db
    .select({ session: cashSessions, cashierName: user.name })
    .from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.openedBy))
    .where(and(gte(cashSessions.openedAt, from), lt(cashSessions.openedAt, to), outletCond(cashSessions.outletId)))
    .orderBy(asc(cashSessions.openedAt));

  const queues = Object.fromEntries(OVERSIGHT_QUEUES.map((key) => [key, [] as OversightItem[]])) as CashOversight["queues"];
  const exceptions = Object.fromEntries(OVERSIGHT_EXCEPTIONS.map((key) => [key, [] as OversightItem[]])) as CashOversight["exceptions"];
  const byStatus = { ok: 0, minor: 0, review: 0, critical: 0 };
  let over = 0;
  let short = 0;
  let verified = 0;

  for (const { session: s, cashierName } of sessions) {
    const base = {
      id: s.id,
      ref: s.code,
      outletCode: codeOf(s.outletId),
      person: cashierName ?? null,
    };
    if (s.status === "open") {
      if (s.ledgerMode) {
        const cache = await checkDrawerCache(s.id);
        if (cache && cache.difference !== 0) {
          exceptions.cache_mismatch.push({
            ...base,
            title: `Cache ${rupiah(cache.cache)} ≠ buku kas ${rupiah(cache.ledger)}`,
            detail: "Bug sistem — laporkan ke pengembang; tutup shift memakai angka buku kas.",
            amount: cache.difference,
            at: s.openedAt.toISOString(),
            ageHours: ageHours(s.openedAt),
            href: "/shift",
          });
        }
      }
      continue;
    }
    const closedAt = s.closedAt ?? s.openedAt;
    if (s.discrepancy > 0) over += s.discrepancy;
    if (s.discrepancy < 0) short += s.discrepancy;
    if (s.discrepancyStatus in byStatus) byStatus[s.discrepancyStatus as keyof typeof byStatus] += 1;
    if (s.reviewStatus === "verified") verified += 1;

    const discrepant = shiftHasDiscrepancy(s);
    const unacknowledged = discrepant && (s.reviewStatus !== "verified" || !s.discrepancyAcknowledged);
    if (unacknowledged) {
      queues.discrepancy_unverified.push({
        ...base,
        title: `Selisih ${s.discrepancy >= 0 ? "+" : "−"}${rupiah(Math.abs(s.discrepancy))}${s.recountCash !== null && s.recountCash !== s.expectedCash ? ` · hitung ulang ${rupiah(s.recountCash - s.expectedCash)}` : ""}`,
        detail:
          s.reviewStatus === "verified"
            ? "Diverifikasi sebelum aturan \"selisih diakui\" — perlu diperiksa ulang."
            : s.reviewStatus === "needs_followup"
              ? `Perlu tindak lanjut: ${s.reviewNote ?? "-"}`
              : "Menunggu pemeriksaan & pengakuan selisih.",
        amount: s.discrepancy,
        at: closedAt.toISOString(),
        ageHours: ageHours(closedAt),
        href: "/shift?tab=history",
      });
    } else if (s.reviewStatus === "pending" && ageHours(closedAt) > REVIEW_OVERDUE_HOURS) {
      queues.review_overdue.push({
        ...base,
        title: "Belum diperiksa",
        detail: null,
        amount: null,
        at: closedAt.toISOString(),
        ageHours: ageHours(closedAt),
        href: "/shift?tab=history",
      });
    }
    // QRIS: beda dengan aplikasi BNI, atau ada QRIS tercatat yang belum dicocokkan.
    if (s.qrisCounted === null ? (s.qrisRecorded ?? 0) > 0 : (s.qrisDiscrepancy ?? 0) !== 0) {
      queues.qris_mismatch.push({
        ...base,
        title: s.qrisCounted === null ? `QRIS tercatat ${rupiah(s.qrisRecorded ?? 0)} — belum dicocokkan` : `QRIS beda ${rupiah(s.qrisDiscrepancy ?? 0)}`,
        detail: s.qrisCounted === null ? null : `Tercatat ${rupiah(s.qrisRecorded ?? 0)} · aplikasi BNI ${rupiah(s.qrisCounted)}`,
        amount: s.qrisCounted === null ? s.qrisRecorded ?? 0 : s.qrisDiscrepancy,
        at: closedAt.toISOString(),
        ageHours: ageHours(closedAt),
        href: "/shift?tab=history",
      });
    }
    if (s.countSkippedReason) {
      exceptions.emergency_close.push({
        ...base,
        title: "Tutup tanpa hitungan pecahan",
        detail: s.countSkippedReason,
        amount: s.actualCash,
        at: closedAt.toISOString(),
        ageHours: ageHours(closedAt),
        href: "/shift?tab=history",
      });
    }
    if (s.reviewSelfVerified) {
      exceptions.self_verified.push({
        ...base,
        title: "Diverifikasi pemilik shift",
        detail: s.reviewNote,
        amount: s.discrepancy,
        at: (s.reviewedAt ?? closedAt).toISOString(),
        ageHours: ageHours(s.reviewedAt ?? closedAt),
        href: "/shift?tab=history",
      });
    }
  }

  // ── Kas laci: setoran belum dikonfirmasi & pengajuan (semua yang masih terbuka) ──
  const creator = user;
  const openMovements = await db
    .select({ movement: cashMovements, createdByName: creator.name })
    .from(cashMovements)
    .leftJoin(creator, eq(creator.id, cashMovements.createdBy))
    .where(
      and(
        lt(cashMovements.createdAt, to),
        outletCond(cashMovements.outletId),
        or(
          eq(cashMovements.status, "pending_approval"),
          and(eq(cashMovements.status, "recorded"), isNotNull(cashMovements.depositAccount), isNull(cashMovements.depositConfirmedAt)),
        ),
      ),
    )
    .orderBy(asc(cashMovements.createdAt));
  for (const { movement: m, createdByName } of openMovements) {
    const at = m.status === "recorded" ? m.movementAt : m.createdAt;
    const item: OversightItem = {
      id: m.id,
      ref: m.refNo ?? m.id.slice(0, 8),
      title: `${m.category} · ${rupiah(m.amount)}`,
      detail: m.depositAccount
        ? `Ke ${DEPOSIT_ACCOUNT_LABEL[m.depositAccount as DepositAccount] ?? m.depositAccount} · disetor ${m.counterparty ?? "-"}${m.status === "pending_approval" ? " · belum keluar laci" : ""}`
        : m.description,
      outletCode: codeOf(m.outletId),
      person: createdByName ?? null,
      amount: m.amount,
      at: at.toISOString(),
      ageHours: ageHours(at),
      href: "/pos",
    };
    (m.status === "pending_approval" ? queues.cash_out_pending : queues.deposit_unconfirmed).push(item);
  }

  // ── Petty cash terbuka ───────────────────────────────────────────────────
  const petty = await db
    .select({ entry: pettyCashEntries, createdByName: user.name })
    .from(pettyCashEntries)
    .leftJoin(user, eq(user.id, pettyCashEntries.createdBy))
    .where(
      and(
        lt(pettyCashEntries.entryAt, to),
        outletCond(pettyCashEntries.outletId),
        or(
          eq(pettyCashEntries.status, "submitted"),
          and(eq(pettyCashEntries.status, "approved"), isNull(pettyCashEntries.paidAt)),
          and(eq(pettyCashEntries.selfApproved, true), gte(pettyCashEntries.entryAt, from)),
        ),
      ),
    )
    .orderBy(asc(pettyCashEntries.entryAt));
  for (const { entry: e, createdByName } of petty) {
    const item: OversightItem = {
      id: e.id,
      ref: e.entryNo,
      title: `${e.type === "topup" ? "Isi dana" : e.type === "expense" ? "Pengeluaran" : "Penyesuaian"} · ${rupiah(Math.abs(e.amount))}`,
      detail: `${e.category} — ${e.description}${e.recipient ? ` · penerima ${e.recipient}` : ""}`,
      outletCode: codeOf(e.outletId),
      person: createdByName ?? null,
      amount: e.amount,
      at: e.entryAt.toISOString(),
      ageHours: ageHours(e.entryAt),
      href: "/shift?tab=petty",
    };
    if (e.status === "submitted") queues.petty_submitted.push(item);
    else if (e.status === "approved" && !e.paidAt) queues.petty_unpaid.push(item);
    if (e.selfApproved && e.entryAt >= from) exceptions.petty_self_approved.push(item);
  }

  // ── Kejadian terbuka ─────────────────────────────────────────────────────
  const incidents = await db
    .select({ incident: shiftIncidents, reporter: user.name })
    .from(shiftIncidents)
    .leftJoin(user, eq(user.id, shiftIncidents.reportedBy))
    .where(and(lt(shiftIncidents.occurredAt, to), ne(shiftIncidents.status, "resolved"), outletCond(shiftIncidents.outletId)))
    .orderBy(asc(shiftIncidents.occurredAt));
  for (const { incident: i, reporter } of incidents) {
    queues.incident_open.push({
      id: i.id,
      ref: i.orderNo ?? i.category,
      title: i.category,
      detail: i.description,
      outletCode: codeOf(i.outletId),
      person: reporter ?? null,
      amount: i.financialImpact,
      at: i.occurredAt.toISOString(),
      ageHours: ageHours(i.occurredAt),
      href: "/shift?tab=incident",
    });
  }

  // ── Setoran: dikonfirmasi penyetornya sendiri (audit) & total periode ────
  const selfConfirmed = await db
    .select({ id: auditLogs.id, object: auditLogs.object, actor: auditLogs.actor, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "Setoran diterima di rekening"),
        gte(auditLogs.createdAt, from),
        lt(auditLogs.createdAt, to),
        sql`${auditLogs.metadata}->>'selfConfirmed' = 'true'`,
      ),
    );
  const selfMovementIds = selfConfirmed.map((row) => String(row.metadata?.cashMovementId ?? "")).filter(Boolean);
  const selfMovementOutlets = selfMovementIds.length
    ? new Map(
        (await db.select({ id: cashMovements.id, outletId: cashMovements.outletId }).from(cashMovements).where(inArray(cashMovements.id, selfMovementIds))).map(
          (row) => [row.id, row.outletId],
        ),
      )
    : new Map<string, string | null>();
  for (const row of selfConfirmed) {
    const movementOutlet = selfMovementOutlets.get(String(row.metadata?.cashMovementId ?? "")) ?? null;
    if (outletId && movementOutlet !== outletId) continue;
    exceptions.deposit_self_confirmed.push({
      id: row.id,
      ref: String(row.metadata?.refNo ?? row.object),
      title: `Setoran ${rupiah(Number(row.metadata?.amount ?? 0))} · bukti ${String(row.metadata?.bankRef ?? "-")}`,
      detail: row.object,
      outletCode: codeOf(movementOutlet),
      person: row.actor,
      amount: Number(row.metadata?.amount ?? 0),
      at: row.createdAt.toISOString(),
      ageHours: ageHours(row.createdAt),
      href: "/pos",
    });
  }

  const [depositTotals] = await db
    .select({
      confirmed: sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.depositConfirmedAt} is not null), 0)::int`,
      inTransit: sql<number>`coalesce(sum(${cashMovements.amount}) filter (where ${cashMovements.depositConfirmedAt} is null), 0)::int`,
    })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.status, "recorded"),
        isNotNull(cashMovements.depositAccount),
        gte(cashMovements.movementAt, from),
        lt(cashMovements.movementAt, to),
        outletCond(cashMovements.outletId),
      ),
    );

  // P6: saldo yang sudah disahkan Owner = saldo nyata sejak tanggal pengesahan, bukan lagi "arus bersih".
  const certified = await certifiedScopes(db);
  const activeOutletIds = (await db.select({ id: outlets.id }).from(outlets).where(eq(outlets.status, "active"))).map((row) => row.id);
  const certifiedAtFor = (account: (typeof OVERSIGHT_ACCOUNTS)[number]) => {
    if (account === "deposit_transit") return null;
    // Rekening disahkan global; tampilan per outlet hanya arus outlet itu.
    if (account !== "petty") return outletId ? null : certified.get(openingScopeKey(account, null))?.toISOString() ?? null;
    const keys = (outletId ? [outletId] : activeOutletIds).map((id) => openingScopeKey("petty", id));
    const dates = keys.map((key) => certified.get(key));
    if (!dates.length || dates.some((date) => !date)) return null;
    return new Date(Math.max(...dates.map((date) => date!.getTime()))).toISOString();
  };
  const balances = await Promise.all(
    OVERSIGHT_ACCOUNTS.map(async (account) => {
      const certifiedAt = certifiedAtFor(account);
      return {
        account,
        label:
          certifiedAt && !outletId && (account === "bank_jago" || account === "bank_bni")
            ? OVERSIGHT_ACCOUNT_CERTIFIED_LABEL[account]
            : OVERSIGHT_ACCOUNT_LABEL[account],
        balance: await accountBalance(account, outletId, to),
        certifiedAt,
      };
    }),
  );

  const openItems = OVERSIGHT_QUEUES.reduce((sum, key) => sum + queues[key].length, 0);
  return {
    generatedAt: now.toISOString(),
    period: { from: input.fromDate, to: input.toDate },
    outletId,
    outlets: outletRows,
    balances,
    summary: {
      shifts: sessions.length,
      openShifts: sessions.filter((row) => row.session.status === "open").length,
      closedShifts: sessions.filter((row) => row.session.status === "closed").length,
      over,
      short,
      byStatus,
      verified,
      depositsConfirmed: Number(depositTotals?.confirmed ?? 0),
      depositsInTransit: Number(depositTotals?.inTransit ?? 0),
      openItems,
    },
    queues,
    exceptions,
  };
}
