// Garage Financial Control — Reporting & export (PRD §55): PDF, Excel, CSV.
// Setiap laporan dibangun dari engine yang sama dengan dashboard, jadi angka
// export = angka layar (single source of truth).
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { capitalTransactions, expenses, feePoolSplits, staffDailyWages, user } from "@/db/schema";
import {
  addDays,
  classifyCategory,
  EXPENSE_GROUP_LABEL,
  jakartaDateKey,
  jakartaDayStart,
  longDayLabel,
  monthLabel,
  payrollMasterMonthly,
  ratioPct,
  resolvePeriod,
  shortDayLabel,
  sumFigures,
  type DayFigure,
  type PeriodKey,
} from "@/lib/finance-control-core";
import { CALENDAR_POLICY } from "@/lib/business-date";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { businessDaySql } from "@/lib/business-date-sql";
import { getDayFigures, getFinanceControlDashboard, loadFinanceConfig } from "@/lib/finance-control";
import { getProductProfitability } from "@/lib/finance-intelligence";
import { renderReport, type ExportFormat } from "@/lib/report-engine";

export const REPORT_TYPES = [
  "daily",
  "pnl",
  "cashflow",
  "expense",
  "payroll",
  "hpp",
  "bep",
  "capital",
  "product",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABEL: Record<ReportType, string> = {
  daily: "Laporan Keuangan Harian",
  pnl: "Laporan Laba Rugi (P&L)",
  cashflow: "Laporan Cashflow",
  expense: "Laporan Expense",
  payroll: "Laporan Payroll",
  hpp: "Laporan HPP",
  bep: "Laporan BEP",
  capital: "Laporan Capital Recovery",
  product: "Laporan Profitabilitas Produk",
};

export { EXPORT_FORMATS, type ExportFormat } from "@/lib/report-engine";

type ColumnType = "text" | "int" | "money" | "pct";
type Column = { key: string; label: string; type: ColumnType };
type Row = Record<string, string | number | null>;
type Table = { title: string; columns: Column[]; rows: Row[]; totals?: Row };

export type FinanceReport = {
  type: ReportType;
  title: string;
  periodLabel: string;
  generatedAt: string;
  summary: Array<{ label: string; value: string }>;
  tables: Table[];
  notes: string[];
};

const money = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}Rp${new Intl.NumberFormat("id-ID").format(Math.abs(rounded))}`;
};
const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;

const DAY_COLUMNS: Column[] = [
  { key: "date", label: "Tanggal", type: "text" },
  { key: "orders", label: "Order", type: "int" },
  { key: "netSales", label: "Net sales", type: "money" },
  { key: "cogs", label: "HPP", type: "money" },
  { key: "grossProfit", label: "Gross profit", type: "money" },
  { key: "payroll", label: "Payroll", type: "money" },
  { key: "opex", label: "Biaya operasional", type: "money" },
  { key: "netProfit", label: "Net profit", type: "money" },
];

function dayRow(f: DayFigure): Row {
  return {
    date: f.date,
    orders: f.orderCount,
    netSales: f.netSales,
    cogs: f.cogs,
    grossProfit: f.grossProfit,
    payroll: f.payroll,
    opex: f.operatingExpense + f.nonOperatingExpense,
    netProfit: f.netProfit,
  };
}

function totalsRow(rows: Row[], columns: Column[], labelKey: string): Row {
  const out: Row = { [labelKey]: "TOTAL" };
  for (const column of columns) {
    if (column.type === "money" || column.type === "int") {
      out[column.key] = rows.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0);
    }
  }
  return out;
}

function monthGroups(figures: DayFigure[]) {
  const map = new Map<string, DayFigure[]>();
  for (const f of figures) map.set(f.date.slice(0, 7), [...(map.get(f.date.slice(0, 7)) ?? []), f]);
  return Array.from(map.entries());
}

export async function buildFinanceReport(input: {
  type: ReportType;
  period: PeriodKey;
  from?: string | null;
  to?: string | null;
}): Promise<FinanceReport> {
  const dashboard = await getFinanceControlDashboard({ period: input.period, from: input.from, to: input.to });
  const period = dashboard.period;
  const config = await loadFinanceConfig();
  const policy = config.businessDay ?? CALENDAR_POLICY;
  const todayKey = jakartaDateKey(new Date(), policy);
  const allFigures = await getDayFigures(period.fromKey, period.toKey, config, todayKey);
  // Tabel harian tidak memuat hari sebelum bisnis dimulai (semuanya nol).
  const figures = allFigures.filter((f) => f.date >= config.businessStartDate || f.netSales !== 0 || f.cashOut !== 0);
  const pnl = dashboard.pnl;
  const tables: Table[] = [];
  const notes: string[] = [
    "Angka aktual dihitung server-side dari POS, resep (HPP), Payroll V2, dan expense.",
    "Modal bukan revenue; Save Money = alokasi cadangan, bukan expense.",
    "HPP aktual = HPP resep + susut gudang (opname, waste, penyesuaian). Stok outlet dinilai dengan harga bahan saat ini; gudang WMS dengan HPP batch.",
  ];
  const lockedDays = figures.filter((f) => f.source === "locked").length;
  if (lockedDays) notes.push(`${lockedDays} hari memakai angka terkunci dari Daily Closing.`);
  let summary: FinanceReport["summary"] = [
    { label: "Net sales", value: money(pnl.netSales) },
    { label: "HPP", value: money(pnl.cogs) },
    { label: "Gross profit", value: money(pnl.grossProfit) },
    { label: "Net profit", value: money(pnl.netProfit) },
    { label: "Net margin", value: pct(pnl.netMarginPct) },
  ];

  switch (input.type) {
    case "daily": {
      const rows = figures.map(dayRow);
      tables.push({ title: "Rincian harian", columns: DAY_COLUMNS, rows, totals: totalsRow(rows, DAY_COLUMNS, "date") });
      tables.push({
        title: "Komposisi biaya",
        columns: [
          { key: "name", label: "Pos biaya", type: "text" },
          { key: "amount", label: "Nominal", type: "money" },
        ],
        rows: dashboard.expenses.lines.map((line) => ({ name: line.name, amount: line.amount })),
      });
      tables.push({
        title: "Channel pembayaran",
        columns: [
          { key: "name", label: "Metode", type: "text" },
          { key: "amount", label: "Uang masuk", type: "money" },
          { key: "share", label: "Porsi", type: "pct" },
        ],
        rows: dashboard.channels.map((c) => ({ name: c.name, amount: c.amount, share: c.share })),
      });
      summary = [...summary, { label: "Cash in", value: money(dashboard.cashflow.cashIn) }, { label: "Cash out", value: money(dashboard.cashflow.cashOut) }];
      break;
    }
    case "pnl": {
      tables.push({
        title: "Laba rugi",
        columns: [
          { key: "line", label: "Pos", type: "text" },
          { key: "amount", label: "Nominal", type: "money" },
          { key: "ratio", label: "% net sales", type: "pct" },
        ],
        rows: [
          ["Gross sales", pnl.grossSales],
          ["Diskon", -pnl.discount],
          ["Refund", -pnl.refund],
          ["Net sales", pnl.netSales],
          ...(pnl.cogsBasis === "purchase"
            ? [
                ["Belanja bahan Bar (gudang)", -pnl.purchaseBar],
                ["Belanja bahan Dapur (gudang)", -pnl.purchaseDapur],
                ["Belanja umum (gudang)", -pnl.purchaseUmum],
                ["Total belanja bahan", -pnl.cogs],
              ]
            : [
                ["HPP resep (penjualan)", -pnl.cogsRecipe],
                ["Susut / waste gudang", -pnl.cogsShrinkage],
                ["HPP aktual", -pnl.cogs],
              ]),
          ["Gross profit", pnl.grossProfit],
          ["Upah & payroll", -pnl.payroll],
          ["Biaya tetap & operasional", -pnl.operatingExpense],
          ["Operating profit", pnl.operatingProfit],
          ["Non-operasional", -pnl.nonOperatingExpense],
          ...(pnl.otherIncome ? [["Pendapatan lain (sponsor event)", pnl.otherIncome]] : []),
          ["Net profit", pnl.netProfit],
        ].map(([line, amount]) => ({ line, amount: Number(amount) || 0, ratio: ratioPct(Number(amount) || 0, pnl.netSales) })),
      });
      const monthly = monthGroups(figures);
      if (monthly.length > 1) {
        const rows = monthly.map(([month, list]) => {
          const t = sumFigures(list);
          return { date: monthLabel(`${month}-01`), orders: t.orderCount, netSales: t.netSales, cogs: t.cogs, grossProfit: t.grossProfit, payroll: t.payroll, opex: t.operatingExpense + t.nonOperatingExpense, netProfit: t.netProfit };
        });
        const columns = DAY_COLUMNS.map((c) => (c.key === "date" ? { ...c, label: "Bulan" } : c));
        tables.push({ title: "P&L per bulan", columns, rows, totals: totalsRow(rows, columns, "date") });
      } else {
        const rows = figures.map(dayRow);
        tables.push({ title: "P&L per hari", columns: DAY_COLUMNS, rows, totals: totalsRow(rows, DAY_COLUMNS, "date") });
      }
      summary.push({ label: "Void", value: `${pnl.voidCount} (${money(pnl.voidAmount)})` });
      break;
    }
    case "cashflow": {
      let balance = dashboard.cashflow.opening;
      const rows = figures.map((f) => {
        balance += f.cashIn - f.cashOut;
        return { date: f.date, cashIn: f.cashIn, cashOut: f.cashOut, net: f.cashIn - f.cashOut, balance };
      });
      const columns: Column[] = [
        { key: "date", label: "Tanggal", type: "text" },
        { key: "cashIn", label: "Cash in", type: "money" },
        { key: "cashOut", label: "Cash out", type: "money" },
        { key: "net", label: "Net", type: "money" },
        { key: "balance", label: "Saldo", type: "money" },
      ];
      const totals = totalsRow(rows, columns, "date");
      totals.balance = dashboard.cashflow.closing;
      tables.push({ title: "Arus kas harian", columns, rows, totals });
      tables.push({
        title: "Cash out per kelompok",
        columns: [
          { key: "group", label: "Kelompok", type: "text" },
          { key: "amount", label: "Nominal", type: "money" },
        ],
        rows: dashboard.cashflow.outByGroup.map((g) => ({
          group: EXPENSE_GROUP_LABEL[g.group as keyof typeof EXPENSE_GROUP_LABEL] ?? g.group,
          amount: g.amount,
        })),
      });
      summary = [
        { label: "Kas awal", value: money(dashboard.cashflow.opening) },
        { label: "Cash in", value: money(dashboard.cashflow.cashIn) },
        { label: "Cash out", value: money(dashboard.cashflow.cashOut) },
        { label: "Kas akhir", value: money(dashboard.cashflow.closing) },
      ];
      if (!dashboard.cashflow.openingCashSet) notes.push("Saldo kas awal belum diisi di Pengaturan — saldo dihitung dari Rp0.");
      break;
    }
    case "expense": {
      const rows = await getDb()
        .select({
          date: businessDaySql(expenses.expenseDate, policy),
          category: expenses.category,
          description: expenses.description,
          amount: expenses.amount,
          method: expenses.paymentMethod,
          status: expenses.status,
        })
        .from(expenses)
        .where(
          and(
            gte(expenses.expenseDate, jakartaDayStart(period.fromKey, policy)),
            lt(expenses.expenseDate, jakartaDayStart(addDays(period.toKey, 1), policy)),
          ),
        )
        .orderBy(asc(expenses.expenseDate));
      const columns: Column[] = [
        { key: "date", label: "Tanggal", type: "text" },
        { key: "category", label: "Kategori", type: "text" },
        { key: "group", label: "Kelompok", type: "text" },
        { key: "description", label: "Keterangan", type: "text" },
        { key: "method", label: "Metode", type: "text" },
        { key: "status", label: "Status", type: "text" },
        { key: "amount", label: "Nominal", type: "money" },
      ];
      const mapped = rows.map((row) => ({
        ...row,
        group: EXPENSE_GROUP_LABEL[classifyCategory(config, row.category).groupKey],
      }));
      tables.push({ title: "Daftar expense", columns, rows: mapped, totals: totalsRow(mapped, columns, "date") });
      tables.push({
        title: "Komposisi biaya P&L",
        columns: [
          { key: "name", label: "Pos biaya", type: "text" },
          { key: "amount", label: "Nominal", type: "money" },
        ],
        rows: dashboard.expenses.lines.map((l) => ({ name: l.name, amount: l.amount })),
      });
      tables.push({
        title: "Budget bulan berjalan",
        columns: [
          { key: "name", label: "Pos", type: "text" },
          { key: "budget", label: "Budget", type: "money" },
          { key: "actual", label: "Aktual", type: "money" },
          { key: "used", label: "Terpakai", type: "pct" },
        ],
        rows: dashboard.expenses.budgets.map((b) => ({ name: b.name, budget: b.monthlyBudget, actual: b.actualMtd, used: b.usedPct })),
      });
      summary = [
        {
          label: "Total expense sah (recorded/approved/paid)",
          value: money(mapped.filter((r) => ["recorded", "approved", "paid"].includes(r.status)).reduce((s, r) => s + r.amount, 0)),
        },
        { label: "Menunggu approval", value: String(mapped.filter((r) => r.status === "pending_approval").length) },
        { label: "Biaya operasional P&L", value: money(pnl.operatingExpense) },
      ];
      break;
    }
    case "payroll": {
      const db = getDb();
      const [wages, fees] = await Promise.all([
        db
          .select({
            name: user.name,
            days: sql<number>`count(*) filter (where ${staffDailyWages.source} = 'cron_finalize')::int`,
            base: sql<string>`coalesce(sum(${staffDailyWages.baseWage}), 0)::bigint`,
            overtime: sql<string>`coalesce(sum(${staffDailyWages.overtimeAmount}), 0)::bigint`,
            bonus: sql<string>`coalesce(sum(${staffDailyWages.bonusAmount}), 0)::bigint`,
            deduction: sql<string>`coalesce(sum(${staffDailyWages.deductionAmount}), 0)::bigint`,
            total: sql<string>`coalesce(sum(${staffDailyWages.totalCredited}), 0)::bigint`,
          })
          .from(staffDailyWages)
          .innerJoin(user, eq(staffDailyWages.staffUserId, user.id))
          .where(and(gte(staffDailyWages.date, period.fromKey), lte(staffDailyWages.date, period.toKey)))
          .groupBy(user.name),
        db
          .select({ name: user.name, amount: sql<string>`coalesce(sum(${feePoolSplits.amount}), 0)::bigint` })
          .from(feePoolSplits)
          .innerJoin(user, eq(feePoolSplits.staffUserId, user.id))
          .where(and(gte(feePoolSplits.date, period.fromKey), lte(feePoolSplits.date, period.toKey)))
          .groupBy(user.name),
      ]);
      const feeBy = new Map(fees.map((f) => [f.name, Number(f.amount)]));
      const names = Array.from(new Set([...wages.map((w) => w.name), ...fees.map((f) => f.name)])).sort();
      const columns: Column[] = [
        { key: "name", label: "Karyawan", type: "text" },
        { key: "days", label: "Hari", type: "int" },
        { key: "base", label: "Gaji pokok", type: "money" },
        { key: "overtime", label: "Lembur", type: "money" },
        { key: "bonus", label: "Bonus", type: "money" },
        { key: "deduction", label: "Potongan", type: "money" },
        { key: "fee", label: "Fee", type: "money" },
        { key: "total", label: "Total", type: "money" },
      ];
      const rows = names.map((name) => {
        const w = wages.find((row) => row.name === name);
        const fee = feeBy.get(name) ?? 0;
        return {
          name,
          days: w?.days ?? 0,
          base: Number(w?.base ?? 0),
          overtime: Number(w?.overtime ?? 0),
          bonus: Number(w?.bonus ?? 0),
          deduction: Number(w?.deduction ?? 0),
          fee,
          total: Number(w?.total ?? 0) + fee,
        };
      });
      tables.push({ title: "Payroll aktual (Payroll V2)", columns, rows, totals: totalsRow(rows, columns, "name") });
      tables.push({
        title: "Payroll master (budget)",
        columns: [
          { key: "position", label: "Posisi", type: "text" },
          { key: "headcount", label: "Orang", type: "int" },
          { key: "salary", label: "Gaji / bulan", type: "money" },
        ],
        rows: config.payrollPositions.filter((p) => p.active).map((p) => ({ position: p.position, headcount: p.headcount, salary: p.monthlySalary * p.headcount })),
      });
      const recon = dashboard.payrollRecon;
      summary = [
        { label: "Payroll aktual periode", value: money(pnl.payroll) },
        { label: "Payroll master / bulan", value: money(payrollMasterMonthly(config)) },
        { label: "Proyeksi input harian × 30", value: money(recon.projectedMonthly) },
        { label: "Variance master", value: `${money(recon.variance)} (${recon.status})` },
      ];
      break;
    }
    case "hpp": {
      const rows = figures.map((f) => ({
        date: f.date,
        netSales: f.netSales,
        purchases: f.purchaseBar + f.purchaseDapur + f.purchaseUmum,
        recipe: f.cogsRecipe,
        shrinkage: f.cogsShrinkage,
        cogs: f.cogs,
        ratio: ratioPct(f.cogs, f.netSales),
        coverage: ratioPct(f.coveredLineSales, f.lineSales),
      }));
      const hppColumns: Column[] = [
        { key: "date", label: "Tanggal", type: "text" },
        { key: "netSales", label: "Net sales", type: "money" },
        { key: "purchases", label: "Belanja gudang", type: "money" },
        { key: "recipe", label: "HPP resep (info)", type: "money" },
        { key: "shrinkage", label: "Susut gudang", type: "money" },
        { key: "cogs", label: pnl.cogsBasis === "purchase" ? "Biaya bahan (P&L)" : "HPP aktual", type: "money" },
        { key: "ratio", label: "Biaya bahan / omzet", type: "pct" },
        { key: "coverage", label: "Terukur resep", type: "pct" },
      ];
      tables.push({ title: pnl.cogsBasis === "purchase" ? "Biaya bahan harian (belanja gudang)" : "HPP harian (resep + gudang)", columns: hppColumns, rows, totals: totalsRow(rows, hppColumns, "date") });
      const products = await getProductProfitability(period.fromKey, period.toKey);
      tables.push({
        title: "HPP per produk",
        columns: [
          { key: "name", label: "Produk", type: "text" },
          { key: "sellingPrice", label: "Harga jual", type: "money" },
          { key: "unitHpp", label: "HPP / porsi", type: "money" },
          { key: "marginPct", label: "Margin", type: "pct" },
          { key: "qty", label: "Qty", type: "int" },
        ],
        rows: products.rows.map((p) => ({ name: p.name, sellingPrice: p.sellingPrice, unitHpp: p.unitHpp, marginPct: p.marginPct, qty: p.qty })),
      });
      summary = [
        ...(pnl.cogsBasis === "purchase"
          ? [
              { label: "Belanja Bar", value: money(pnl.purchaseBar) },
              { label: "Belanja Dapur", value: money(pnl.purchaseDapur) },
              { label: "Total belanja bahan (P&L)", value: money(pnl.cogs) },
              { label: "HPP resep (info)", value: money(pnl.cogsRecipe) },
            ]
          : [
              { label: "HPP resep", value: money(pnl.cogsRecipe) },
              { label: "Susut / waste gudang", value: money(pnl.cogsShrinkage) },
              { label: "HPP aktual", value: money(pnl.cogs) },
            ]),
        { label: "Biaya bahan / net sales", value: pct(pnl.hppRatioPct) },
        { label: "Penjualan terukur resep", value: pct(pnl.hppCoveragePct) },
        { label: "Produk tanpa resep", value: String(products.totals.withoutRecipe) },
      ];
      break;
    }
    case "bep": {
      const bep = dashboard.bep;
      const cm = bep.available ? bep.contributionMarginPct / 100 : null;
      const rows = figures.map((f) => {
        const target = cm && f.fixedCost > 0 ? Math.round(f.fixedCost / cm) : null;
        return { date: f.date, netSales: f.netSales, target, achievement: target ? Math.round((f.netSales / target) * 1000) / 10 : null };
      });
      tables.push({
        title: "Revenue vs BEP harian",
        columns: [
          { key: "date", label: "Tanggal", type: "text" },
          { key: "netSales", label: "Net sales", type: "money" },
          { key: "target", label: "BEP", type: "money" },
          { key: "achievement", label: "Pencapaian", type: "pct" },
        ],
        rows,
      });
      summary = bep.available
        ? [
            { label: "BEP periode", value: money(bep.periodTarget) },
            { label: "Pencapaian", value: pct(bep.periodAchievementPct) },
            { label: "BEP harian", value: money(bep.dailyTarget) },
            { label: "BEP bulanan", value: money(bep.monthlyTarget) },
            { label: "BEP tahunan", value: money(bep.annualTarget) },
            { label: "Contribution margin", value: pct(bep.contributionMarginPct) },
            { label: "Biaya tetap / hari", value: money(bep.fixedCostDaily) },
          ]
        : [{ label: "BEP", value: bep.reason }];
      break;
    }
    case "capital": {
      const txs = await getDb().select().from(capitalTransactions).orderBy(asc(capitalTransactions.txDate));
      tables.push({
        title: "Transaksi modal",
        columns: [
          { key: "date", label: "Tanggal", type: "text" },
          { key: "type", label: "Jenis", type: "text" },
          { key: "description", label: "Keterangan", type: "text" },
          { key: "amount", label: "Nominal", type: "money" },
        ],
        rows: txs.map((tx) => ({
          date: String(tx.txDate),
          type: tx.type === "withdrawal" ? "Penarikan" : "Setoran",
          description: tx.description,
          amount: Number(tx.amount),
        })),
      });
      const all = await getDayFigures(config.businessStartDate, todayKey, config, todayKey);
      let cumulative = 0;
      const capital = dashboard.capital;
      const rows = monthGroups(all).map(([month, list]) => {
        const net = list.reduce((s, f) => s + f.netProfit, 0);
        cumulative += net;
        return {
          month: monthLabel(`${month}-01`),
          netProfit: net,
          cumulative,
          pct: capital.initialCapital > 0 ? Math.max(0, Math.round((cumulative / capital.initialCapital) * 1000) / 10) : null,
        };
      });
      tables.push({
        title: "Pengembalian modal per bulan",
        columns: [
          { key: "month", label: "Bulan", type: "text" },
          { key: "netProfit", label: "Net profit", type: "money" },
          { key: "cumulative", label: "Kumulatif", type: "money" },
          { key: "pct", label: "% modal", type: "pct" },
        ],
        rows,
      });
      summary = [
        { label: "Modal awal", value: money(capital.initialCapital) },
        { label: "Recovered", value: money(capital.recovered) },
        { label: "Sisa", value: money(capital.remaining) },
        { label: "Recovery", value: pct(capital.recoveryPct) },
        {
          label: "Estimasi payback (PROYEKSI)",
          value: capital.estimatedPaybackMonths === null ? "Belum bisa diproyeksi" : `±${capital.estimatedPaybackMonths} bulan`,
        },
      ];
      break;
    }
    case "product": {
      const products = await getProductProfitability(period.fromKey, period.toKey);
      tables.push({
        title: "Profitabilitas produk",
        columns: [
          { key: "name", label: "Produk", type: "text" },
          { key: "sellingPrice", label: "Harga jual", type: "money" },
          { key: "unitHpp", label: "HPP", type: "money" },
          { key: "grossProfitPerUnit", label: "Gross profit", type: "money" },
          { key: "marginPct", label: "Margin", type: "pct" },
          { key: "qty", label: "Qty", type: "int" },
          { key: "revenue", label: "Omzet", type: "money" },
          { key: "contribution", label: "Kontribusi", type: "money" },
        ],
        rows: products.rows.map((p) => ({
          name: p.name,
          sellingPrice: p.sellingPrice,
          unitHpp: p.unitHpp,
          grossProfitPerUnit: p.grossProfitPerUnit,
          marginPct: p.marginPct,
          qty: p.qty,
          revenue: p.revenue,
          contribution: p.contribution,
        })),
      });
      summary = [
        { label: "Omzet item", value: money(products.totals.revenue) },
        { label: "Total kontribusi (produk ber-resep)", value: money(products.totals.contribution) },
        { label: "Qty terjual", value: new Intl.NumberFormat("id-ID").format(products.totals.qty) },
        { label: "Produk tanpa resep", value: String(products.totals.withoutRecipe) },
      ];
      notes.push("Harga jual = rata-rata harga item sebelum diskon level order.");
      break;
    }
  }

  return {
    type: input.type,
    title: REPORT_LABEL[input.type],
    periodLabel:
      period.fromKey === period.toKey
        ? longDayLabel(period.fromKey)
        : `${shortDayLabel(period.fromKey)} ${period.fromKey.slice(0, 4)} – ${shortDayLabel(period.toKey)} ${period.toKey.slice(0, 4)}`,
    generatedAt: new Date().toISOString(),
    summary,
    tables,
    notes,
  };
}

// ─── Writer: engine laporan standar (src/lib/report-engine.ts) ──────────────
export { reportToCsv, reportToPdf, reportToXlsx } from "@/lib/report-engine";

/** Nama file standar per jenis laporan keuangan (GARAGE_LAPORAN_…). */
const FILE_KIND: Record<ReportType, string> = {
  daily: "LAPORAN_KEUANGAN_HARIAN",
  pnl: "LAPORAN_LABA_RUGI",
  cashflow: "LAPORAN_CASHFLOW",
  expense: "LAPORAN_PENGELUARAN",
  payroll: "LAPORAN_PAYROLL",
  hpp: "LAPORAN_HPP",
  bep: "LAPORAN_BEP",
  capital: "LAPORAN_BALIK_MODAL",
  product: "LAPORAN_PROFITABILITAS_PRODUK",
};

export async function exportFinanceReport(input: {
  type: ReportType;
  format: ExportFormat;
  period: PeriodKey;
  from?: string | null;
  to?: string | null;
}) {
  const report = await buildFinanceReport(input);
  // Nama file = periode yang sama dengan isi laporan (tanggal operasional).
  const resolved = resolvePeriod(input.period, jakartaDateKey(new Date(), await loadBusinessDayPolicy()), {
    from: input.from,
    to: input.to,
  });
  return renderReport(report, input.format, { kind: FILE_KIND[input.type], from: resolved.fromKey, to: resolved.toKey });
}
