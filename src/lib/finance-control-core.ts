// Garage Financial Control System — kalkulasi murni (tanpa DB) supaya bisa
// dites. Semua angka berasal dari data transaksi + master data; tidak ada
// persentase karangan. Nominal Rupiah selalu integer.

export type CostTreatment = "accrue" | "budget_only" | "reserve";
export type CostClass = "fixed" | "variable" | "semi_variable" | "reserve";
export type ExpenseGroup =
  | "opex"
  | "cogs_purchase"
  | "payroll"
  | "payroll_payout"
  | "non_operating"
  | "reserve"
  | "non_pnl";

export const EXPENSE_GROUP_LABEL: Record<ExpenseGroup, string> = {
  opex: "Biaya operasional",
  cogs_purchase: "Belanja bahan (masuk HPP via resep)",
  payroll: "Payroll manual",
  payroll_payout: "Pencairan gaji/fee (sudah diakru Payroll)",
  non_operating: "Non-operasional",
  reserve: "Cadangan / Save Money",
  non_pnl: "Bukan biaya (kasbon, aset)",
};

export type FinanceCostItem = {
  code: string;
  name: string;
  dailyAmount: number;
  costClass: CostClass;
  treatment: CostTreatment;
  active: boolean;
  sortOrder: number;
};

export type FinancePayrollPosition = {
  position: string;
  monthlySalary: number;
  headcount: number;
  active: boolean;
};

export type FinanceExpenseCategory = {
  name: string;
  groupKey: ExpenseGroup;
  costClass: CostClass;
  costItemCode: string | null;
};

export type FinanceThresholds = {
  hppRatioMax: number;
  opexRatioMax: number;
  payrollRatioMax: number;
  cashRunwaySafeDays: number;
  cashRunwayWarnDays: number;
  cashVarianceTolerance: number;
};

export type CapitalTx = { date: string; type: "injection" | "withdrawal"; amount: number };

export type FinanceConfig = {
  businessStartDate: string;
  openingCash: { amount: number; date: string; isSet: boolean };
  revenueTargetDaily: number | null;
  thresholds: FinanceThresholds;
  costItems: FinanceCostItem[];
  payrollPositions: FinancePayrollPosition[];
  categories: FinanceExpenseCategory[];
  capital: CapitalTx[];
};

export const DEFAULT_THRESHOLDS: FinanceThresholds = {
  hppRatioMax: 35,
  opexRatioMax: 25,
  payrollRatioMax: 30,
  cashRunwaySafeDays: 30,
  cashRunwayWarnDays: 7,
  cashVarianceTolerance: 10_000,
};

/** Data mentah satu hari (WIB) langsung dari tabel transaksi. */
export type DayRaw = {
  date: string;
  orderCount: number;
  netSales: number;
  discount: number;
  refund: number;
  voidCount: number;
  voidAmount: number;
  cogs: number;
  /** Susut/waste gudang bersih (nilai rupiah; negatif = selisih lebih). PRD §11. */
  shrinkage: number;
  lineSales: number;
  coveredLineSales: number;
  payrollWages: number;
  payrollFee: number;
  expenses: Record<string, number>;
  payments: Record<string, number>;
  settlementFees: number;
  capitalIn: number;
  capitalOut: number;
};

/** Angka keuangan satu hari setelah aturan finance diterapkan. */
export type DayFigure = {
  date: string;
  orderCount: number;
  grossSales: number;
  discount: number;
  refund: number;
  voidCount: number;
  voidAmount: number;
  netSales: number;
  /** HPP aktual = HPP resep + susut gudang (PRD §11). */
  cogs: number;
  cogsRecipe: number;
  cogsShrinkage: number;
  grossProfit: number;
  payroll: number;
  operatingExpense: number;
  operatingProfit: number;
  nonOperatingExpense: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  reserveAllocation: number;
  fixedCost: number;
  variableCost: number;
  lineSales: number;
  coveredLineSales: number;
  /** Komposisi biaya P&L (payroll, item akru, expense aktual, fee transaksi). */
  costLines: Record<string, number>;
  /** Cash out per kelompok expense. */
  cashOutByGroup: Record<string, number>;
  /** Cash in per metode pembayaran (+ "Modal"). */
  channels: Record<string, number>;
  /** Pengeluaran aktual per kode cost item (untuk kontrol budget). */
  linkedActual: Record<string, number>;
  source: "live" | "auto" | "locked";
};

export type FigureTotals = Omit<DayFigure, "date" | "source"> & { days: number };

const NUMERIC_KEYS = [
  "orderCount",
  "grossSales",
  "discount",
  "refund",
  "voidCount",
  "voidAmount",
  "netSales",
  "cogs",
  "cogsRecipe",
  "cogsShrinkage",
  "grossProfit",
  "payroll",
  "operatingExpense",
  "operatingProfit",
  "nonOperatingExpense",
  "netProfit",
  "cashIn",
  "cashOut",
  "reserveAllocation",
  "fixedCost",
  "variableCost",
  "lineSales",
  "coveredLineSales",
] as const;

const RECORD_KEYS = ["costLines", "cashOutByGroup", "channels", "linkedActual"] as const;

// ─── Tanggal (kunci YYYY-MM-DD, zona WIB tanpa DST) ─────────────────────────

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000;

export function jakartaDateKey(date = new Date()) {
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export function jakartaHour(date: Date) {
  return new Date(date.getTime() + WIB_OFFSET_MS).getUTCHours();
}

function keyToUtc(key: string) {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

export function addDays(key: string, days: number) {
  return new Date(keyToUtc(key) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(fromKey: string, toKey: string) {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / DAY_MS);
}

export function daysInMonth(key: string) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthStartKey(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function shiftMonth(key: string, months: number) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1 + months;
  const target = new Date(Date.UTC(year, month, 1));
  const day = Math.min(Number(key.slice(8, 10)), daysInMonth(target.toISOString().slice(0, 10)));
  target.setUTCDate(day);
  return target.toISOString().slice(0, 10);
}

export function eachDay(fromKey: string, toKey: string) {
  const out: string[] = [];
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) out.push(key);
  return out;
}

/** Awal hari WIB sebagai Date (untuk filter timestamp). */
export function jakartaDayStart(key: string) {
  return new Date(keyToUtc(key) - WIB_OFFSET_MS);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTH_LONG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function shortDayLabel(key: string) {
  return `${Number(key.slice(8, 10))} ${MONTH_SHORT[Number(key.slice(5, 7)) - 1]}`;
}

export function longDayLabel(key: string) {
  return `${Number(key.slice(8, 10))} ${MONTH_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

export function monthLabel(key: string) {
  return `${MONTH_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

// ─── Periode (filter global PRD §33) ────────────────────────────────────────

export const PERIOD_KEYS = ["today", "7d", "this_month", "last_month", "this_year", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type ResolvedPeriod = {
  key: PeriodKey;
  label: string;
  fromKey: string;
  toKey: string;
  days: number;
  prevFromKey: string;
  prevToKey: string;
  granularity: "hour" | "day" | "month";
};

export function resolvePeriod(
  key: PeriodKey,
  todayKey: string,
  custom?: { from?: string | null; to?: string | null },
): ResolvedPeriod {
  let fromKey = todayKey;
  let toKey = todayKey;
  let prevFromKey: string;
  let prevToKey: string;
  let label = "Hari ini";
  let granularity: ResolvedPeriod["granularity"] = "day";

  if (key === "today") {
    prevFromKey = prevToKey = addDays(todayKey, -1);
    granularity = "hour";
  } else if (key === "7d") {
    fromKey = addDays(todayKey, -6);
    prevToKey = addDays(fromKey, -1);
    prevFromKey = addDays(prevToKey, -6);
    label = "7 hari terakhir";
  } else if (key === "this_month") {
    fromKey = monthStartKey(todayKey);
    const prevMonthEnd = addDays(fromKey, -1);
    prevFromKey = monthStartKey(prevMonthEnd);
    prevToKey = shiftMonth(todayKey, -1);
    if (prevToKey > prevMonthEnd || prevToKey < prevFromKey) prevToKey = prevMonthEnd;
    label = monthLabel(todayKey);
  } else if (key === "last_month") {
    toKey = addDays(monthStartKey(todayKey), -1);
    fromKey = monthStartKey(toKey);
    prevToKey = addDays(fromKey, -1);
    prevFromKey = monthStartKey(prevToKey);
    label = monthLabel(fromKey);
  } else if (key === "this_year") {
    fromKey = `${todayKey.slice(0, 4)}-01-01`;
    const lastYear = String(Number(todayKey.slice(0, 4)) - 1);
    prevFromKey = `${lastYear}-01-01`;
    prevToKey = `${lastYear}${todayKey.slice(4)}`;
    if (prevToKey.endsWith("02-29")) prevToKey = `${lastYear}-02-28`;
    label = `Tahun ${todayKey.slice(0, 4)}`;
    granularity = "month";
  } else {
    const from = custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? custom.from : todayKey;
    const to = custom?.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? custom.to : todayKey;
    fromKey = from <= to ? from : to;
    toKey = from <= to ? to : from;
    if (toKey > todayKey) toKey = todayKey;
    if (fromKey > toKey) fromKey = toKey;
    if (diffDays(fromKey, toKey) > 365) fromKey = addDays(toKey, -365);
    const length = diffDays(fromKey, toKey) + 1;
    prevToKey = addDays(fromKey, -1);
    prevFromKey = addDays(prevToKey, -(length - 1));
    label = fromKey === toKey ? longDayLabel(fromKey) : `${shortDayLabel(fromKey)} – ${shortDayLabel(toKey)}`;
    granularity = length === 1 ? "hour" : length > 92 ? "month" : "day";
  }

  return {
    key,
    label,
    fromKey,
    toKey,
    days: diffDays(fromKey, toKey) + 1,
    prevFromKey,
    prevToKey,
    granularity,
  };
}

// ─── Aturan finance per hari ────────────────────────────────────────────────

export function payrollMasterMonthly(config: Pick<FinanceConfig, "payrollPositions">) {
  return config.payrollPositions
    .filter((row) => row.active)
    .reduce((sum, row) => sum + row.monthlySalary * Math.max(0, row.headcount), 0);
}

/** Payroll budget harian dari Payroll Master (bulanan ÷ 30). */
export function payrollBudgetDaily(config: Pick<FinanceConfig, "payrollPositions">) {
  return Math.round(payrollMasterMonthly(config) / 30);
}

export function accruedDailyOpex(config: Pick<FinanceConfig, "costItems">) {
  return config.costItems
    .filter((item) => item.active && item.treatment === "accrue")
    .reduce((sum, item) => sum + item.dailyAmount, 0);
}

/** Biaya tetap harian untuk BEP = item akru harian + payroll budget. */
export function fixedCostDaily(config: Pick<FinanceConfig, "costItems" | "payrollPositions">) {
  return accruedDailyOpex(config) + payrollBudgetDaily(config);
}

export function classifyCategory(config: Pick<FinanceConfig, "categories">, name: string): FinanceExpenseCategory {
  const lower = name.trim().toLowerCase();
  return (
    config.categories.find((row) => row.name.toLowerCase() === lower) ?? {
      name,
      groupKey: "opex",
      costClass: "variable",
      costItemCode: null,
    }
  );
}

function add(record: Record<string, number>, key: string, amount: number) {
  if (!amount) return;
  record[key] = (record[key] ?? 0) + amount;
}

export function computeDayFigure(raw: DayRaw, config: FinanceConfig): DayFigure {
  const active = raw.date >= config.businessStartDate;
  const accrueItems = active
    ? config.costItems.filter((item) => item.active && item.treatment === "accrue")
    : [];
  const accruedCodes = new Set(accrueItems.map((item) => item.code));
  const costLines: Record<string, number> = {};
  const cashOutByGroup: Record<string, number> = {};
  const linkedActual: Record<string, number> = {};

  let opexActual = 0;
  let variableOpex = 0;
  let payrollExpense = 0;
  let nonOperating = 0;
  let expenseCashOut = 0;

  for (const [category, amount] of Object.entries(raw.expenses)) {
    if (!amount) continue;
    const rule = classifyCategory(config, category);
    expenseCashOut += amount;
    add(cashOutByGroup, rule.groupKey, amount);
    if (rule.costItemCode) add(linkedActual, rule.costItemCode, amount);

    if (rule.groupKey === "opex") {
      // Sudah diakru lewat cost item → hanya cashflow, jangan dobel di P&L.
      if (rule.costItemCode && accruedCodes.has(rule.costItemCode)) continue;
      opexActual += amount;
      add(costLines, category, amount);
      if (rule.costClass === "variable") variableOpex += amount;
    } else if (rule.groupKey === "payroll") {
      payrollExpense += amount;
    } else if (rule.groupKey === "non_operating") {
      nonOperating += amount;
      add(costLines, category, amount);
    }
  }

  let opexAccrued = 0;
  for (const item of accrueItems) {
    opexAccrued += item.dailyAmount;
    add(costLines, item.name, item.dailyAmount);
  }

  const payroll = raw.payrollWages + raw.payrollFee + payrollExpense;
  add(costLines, "Payroll", payroll);
  add(costLines, "Biaya transaksi", raw.settlementFees);

  const reserveAllocation = active
    ? config.costItems
        .filter((item) => item.active && item.treatment === "reserve")
        .reduce((sum, item) => sum + item.dailyAmount, 0)
    : 0;

  const operatingExpense = opexAccrued + opexActual + raw.settlementFees;
  // HPP aktual = resep (konsumsi penjualan) + susut/waste gudang.
  const cogs = raw.cogs + raw.shrinkage;
  const grossProfit = raw.netSales - cogs;
  const operatingProfit = grossProfit - payroll - operatingExpense;
  const channels = { ...raw.payments };
  add(channels, "Modal", raw.capitalIn);

  return {
    date: raw.date,
    orderCount: raw.orderCount,
    grossSales: raw.netSales + raw.discount + raw.refund,
    discount: raw.discount,
    refund: raw.refund,
    voidCount: raw.voidCount,
    voidAmount: raw.voidAmount,
    netSales: raw.netSales,
    cogs,
    cogsRecipe: raw.cogs,
    cogsShrinkage: raw.shrinkage,
    grossProfit,
    payroll,
    operatingExpense,
    operatingProfit,
    nonOperatingExpense: nonOperating,
    netProfit: operatingProfit - nonOperating,
    cashIn: Object.values(raw.payments).reduce((sum, value) => sum + value, 0) + raw.capitalIn,
    cashOut: expenseCashOut + raw.capitalOut,
    reserveAllocation,
    fixedCost: active ? opexAccrued + payrollBudgetDaily(config) : 0,
    // Contribution margin memakai HPP resep saja: susut tidak proporsional ke penjualan.
    variableCost: raw.cogs + raw.settlementFees + variableOpex,
    lineSales: raw.lineSales,
    coveredLineSales: raw.coveredLineSales,
    costLines,
    cashOutByGroup,
    channels,
    linkedActual,
    source: "live",
  };
}

export function sumFigures(figures: DayFigure[]): FigureTotals {
  const totals = { days: figures.length } as FigureTotals;
  for (const key of NUMERIC_KEYS) totals[key] = 0;
  for (const key of RECORD_KEYS) totals[key] = {};
  for (const figure of figures) {
    for (const key of NUMERIC_KEYS) totals[key] += figure[key];
    for (const key of RECORD_KEYS) {
      for (const [name, value] of Object.entries(figure[key])) add(totals[key], name, value);
    }
  }
  return totals;
}

export function ratioPct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function changePct(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// ─── BEP (PRD §18–§19) ──────────────────────────────────────────────────────

export type BepStatus = "BELOW" | "NEAR" | "ABOVE";

export const BEP_STATUS_LABEL: Record<BepStatus, string> = {
  BELOW: "Di bawah BEP",
  NEAR: "Mendekati BEP",
  ABOVE: "BEP tercapai",
};

export function bepStatus(pct: number): BepStatus {
  if (pct >= 100) return "ABOVE";
  if (pct >= 85) return "NEAR";
  return "BELOW";
}

export type BepResult =
  | {
      available: true;
      contributionMarginPct: number;
      cmSource: "period" | "trailing_30d";
      fixedCostDaily: number;
      dailyTarget: number;
      periodTarget: number;
      monthlyTarget: number;
      annualTarget: number;
      periodActual: number;
      periodAchievementPct: number;
      periodStatus: BepStatus;
    }
  | { available: false; reason: string; fixedCostDaily: number };

export function contributionMargin(totals: Pick<FigureTotals, "netSales" | "variableCost">) {
  return totals.netSales > 0 ? (totals.netSales - totals.variableCost) / totals.netSales : null;
}

export function computeBep(input: {
  totals: FigureTotals;
  trailing: FigureTotals;
  fixedDaily: number;
  monthDays: number;
}): BepResult {
  const periodCm = contributionMargin(input.totals);
  const trailingCm = contributionMargin(input.trailing);
  const cm = periodCm ?? trailingCm;
  const cmSource = periodCm !== null ? "period" : "trailing_30d";

  if (input.totals.fixedCost <= 0) {
    return {
      available: false,
      reason: "Belum ada biaya tetap pada periode ini (sebelum tanggal mulai bisnis).",
      fixedCostDaily: input.fixedDaily,
    };
  }
  if (cm === null) {
    return {
      available: false,
      reason: "Belum ada penjualan untuk menghitung contribution margin.",
      fixedCostDaily: input.fixedDaily,
    };
  }
  if (cm <= 0) {
    return {
      available: false,
      reason: "Contribution margin ≤ 0: HPP + biaya variabel melebihi penjualan, BEP tidak tercapai berapa pun omzetnya.",
      fixedCostDaily: input.fixedDaily,
    };
  }

  const periodTarget = Math.round(input.totals.fixedCost / cm);
  const pct = periodTarget > 0 ? Math.round((input.totals.netSales / periodTarget) * 1000) / 10 : 0;
  return {
    available: true,
    contributionMarginPct: Math.round(cm * 1000) / 10,
    cmSource,
    fixedCostDaily: input.fixedDaily,
    dailyTarget: Math.round(input.fixedDaily / cm),
    periodTarget,
    monthlyTarget: Math.round((input.fixedDaily * input.monthDays) / cm),
    annualTarget: Math.round((input.fixedDaily * 365) / cm),
    periodActual: input.totals.netSales,
    periodAchievementPct: pct,
    periodStatus: bepStatus(pct),
  };
}

// ─── Capital recovery (PRD §27) ─────────────────────────────────────────────

export type CapitalRecovery = {
  initialCapital: number;
  withdrawn: number;
  recovered: number;
  remaining: number;
  recoveryPct: number;
  avgDailyNetProfit: number | null;
  estimatedPaybackMonths: number | null;
  estimatedPaybackDate: string | null;
  startDate: string;
  daysRunning: number;
};

export function computeCapitalRecovery(input: {
  capital: CapitalTx[];
  cumulativeNetProfit: number;
  recentNetProfits: number[];
  startDate: string;
  todayKey: string;
}): CapitalRecovery {
  const initialCapital = input.capital
    .filter((tx) => tx.type === "injection")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const withdrawn = input.capital
    .filter((tx) => tx.type === "withdrawal")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const recovered = input.cumulativeNetProfit;
  const remaining = Math.max(0, initialCapital - recovered);
  const recoveryPct =
    initialCapital > 0
      ? Math.max(0, Math.min(100, Math.round((recovered / initialCapital) * 1000) / 10))
      : 0;
  const avgDailyNetProfit = input.recentNetProfits.length
    ? Math.round(input.recentNetProfits.reduce((sum, v) => sum + v, 0) / input.recentNetProfits.length)
    : null;
  const payable = remaining > 0 && avgDailyNetProfit !== null && avgDailyNetProfit > 0;
  const paybackDays = payable ? Math.ceil(remaining / avgDailyNetProfit!) : null;

  return {
    initialCapital,
    withdrawn,
    recovered,
    remaining,
    recoveryPct,
    avgDailyNetProfit,
    estimatedPaybackMonths: paybackDays !== null ? Math.round((paybackDays / 30) * 10) / 10 : remaining === 0 && initialCapital > 0 ? 0 : null,
    estimatedPaybackDate: paybackDays !== null ? addDays(input.todayKey, paybackDays) : null,
    startDate: input.startDate,
    daysRunning: Math.max(0, diffDays(input.startDate, input.todayKey) + 1),
  };
}

// ─── Health, insight, alert (PRD §30, §31, §41) ─────────────────────────────

export function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${new Intl.NumberFormat("id-ID").format(Math.abs(Math.round(value)))}`;
}

function formatPct(value: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
}

export type HealthTone = "ok" | "warn" | "bad";
export type HealthLevel = "SEHAT" | "PERHATIAN" | "KRITIS";
export type AlertLevel = "info" | "watch" | "critical";
export type FinanceAlert = { area: string; level: AlertLevel; message: string };

export type BudgetLine = {
  code: string;
  name: string;
  monthlyBudget: number;
  actualMtd: number;
  usedPct: number;
};

export type PayrollRecon = {
  masterMonthly: number;
  dailyInput: number | null;
  projectedMonthly: number | null;
  variance: number | null;
  status: "SESUAI" | "PERLU REVIEW";
  actualMtd: number;
  masterProrataMtd: number;
  actualVsMasterPct: number | null;
};

export type HealthInput = {
  periodLabel: string;
  totals: FigureTotals;
  bep: BepResult;
  thresholds: FinanceThresholds;
  cashVariance: { sessions: number; flagged: number; totalAbs: number };
  cashRunwayDays: number | null;
  hppCoveragePct: number | null;
};

export function computeHealth(input: HealthInput) {
  const reasons: Array<{ tone: HealthTone; text: string }> = [];
  const { totals, thresholds } = input;

  const noSales = totals.netSales <= 0;
  if (noSales) {
    reasons.push({ tone: "warn", text: `Belum ada penjualan pada periode ${input.periodLabel}.` });
  } else if (input.bep.available) {
    const pct = input.bep.periodAchievementPct;
    reasons.push(
      pct >= 100
        ? { tone: "ok", text: `Revenue di atas BEP (${formatPct(pct)}).` }
        : pct >= 85
          ? { tone: "warn", text: `Revenue mendekati BEP (${formatPct(pct)}).` }
          : { tone: "bad", text: `Revenue di bawah BEP (${formatPct(pct)}).` },
    );
  } else {
    reasons.push({ tone: "bad", text: input.bep.reason });
  }

  if (totals.netSales > 0 || totals.netProfit !== 0) {
    reasons.push(
      totals.netProfit > 0
        ? { tone: "ok", text: `Net profit positif ${formatRupiah(totals.netProfit)}.` }
        : { tone: "bad", text: `Net profit negatif ${formatRupiah(totals.netProfit)}.` },
    );
  }

  const netCash = totals.cashIn - totals.cashOut;
  if (input.cashRunwayDays !== null && input.cashRunwayDays < thresholds.cashRunwayWarnDays) {
    reasons.push({ tone: "bad", text: `Kas hanya cukup ±${input.cashRunwayDays} hari biaya.` });
  } else {
    reasons.push(
      netCash >= 0
        ? { tone: "ok", text: `Cashflow positif ${formatRupiah(netCash)}.` }
        : { tone: "warn", text: `Cashflow negatif ${formatRupiah(netCash)}.` },
    );
  }

  const opexRatio = ratioPct(totals.operatingExpense, totals.netSales);
  if (opexRatio !== null) {
    reasons.push(
      opexRatio <= thresholds.opexRatioMax
        ? { tone: "ok", text: `Biaya operasional ${formatPct(opexRatio)} dari omzet (batas ${thresholds.opexRatioMax}%).` }
        : { tone: "warn", text: `Biaya operasional ${formatPct(opexRatio)} dari omzet, di atas batas ${thresholds.opexRatioMax}%.` },
    );
  }

  const hppRatio = ratioPct(totals.cogs, totals.netSales);
  if (input.hppCoveragePct !== null && input.hppCoveragePct < 80) {
    reasons.push({
      tone: "warn",
      text: `HPP baru terukur untuk ${formatPct(input.hppCoveragePct)} penjualan — lengkapi resep menu.`,
    });
  } else if (hppRatio !== null) {
    reasons.push(
      hppRatio <= thresholds.hppRatioMax
        ? { tone: "ok", text: `HPP ${formatPct(hppRatio)} dari omzet (batas ${thresholds.hppRatioMax}%).` }
        : { tone: "warn", text: `HPP ${formatPct(hppRatio)} dari omzet, di atas batas ${thresholds.hppRatioMax}%.` },
    );
  }

  const payrollRatio = ratioPct(totals.payroll, totals.netSales);
  if (payrollRatio !== null && totals.payroll > 0) {
    reasons.push(
      payrollRatio <= thresholds.payrollRatioMax
        ? { tone: "ok", text: `Payroll ${formatPct(payrollRatio)} dari omzet.` }
        : { tone: "warn", text: `Payroll ${formatPct(payrollRatio)} dari omzet, di atas batas ${thresholds.payrollRatioMax}%.` },
    );
  }

  if (input.cashVariance.flagged > 0) {
    reasons.push({
      tone: "bad",
      text: `${input.cashVariance.flagged} shift dengan selisih kas (total ${formatRupiah(input.cashVariance.totalAbs)}).`,
    });
  } else if (input.cashVariance.sessions > 0) {
    reasons.push({ tone: "ok", text: "Tidak ada selisih kas di luar toleransi." });
  }

  const score = Math.max(
    0,
    100 -
      reasons.filter((r) => r.tone === "bad").length * 25 -
      reasons.filter((r) => r.tone === "warn").length * 10,
  );
  // Tanpa penjualan, kondisi tidak boleh dinilai SEHAT.
  const level: HealthLevel = score >= 80 && !noSales ? "SEHAT" : score >= 55 ? "PERHATIAN" : "KRITIS";
  return { level, score, reasons };
}

export type InsightInput = {
  periodLabel: string;
  isToday: boolean;
  totals: FigureTotals;
  bep: BepResult;
  today: DayFigure | null;
  previous7: DayFigure[];
  budgets: BudgetLine[];
  payrollRecon: PayrollRecon;
  thresholds: FinanceThresholds;
};

/** Insight berbasis data aktual. Tidak ada kalimat kalau datanya tidak ada. */
export function buildInsights(input: InsightInput) {
  const insights: string[] = [];
  const subject = input.isToday ? "hari ini" : input.periodLabel;

  if (input.bep.available && input.totals.netSales > 0) {
    const gap = input.totals.netSales - input.bep.periodTarget;
    insights.push(
      gap >= 0
        ? `Omzet ${subject} telah melewati BEP sebesar ${formatRupiah(gap)}.`
        : `Omzet ${subject} masih ${formatRupiah(-gap)} di bawah BEP (${formatPct(input.bep.periodAchievementPct)} tercapai).`,
    );
  }

  const hppTrend = hppTrendVs7d(input.today, input.previous7);
  if (hppTrend && Math.abs(hppTrend.changePct) >= 1) {
    insights.push(
      `HPP hari ini ${hppTrend.changePct > 0 ? "meningkat" : "turun"} ${formatPct(Math.abs(hppTrend.changePct))} dibanding rata-rata 7 hari (${formatPct(hppTrend.todayRatio)} vs ${formatPct(hppTrend.avgRatio)} dari omzet).`,
    );
  }

  if (input.totals.cogsShrinkage !== 0) {
    insights.push(
      input.totals.cogsShrinkage > 0
        ? `HPP ${subject} termasuk susut/waste gudang ${formatRupiah(input.totals.cogsShrinkage)} di luar pemakaian resep.`
        : `Stock opname ${subject} menemukan selisih lebih ${formatRupiah(-input.totals.cogsShrinkage)} — cek pencatatan penerimaan barang.`,
    );
  }

  for (const line of input.budgets) {
    if (line.monthlyBudget > 0 && line.usedPct >= 80) {
      insights.push(
        `Pengeluaran ${line.name.toLowerCase()} sudah mencapai ${formatPct(line.usedPct)} dari budget bulanan.`,
      );
    }
  }

  const recon = input.payrollRecon;
  if (recon.actualVsMasterPct !== null && recon.actualMtd > 0 && Math.abs(recon.actualVsMasterPct) >= 1) {
    insights.push(
      `Payroll aktual bulan ini berada ${formatPct(Math.abs(recon.actualVsMasterPct))} ${recon.actualVsMasterPct < 0 ? "di bawah" : "di atas"} proyeksi Payroll Master.`,
    );
  }

  const costs = Object.entries(input.totals.costLines).sort((a, b) => b[1] - a[1]);
  const totalCost = costs.reduce((sum, [, value]) => sum + value, 0);
  if (costs.length && totalCost > 0) {
    const [name, value] = costs[0];
    insights.push(
      `Biaya terbesar ${subject}: ${name} ${formatRupiah(value)} (${formatPct((value / totalCost) * 100)} dari total biaya operasional).`,
    );
  }

  const channels = Object.entries(input.totals.channels)
    .filter(([name]) => name !== "Modal")
    .sort((a, b) => b[1] - a[1]);
  const channelTotal = channels.reduce((sum, [, value]) => sum + value, 0);
  if (channels.length && channelTotal > 0) {
    const [name, value] = channels[0];
    insights.push(`Channel pembayaran terbesar: ${name} (${formatPct((value / channelTotal) * 100)} dari uang masuk penjualan).`);
  }

  return insights;
}

export function hppTrendVs7d(today: DayFigure | null, previous7: DayFigure[]) {
  if (!today || today.netSales <= 0 || today.cogs <= 0) return null;
  const withSales = previous7.filter((day) => day.netSales > 0 && day.cogs > 0);
  if (!withSales.length) return null;
  const avgRatio =
    (withSales.reduce((sum, day) => sum + day.cogs, 0) / withSales.reduce((sum, day) => sum + day.netSales, 0)) * 100;
  const todayRatio = (today.cogs / today.netSales) * 100;
  if (avgRatio <= 0) return null;
  return {
    todayRatio: Math.round(todayRatio * 10) / 10,
    avgRatio: Math.round(avgRatio * 10) / 10,
    changePct: Math.round(((todayRatio - avgRatio) / avgRatio) * 1000) / 10,
  };
}

export type AlertInput = {
  today: DayFigure | null;
  todayBep: BepResult;
  previous7: DayFigure[];
  budgets: BudgetLine[];
  payrollRecon: PayrollRecon;
  cashVariance: { flagged: number; totalAbs: number };
  monthToDate: FigureTotals;
  previousMonthToDate: FigureTotals;
  openingCashSet: boolean;
  hppCoveragePct: number | null;
  unclassifiedCategories: string[];
};

export function buildAlerts(input: AlertInput): FinanceAlert[] {
  const alerts: FinanceAlert[] = [];

  if (input.today && input.todayBep.available && input.today.netSales < input.todayBep.dailyTarget) {
    alerts.push({
      area: "Revenue",
      level: "watch",
      message: `Omzet hari ini belum mencapai BEP (kurang ${formatRupiah(input.todayBep.dailyTarget - input.today.netSales)}).`,
    });
  }

  const hppTrend = hppTrendVs7d(input.today, input.previous7);
  if (hppTrend && hppTrend.changePct >= 5) {
    alerts.push({
      area: "HPP",
      level: "watch",
      message: `HPP meningkat ${formatPct(hppTrend.changePct)} dibanding rata-rata 7 hari.`,
    });
  }

  const shrink = input.monthToDate.cogsShrinkage;
  if (shrink > 0) {
    const ratio = input.monthToDate.cogsRecipe > 0 ? (shrink / input.monthToDate.cogsRecipe) * 100 : null;
    if (ratio === null || ratio >= 5) {
      alerts.push({
        area: "Gudang",
        level: ratio !== null && ratio >= 10 ? "critical" : "watch",
        message: `Susut/waste gudang bulan ini ${formatRupiah(shrink)}${ratio !== null ? ` (${formatPct(ratio)} dari HPP resep)` : ""}.`,
      });
    }
  }

  for (const line of input.budgets) {
    if (line.monthlyBudget > 0 && line.actualMtd > line.monthlyBudget) {
      alerts.push({
        area: "Expense",
        level: "critical",
        message: `Expense ${line.name} bulan ini telah melewati budget (${formatRupiah(line.actualMtd)} dari ${formatRupiah(line.monthlyBudget)}).`,
      });
    }
  }

  const recon = input.payrollRecon;
  if (recon.status === "PERLU REVIEW" && recon.variance !== null) {
    alerts.push({
      area: "Payroll",
      level: "info",
      message: `Payroll Master ${formatRupiah(recon.masterMonthly)} berbeda ${formatRupiah(Math.abs(recon.variance))} dari proyeksi input harian — perlu review.`,
    });
  }
  if (recon.actualVsMasterPct !== null && recon.actualMtd > 0 && Math.abs(recon.actualVsMasterPct) >= 10) {
    alerts.push({
      area: "Payroll",
      level: "watch",
      message: `Payroll aktual berbeda ${formatPct(Math.abs(recon.actualVsMasterPct))} dari proyeksi bulan berjalan.`,
    });
  }

  if (input.cashVariance.flagged > 0) {
    alerts.push({
      area: "Kas",
      level: "critical",
      message: `Terdapat selisih cash reconciliation pada ${input.cashVariance.flagged} shift (total ${formatRupiah(input.cashVariance.totalAbs)}).`,
    });
  }

  if (
    input.previousMonthToDate.netSales > 0 &&
    input.monthToDate.netProfit < input.previousMonthToDate.netProfit
  ) {
    alerts.push({
      area: "Profit",
      level: "watch",
      message: `Net profit bulan ini (${formatRupiah(input.monthToDate.netProfit)}) menurun dibanding periode yang sama bulan lalu (${formatRupiah(input.previousMonthToDate.netProfit)}).`,
    });
  }

  if (!input.openingCashSet) {
    alerts.push({
      area: "Data",
      level: "info",
      message: "Saldo kas awal belum diisi — posisi kas dihitung dari Rp0.",
    });
  }
  if (input.hppCoveragePct !== null && input.hppCoveragePct < 80) {
    alerts.push({
      area: "Data",
      level: "watch",
      message: `Resep (BOM) baru mencakup ${formatPct(input.hppCoveragePct)} penjualan — HPP & laba bisa terlalu tinggi.`,
    });
  }
  if (input.unclassifiedCategories.length) {
    alerts.push({
      area: "Data",
      level: "info",
      message: `Kategori expense belum diklasifikasi: ${input.unclassifiedCategories.slice(0, 4).join(", ")}${input.unclassifiedCategories.length > 4 ? "…" : ""}.`,
    });
  }

  const rank: Record<AlertLevel, number> = { critical: 0, watch: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

export function computeBudgets(input: {
  config: FinanceConfig;
  monthToDate: FigureTotals;
  monthDays: number;
}): BudgetLine[] {
  return input.config.costItems
    .filter((item) => item.active && item.treatment !== "reserve" && item.dailyAmount > 0)
    .filter((item) => input.config.categories.some((row) => row.costItemCode === item.code))
    .map((item) => {
      const monthlyBudget = item.dailyAmount * input.monthDays;
      const actualMtd = input.monthToDate.linkedActual[item.code] ?? 0;
      return {
        code: item.code,
        name: item.name,
        monthlyBudget,
        actualMtd,
        usedPct: monthlyBudget > 0 ? Math.round((actualMtd / monthlyBudget) * 1000) / 10 : 0,
      };
    });
}

export function computePayrollRecon(input: {
  config: FinanceConfig;
  monthToDate: FigureTotals;
  monthDays: number;
  daysElapsed: number;
}): PayrollRecon {
  const masterMonthly = payrollMasterMonthly(input.config);
  const dailyItem = input.config.costItems.find((item) => item.active && item.code === "GAJI");
  const dailyInput = dailyItem ? dailyItem.dailyAmount : null;
  const projectedMonthly = dailyInput !== null ? dailyInput * 30 : null;
  const variance = projectedMonthly !== null ? masterMonthly - projectedMonthly : null;
  const masterProrataMtd = Math.round((masterMonthly / input.monthDays) * input.daysElapsed);
  const actualMtd = input.monthToDate.payroll;
  return {
    masterMonthly,
    dailyInput,
    projectedMonthly,
    variance,
    status: variance !== null && variance !== 0 ? "PERLU REVIEW" : "SESUAI",
    actualMtd,
    masterProrataMtd,
    actualVsMasterPct: changePct(actualMtd, masterProrataMtd),
  };
}
