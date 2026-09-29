// Garage Financial Control — Daily & Monthly Closing (PRD V2.0 §16, §17, §42–§44).
// Closing membekukan angka hari itu (financial_snapshots.status = "locked").
// Perubahan setelahnya hanya lewat "buka ulang" oleh Owner dengan alasan
// (audit log); transaksi yang masuk setelah closing terdeteksi sebagai selisih.
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  cashSessions,
  expenses,
  financeDailyClosings,
  financeMonthlyClosings,
  financialSnapshots,
  orders,
  paymentSettlements,
  staffAttendanceV2,
  staffPayoutRequests,
  stockOpnameSessions,
} from "@/db/schema";
import {
  addDays,
  computeBep,
  computeCapitalRecovery,
  computeDayFigure,
  daysInMonth,
  eachDay,
  fixedCostDaily,
  jakartaDateKey,
  jakartaDayStart,
  longDayLabel,
  monthLabel,
  ratioPct,
  sumFigures,
  type DayFigure,
} from "@/lib/finance-control-core";
import { emptyRaw, getDayFigures, loadDayRaws, loadFinanceConfig, snapshotFromFigure } from "@/lib/finance-control";
import type { GarageSession } from "@/lib/server-auth";

export type CheckStatus = "ok" | "warn" | "block";
export type ClosingCheck = { id: string; label: string; status: CheckStatus; detail: string };

export class ClosingError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function timeLabel(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function actorOf(garage: GarageSession) {
  return `${garage.user.name} / ${garage.profile.role}`;
}

function figureSummary(figure: DayFigure) {
  return {
    grossSales: figure.grossSales,
    discount: figure.discount,
    refund: figure.refund,
    netSales: figure.netSales,
    orderCount: figure.orderCount,
    voidCount: figure.voidCount,
    voidAmount: figure.voidAmount,
    cogs: figure.cogs,
    grossProfit: figure.grossProfit,
    payroll: figure.payroll,
    operatingExpense: figure.operatingExpense,
    nonOperatingExpense: figure.nonOperatingExpense,
    netProfit: figure.netProfit,
    cashIn: figure.cashIn,
    cashOut: figure.cashOut,
    reserveAllocation: figure.reserveAllocation,
    hppCoveragePct: ratioPct(figure.coveredLineSales, figure.lineSales),
  };
}

type FigureSummary = ReturnType<typeof figureSummary>;

const DRIFT_KEYS: Array<[keyof FigureSummary, string]> = [
  ["netSales", "Net sales"],
  ["cogs", "HPP"],
  ["payroll", "Payroll"],
  ["operatingExpense", "Biaya operasional"],
  ["netProfit", "Net profit"],
  ["cashIn", "Cash in"],
  ["cashOut", "Cash out"],
];

async function liveFigure(dateKey: string) {
  const config = await loadFinanceConfig();
  const raws = await loadDayRaws(dateKey, dateKey);
  return { config, figure: computeDayFigure(raws.get(dateKey) ?? emptyRaw(dateKey), config) };
}

// ─── Daily closing ──────────────────────────────────────────────────────────

async function dailyChecks(dateKey: string, todayKey: string) {
  const db = getDb();
  const start = jakartaDayStart(dateKey);
  const end = jakartaDayStart(addDays(dateKey, 1));

  const [openSessions, closedSessions, unpaidOrders, settlements, pendingExpenses, pendingAttendance, openOpname] =
    await Promise.all([
      db
        .select({ code: cashSessions.code })
        .from(cashSessions)
        .where(and(eq(cashSessions.status, "open"), lt(cashSessions.openedAt, end))),
      db
        .select({
          id: cashSessions.id,
          code: cashSessions.code,
          openingCash: cashSessions.openingCash,
          expectedCash: cashSessions.expectedCash,
          actualCash: cashSessions.actualCash,
          discrepancy: cashSessions.discrepancy,
          discrepancyStatus: cashSessions.discrepancyStatus,
          managerSignOffAt: cashSessions.managerSignOffAt,
          closingNote: cashSessions.closingNote,
          closedAt: cashSessions.closedAt,
        })
        .from(cashSessions)
        .where(and(eq(cashSessions.status, "closed"), gte(cashSessions.closedAt, start), lt(cashSessions.closedAt, end)))
        .orderBy(cashSessions.closedAt),
      db
        .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${orders.total}), 0)::bigint` })
        .from(orders)
        .where(and(inArray(orders.status, ["pending", "unpaid"]), gte(orders.createdAt, start), lt(orders.createdAt, end))),
      db
        .select({ status: paymentSettlements.status })
        .from(paymentSettlements)
        .where(and(gte(paymentSettlements.settlementDate, start), lt(paymentSettlements.settlementDate, end))),
      db
        .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${expenses.amount}), 0)::bigint` })
        .from(expenses)
        .where(and(eq(expenses.status, "pending_approval"), gte(expenses.expenseDate, start), lt(expenses.expenseDate, end))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(staffAttendanceV2)
        .where(and(eq(staffAttendanceV2.date, dateKey), eq(staffAttendanceV2.status, "pending"))),
      db
        .select({ code: stockOpnameSessions.code, status: stockOpnameSessions.status })
        .from(stockOpnameSessions)
        .where(
          and(
            inArray(stockOpnameSessions.status, ["draft", "submitted", "pending", "approved"]),
            gte(stockOpnameSessions.createdAt, start),
            lt(stockOpnameSessions.createdAt, end),
          ),
        ),
    ]);

  const unresolvedCash = closedSessions.filter(
    (row) => row.discrepancyStatus !== "ok" && !row.managerSignOffAt,
  );
  const mismatch = settlements.filter((row) => row.status === "mismatch").length;
  const pendingSettlement = settlements.filter((row) => !["settled", "matched", "mismatch"].includes(row.status)).length;
  const unpaidCount = Number(unpaidOrders[0]?.n ?? 0);
  const pendingExpenseCount = Number(pendingExpenses[0]?.n ?? 0);
  const pendingAttendanceCount = Number(pendingAttendance[0]?.n ?? 0);

  const checks: ClosingCheck[] = [
    {
      id: "pos",
      label: "POS closing",
      status: openSessions.length ? "block" : unpaidCount ? "warn" : "ok",
      detail: openSessions.length
        ? `${openSessions.length} shift kasir masih open (${openSessions.map((row) => row.code).join(", ")}).`
        : unpaidCount
          ? `${unpaidCount} order belum lunas (${Number(unpaidOrders[0]?.total ?? 0).toLocaleString("id-ID")}) — tidak dihitung sebagai revenue.`
          : closedSessions.length
            ? `${closedSessions.length} shift ditutup, tidak ada order menggantung.`
            : "Tidak ada shift kasir tercatat pada tanggal ini.",
    },
    {
      id: "payment",
      label: "Payment reconciliation",
      status: mismatch ? "block" : pendingSettlement ? "warn" : "ok",
      detail: mismatch
        ? `${mismatch} settlement mismatch antara POS dan bank/provider.`
        : pendingSettlement
          ? `${pendingSettlement} settlement non-cash belum settled.`
          : settlements.length
            ? "Semua settlement non-cash sudah cocok."
            : "Belum ada catatan settlement non-cash (QRIS/kartu) untuk dicocokkan.",
    },
    {
      id: "cash",
      label: "Cash reconciliation",
      status: unresolvedCash.length ? "block" : "ok",
      detail: unresolvedCash.length
        ? `${unresolvedCash.length} shift PERLU INVESTIGASI (selisih kas belum di-approve).`
        : closedSessions.length
          ? "Kas fisik cocok atau selisih sudah di-approve."
          : "Tidak ada shift tertutup untuk direkonsiliasi.",
    },
    {
      id: "warehouse",
      label: "Warehouse check",
      status: openOpname.length ? "warn" : "ok",
      detail: openOpname.length
        ? `${openOpname.length} stock opname belum diterapkan (${openOpname.map((row) => row.code).join(", ")}).`
        : "Tidak ada stock opname menggantung.",
    },
    {
      id: "expense",
      label: "Expense check",
      status: pendingExpenseCount ? "block" : "ok",
      detail: pendingExpenseCount
        ? `${pendingExpenseCount} expense menunggu approval.`
        : "Tidak ada expense menunggu approval.",
    },
    {
      id: "payroll",
      label: "Payroll data",
      status: pendingAttendanceCount ? "warn" : "ok",
      detail: pendingAttendanceCount
        ? `${pendingAttendanceCount} absensi belum check-out — gaji hari ini belum final.`
        : "Absensi hari ini sudah final.",
    },
  ];

  if (dateKey === todayKey) {
    checks.unshift({
      id: "day",
      label: "Hari operasional",
      status: "warn",
      detail: "Tanggal ini masih berjalan. Transaksi setelah closing akan terdeteksi sebagai selisih dan butuh buka ulang.",
    });
  }

  return { checks, cashSessions: closedSessions };
}

export async function getDailyClosingReview(dateKey: string) {
  if (!DATE_RE.test(dateKey)) throw new ClosingError("INVALID_DATE", "Format tanggal harus YYYY-MM-DD.");
  const todayKey = jakartaDateKey();
  if (dateKey > todayKey) throw new ClosingError("FUTURE_DATE", "Tidak bisa closing tanggal yang belum terjadi.");

  const db = getDb();
  const [[closing], { checks, cashSessions: sessions }, { figure }, [snapshot]] = await Promise.all([
    db.select().from(financeDailyClosings).where(eq(financeDailyClosings.date, dateKey)).limit(1),
    dailyChecks(dateKey, todayKey),
    liveFigure(dateKey),
    db.select().from(financialSnapshots).where(eq(financialSnapshots.date, dateKey)).limit(1),
  ]);
  const live = figureSummary(figure);
  const closed = closing?.status === "closed";
  const frozen = closed ? (closing.figures as FigureSummary) : null;
  const drift = frozen
    ? DRIFT_KEYS.filter(([key]) => Number(frozen[key] ?? 0) !== Number(live[key] ?? 0)).map(([key, label]) => ({
        key,
        label,
        locked: Number(frozen[key] ?? 0),
        live: Number(live[key] ?? 0),
        diff: Number(live[key] ?? 0) - Number(frozen[key] ?? 0),
      }))
    : [];
  const month = dateKey.slice(0, 7);
  const [monthClosing] = await db
    .select({ status: financeMonthlyClosings.status })
    .from(financeMonthlyClosings)
    .where(eq(financeMonthlyClosings.month, month))
    .limit(1);

  return {
    date: dateKey,
    label: longDayLabel(dateKey),
    isToday: dateKey === todayKey,
    status: closed ? ("closed" as const) : closing?.status === "reopened" ? ("reopened" as const) : ("open" as const),
    monthClosed: monthClosing?.status === "closed",
    checks,
    blocking: checks.filter((check) => check.status === "block").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    figures: frozen ?? live,
    liveFigures: live,
    drift,
    snapshotStatus: snapshot?.status ?? null,
    cashSessions: sessions.map((row) => ({
      ...row,
      managerSignOffAt: row.managerSignOffAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      needsInvestigation: row.discrepancyStatus !== "ok" && !row.managerSignOffAt,
    })),
    closing: closing
      ? {
          notes: closing.notes,
          closedByName: closing.closedByName,
          closedAt: closing.closedAt?.toISOString() ?? null,
          reopenedAt: closing.reopenedAt?.toISOString() ?? null,
          reopenReason: closing.reopenReason,
        }
      : null,
  };
}

export type DailyClosingReview = Awaited<ReturnType<typeof getDailyClosingReview>>;

export async function closeFinanceDay(
  input: { date: string; notes?: string; acknowledgeWarnings: boolean },
  garage: GarageSession,
) {
  const review = await getDailyClosingReview(input.date);
  if (review.status === "closed") throw new ClosingError("ALREADY_CLOSED", `${review.label} sudah di-closing.`);
  if (review.monthClosed) throw new ClosingError("MONTH_CLOSED", "Bulan ini sudah dikunci. Buka ulang monthly closing dulu.");
  if (review.blocking) {
    throw new ClosingError(
      "CHECKLIST_BLOCKED",
      `Closing ditahan: ${review.checks.filter((c) => c.status === "block").map((c) => c.label).join(", ")}.`,
    );
  }
  if (review.warnings && !input.acknowledgeWarnings) {
    throw new ClosingError("WARNINGS_NOT_ACKNOWLEDGED", "Centang konfirmasi bahwa peringatan checklist sudah direview.");
  }

  const { figure } = await liveFigure(input.date);
  const summary = figureSummary(figure);
  const now = new Date();
  const db = getDb();

  await db.transaction(async (tx) => {
    const snapshot = { ...snapshotFromFigure(figure), status: "locked" };
    await tx
      .insert(financialSnapshots)
      .values(snapshot)
      .onConflictDoUpdate({ target: financialSnapshots.date, set: { ...snapshot, date: undefined } });
    await tx
      .insert(financeDailyClosings)
      .values({
        date: input.date,
        status: "closed",
        checklist: review.checks,
        figures: summary,
        notes: input.notes?.trim() || null,
        closedBy: garage.user.id,
        closedByName: garage.user.name,
        closedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: financeDailyClosings.date,
        set: {
          status: "closed",
          checklist: review.checks,
          figures: summary,
          notes: input.notes?.trim() || null,
          closedBy: garage.user.id,
          closedByName: garage.user.name,
          closedAt: now,
          updatedAt: now,
        },
      });
    await tx.insert(auditLogs).values({
      time: timeLabel(now),
      actor: actorOf(garage),
      action: "Daily closing — LOCK DAY",
      object: input.date,
      device: garage.profile.deviceLabel,
      status: "locked",
      metadata: {
        module: "finance-closing",
        date: input.date,
        figures: summary,
        warnings: review.checks.filter((c) => c.status === "warn").map((c) => c.detail),
        notes: input.notes?.trim() || null,
      },
    });
  });

  return getDailyClosingReview(input.date);
}

export async function reopenFinanceDay(input: { date: string; reason: string }, garage: GarageSession) {
  if (!DATE_RE.test(input.date)) throw new ClosingError("INVALID_DATE", "Format tanggal harus YYYY-MM-DD.");
  const db = getDb();
  const [closing] = await db.select().from(financeDailyClosings).where(eq(financeDailyClosings.date, input.date)).limit(1);
  if (closing?.status !== "closed") throw new ClosingError("NOT_CLOSED", "Tanggal ini belum di-closing.");
  const [monthClosing] = await db
    .select({ status: financeMonthlyClosings.status })
    .from(financeMonthlyClosings)
    .where(eq(financeMonthlyClosings.month, input.date.slice(0, 7)))
    .limit(1);
  if (monthClosing?.status === "closed") {
    throw new ClosingError("MONTH_CLOSED", "Bulan ini sudah dikunci. Buka ulang monthly closing dulu.");
  }
  const { figure } = await liveFigure(input.date);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(financialSnapshots)
      .set({ status: "auto", updatedAt: now })
      .where(eq(financialSnapshots.date, input.date));
    await tx
      .update(financeDailyClosings)
      .set({ status: "reopened", reopenedBy: garage.user.id, reopenedAt: now, reopenReason: input.reason, updatedAt: now })
      .where(eq(financeDailyClosings.date, input.date));
    await tx.insert(auditLogs).values({
      time: timeLabel(now),
      actor: actorOf(garage),
      action: "Daily closing dibuka ulang (adjustment)",
      object: input.date,
      device: garage.profile.deviceLabel,
      status: "reopened",
      metadata: {
        module: "finance-closing",
        date: input.date,
        reason: input.reason,
        oldValue: closing.figures,
        newValue: figureSummary(figure),
      },
    });
  });

  return getDailyClosingReview(input.date);
}

/** Tolak expense backdate ke tanggal yang sudah di-closing (PRD §16: LOCKED). */
export async function assertFinanceDayOpen(date: Date) {
  const key = jakartaDateKey(date);
  // Hanya backdate yang ditolak; transaksi hari ini setelah closing terdeteksi sebagai selisih.
  if (key >= jakartaDateKey()) return;
  try {
    const [row] = await getDb()
      .select({ status: financeDailyClosings.status })
      .from(financeDailyClosings)
      .where(eq(financeDailyClosings.date, key))
      .limit(1);
    if (row?.status === "closed") {
      throw new ClosingError(
        "DAY_LOCKED",
        `Tanggal ${longDayLabel(key)} sudah di-closing. Catat dengan tanggal hari ini atau minta Owner membuka ulang closing.`,
      );
    }
  } catch (error) {
    if (error instanceof ClosingError) throw error;
    // Tabel belum dimigrasi → jangan blokir transaksi.
  }
}

// ─── Monthly closing ────────────────────────────────────────────────────────

function monthBounds(month: string) {
  const fromKey = `${month}-01`;
  const toKey = `${month}-${String(daysInMonth(fromKey)).padStart(2, "0")}`;
  return { fromKey, toKey };
}

export async function getMonthlyClosingReview(month: string) {
  if (!MONTH_RE.test(month)) throw new ClosingError("INVALID_MONTH", "Format bulan harus YYYY-MM.");
  const todayKey = jakartaDateKey();
  const { fromKey, toKey } = monthBounds(month);
  if (fromKey > todayKey) throw new ClosingError("FUTURE_MONTH", "Bulan ini belum berjalan.");
  const config = await loadFinanceConfig();
  const db = getDb();
  const requiredFrom = config.businessStartDate > fromKey ? config.businessStartDate : fromKey;
  const requiredTo = toKey < todayKey ? toKey : todayKey;
  const requiredDays = requiredFrom <= requiredTo ? eachDay(requiredFrom, requiredTo) : [];
  const start = jakartaDayStart(fromKey);
  const end = jakartaDayStart(addDays(toKey, 1));

  const [closing, dailyRows, pendingAttendance, pendingPayouts, pendingExpenses, unresolvedCash, appliedOpname] =
    await Promise.all([
      db.select().from(financeMonthlyClosings).where(eq(financeMonthlyClosings.month, month)).limit(1),
      db
        .select({ date: financeDailyClosings.date, status: financeDailyClosings.status })
        .from(financeDailyClosings)
        .where(and(gte(financeDailyClosings.date, fromKey), lte(financeDailyClosings.date, toKey))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(staffAttendanceV2)
        .where(and(gte(staffAttendanceV2.date, fromKey), lte(staffAttendanceV2.date, toKey), eq(staffAttendanceV2.status, "pending"))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(staffPayoutRequests)
        .where(and(inArray(staffPayoutRequests.status, ["pending", "approved"]), lt(staffPayoutRequests.createdAt, end))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(expenses)
        .where(and(eq(expenses.status, "pending_approval"), gte(expenses.expenseDate, start), lt(expenses.expenseDate, end))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.status, "closed"),
            ne(cashSessions.discrepancyStatus, "ok"),
            isNull(cashSessions.managerSignOffAt),
            gte(cashSessions.closedAt, start),
            lt(cashSessions.closedAt, end),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(stockOpnameSessions)
        .where(and(eq(stockOpnameSessions.status, "applied"), gte(stockOpnameSessions.createdAt, start), lt(stockOpnameSessions.createdAt, end))),
    ]);

  const closedDays = new Set(dailyRows.filter((row) => row.status === "closed").map((row) => String(row.date)));
  const missingDays = requiredDays.filter((day) => !closedDays.has(day));
  const monthEnded = toKey < todayKey;

  // Laporan bulan: angka harian (locked bila sudah closing), BEP, capital recovery.
  const figures = await getDayFigures(
    config.businessStartDate < fromKey ? config.businessStartDate : fromKey,
    requiredTo < fromKey ? fromKey : requiredTo,
    config,
    todayKey,
  );
  const monthFigures = figures.filter((f) => f.date >= fromKey && f.date <= toKey);
  const totals = sumFigures(monthFigures);
  const bep = computeBep({
    totals,
    trailing: totals,
    fixedDaily: fixedCostDaily(config),
    monthDays: daysInMonth(fromKey),
  });
  const capital = computeCapitalRecovery({
    capital: config.capital.filter((tx) => tx.date <= toKey),
    cumulativeNetProfit: figures.filter((f) => f.date >= config.businessStartDate && f.date <= toKey).reduce((s, f) => s + f.netProfit, 0),
    recentNetProfits: monthFigures.map((f) => f.netProfit),
    startDate: config.businessStartDate,
    todayKey: requiredTo < fromKey ? fromKey : requiredTo,
  });

  const n = (rows: Array<{ n: number }>) => Number(rows[0]?.n ?? 0);
  const checks: ClosingCheck[] = [
    {
      id: "period",
      label: "Periode selesai",
      status: monthEnded ? "ok" : "block",
      detail: monthEnded ? `${monthLabel(fromKey)} sudah berakhir.` : "Bulan belum berakhir — monthly closing dilakukan setelah hari terakhir.",
    },
    {
      id: "daily",
      label: "Daily closing lengkap",
      status: missingDays.length ? "block" : "ok",
      detail: missingDays.length
        ? `${missingDays.length} dari ${requiredDays.length} hari belum di-closing (mis. ${missingDays.slice(0, 3).join(", ")}).`
        : `${requiredDays.length} hari sudah di-closing.`,
    },
    {
      id: "payroll",
      label: "Payroll final",
      status: n(pendingAttendance) ? "block" : n(pendingPayouts) ? "warn" : "ok",
      detail: n(pendingAttendance)
        ? `${n(pendingAttendance)} absensi belum final (belum check-out).`
        : n(pendingPayouts)
          ? `${n(pendingPayouts)} pengajuan pencairan gaji/fee belum dibayar.`
          : "Absensi dan payroll bulan ini final.",
    },
    {
      id: "warehouse",
      label: "Warehouse closing",
      status: n(appliedOpname) ? "ok" : "warn",
      detail: n(appliedOpname) ? `${n(appliedOpname)} stock opname diterapkan bulan ini.` : "Belum ada stock opname yang diterapkan bulan ini.",
    },
    {
      id: "expense",
      label: "Expense review",
      status: n(pendingExpenses) ? "block" : "ok",
      detail: n(pendingExpenses) ? `${n(pendingExpenses)} expense masih menunggu approval.` : "Semua expense sudah diputuskan.",
    },
    {
      id: "cash",
      label: "Cash reconciliation",
      status: n(unresolvedCash) ? "block" : "ok",
      detail: n(unresolvedCash) ? `${n(unresolvedCash)} selisih kas belum di-approve.` : "Tidak ada selisih kas terbuka.",
    },
    {
      id: "pnl",
      label: "P&L, BEP & capital recovery",
      status: "ok",
      detail: "Dihitung otomatis dari snapshot harian yang sudah dikunci.",
    },
  ];

  const report = {
    month,
    label: monthLabel(fromKey),
    days: monthFigures.length,
    pnl: {
      grossSales: totals.grossSales,
      discount: totals.discount,
      refund: totals.refund,
      netSales: totals.netSales,
      cogs: totals.cogs,
      grossProfit: totals.grossProfit,
      payroll: totals.payroll,
      operatingExpense: totals.operatingExpense,
      nonOperatingExpense: totals.nonOperatingExpense,
      netProfit: totals.netProfit,
      netMarginPct: ratioPct(totals.netProfit, totals.netSales),
      reserveAllocation: totals.reserveAllocation,
    },
    cashflow: { cashIn: totals.cashIn, cashOut: totals.cashOut, net: totals.cashIn - totals.cashOut },
    bep: bep.available
      ? { target: bep.periodTarget, achievementPct: bep.periodAchievementPct, status: bep.periodStatus, cmPct: bep.contributionMarginPct }
      : { target: null, achievementPct: null, status: null, reason: bep.reason },
    capital: {
      initialCapital: capital.initialCapital,
      recovered: capital.recovered,
      remaining: capital.remaining,
      recoveryPct: capital.recoveryPct,
    },
    costLines: Object.entries(totals.costLines)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount })),
  };

  const row = closing[0];
  return {
    month,
    label: monthLabel(fromKey),
    status: row?.status === "closed" ? ("closed" as const) : row?.status === "reopened" ? ("reopened" as const) : ("open" as const),
    checks,
    blocking: checks.filter((c) => c.status === "block").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    missingDays,
    report: row?.status === "closed" ? (row.report as typeof report) : report,
    closing: row
      ? {
          notes: row.notes,
          closedByName: row.closedByName,
          closedAt: row.closedAt?.toISOString() ?? null,
          reopenedAt: row.reopenedAt?.toISOString() ?? null,
          reopenReason: row.reopenReason,
        }
      : null,
  };
}

export type MonthlyClosingReview = Awaited<ReturnType<typeof getMonthlyClosingReview>>;

export async function closeFinanceMonth(
  input: { month: string; notes?: string; acknowledgeWarnings: boolean },
  garage: GarageSession,
) {
  const review = await getMonthlyClosingReview(input.month);
  if (review.status === "closed") throw new ClosingError("ALREADY_CLOSED", `${review.label} sudah dikunci.`);
  if (review.blocking) {
    throw new ClosingError(
      "CHECKLIST_BLOCKED",
      `Monthly closing ditahan: ${review.checks.filter((c) => c.status === "block").map((c) => c.label).join(", ")}.`,
    );
  }
  if (review.warnings && !input.acknowledgeWarnings) {
    throw new ClosingError("WARNINGS_NOT_ACKNOWLEDGED", "Centang konfirmasi bahwa peringatan checklist sudah direview.");
  }
  const now = new Date();
  const db = getDb();
  const values = {
    status: "closed",
    checklist: review.checks,
    report: review.report as Record<string, unknown>,
    notes: input.notes?.trim() || null,
    closedBy: garage.user.id,
    closedByName: garage.user.name,
    closedAt: now,
    updatedAt: now,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(financeMonthlyClosings)
      .values({ month: input.month, ...values })
      .onConflictDoUpdate({ target: financeMonthlyClosings.month, set: values });
    await tx.insert(auditLogs).values({
      time: timeLabel(now),
      actor: actorOf(garage),
      action: "Monthly closing — LOCK MONTH",
      object: input.month,
      device: garage.profile.deviceLabel,
      status: "locked",
      metadata: { module: "finance-closing", month: input.month, report: review.report, notes: values.notes },
    });
  });
  return getMonthlyClosingReview(input.month);
}

export async function reopenFinanceMonth(input: { month: string; reason: string }, garage: GarageSession) {
  if (!MONTH_RE.test(input.month)) throw new ClosingError("INVALID_MONTH", "Format bulan harus YYYY-MM.");
  const db = getDb();
  const [row] = await db.select().from(financeMonthlyClosings).where(eq(financeMonthlyClosings.month, input.month)).limit(1);
  if (row?.status !== "closed") throw new ClosingError("NOT_CLOSED", "Bulan ini belum dikunci.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(financeMonthlyClosings)
      .set({ status: "reopened", reopenedBy: garage.user.id, reopenedAt: now, reopenReason: input.reason, updatedAt: now })
      .where(eq(financeMonthlyClosings.month, input.month));
    await tx.insert(auditLogs).values({
      time: timeLabel(now),
      actor: actorOf(garage),
      action: "Monthly closing dibuka ulang",
      object: input.month,
      device: garage.profile.deviceLabel,
      status: "reopened",
      metadata: { module: "finance-closing", month: input.month, reason: input.reason, oldValue: row.report },
    });
  });
  return getMonthlyClosingReview(input.month);
}

// ─── Ringkasan status closing ───────────────────────────────────────────────

export async function getClosingOverview(days = 14) {
  const todayKey = jakartaDateKey();
  const config = await loadFinanceConfig();
  const fromKey = addDays(todayKey, -(days - 1));
  const db = getDb();
  const [dailyRows, monthRows] = await Promise.all([
    db
      .select({ date: financeDailyClosings.date, status: financeDailyClosings.status, closedByName: financeDailyClosings.closedByName })
      .from(financeDailyClosings)
      .where(gte(financeDailyClosings.date, fromKey)),
    db
      .select({ month: financeMonthlyClosings.month, status: financeMonthlyClosings.status })
      .from(financeMonthlyClosings)
      .orderBy(desc(financeMonthlyClosings.month))
      .limit(12),
  ]);
  const byDate = new Map(dailyRows.map((row) => [String(row.date), row]));
  const daily = eachDay(fromKey, todayKey)
    .reverse()
    .map((date) => ({
      date,
      status: byDate.get(date)?.status === "closed" ? "closed" : byDate.get(date)?.status === "reopened" ? "reopened" : "open",
      beforeStart: date < config.businessStartDate,
    }));
  const pendingPastDays = daily.filter((d) => d.date < todayKey && !d.beforeStart && d.status !== "closed").map((d) => d.date);

  const monthStatus = new Map(monthRows.map((row) => [row.month, row.status]));
  const months: Array<{ month: string; label: string; status: string }> = [];
  let cursor = `${todayKey.slice(0, 7)}-01`;
  for (let i = 0; i < 12; i += 1) {
    const month = cursor.slice(0, 7);
    if (`${month}-${String(daysInMonth(cursor)).padStart(2, "0")}` < config.businessStartDate) break;
    months.push({ month, label: monthLabel(cursor), status: monthStatus.get(month) ?? "open" });
    cursor = `${addDays(cursor, -1).slice(0, 7)}-01`;
  }

  return { todayKey, businessStartDate: config.businessStartDate, daily, pendingPastDays, months };
}

export type ClosingOverview = Awaited<ReturnType<typeof getClosingOverview>>;
