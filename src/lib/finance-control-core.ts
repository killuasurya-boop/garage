// Garage Financial Control System — kalkulasi murni (tanpa DB) supaya bisa
// dites. Semua angka berasal dari data transaksi + master data; tidak ada
// persentase karangan. Nominal Rupiah selalu integer.

import { businessDateKey, businessDayStart, CALENDAR_POLICY, type BusinessDayPolicy } from "@/lib/business-date";

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
  cogs_purchase: "Belanja bahan baku (Bar/Dapur)",
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

/**
 * Metode "modal kembali" (dipilih Owner di Pengaturan Keuangan):
 * - net_profit: akumulasi laba bersih akrual (default, PRD §27)
 * - operating_cashflow: akumulasi arus kas operasional (kas masuk penjualan −
 *   kas keluar operasional; modal masuk/keluar tidak dihitung)
 * - net_profit_after_reserve: laba bersih dikurangi Save Money (konservatif)
 */
export type CapitalRecoveryMethod = "net_profit" | "operating_cashflow" | "net_profit_after_reserve";

export const CAPITAL_RECOVERY_METHODS: Array<{ value: CapitalRecoveryMethod; label: string; hint: string }> = [
  { value: "net_profit", label: "Laba bersih", hint: "Akumulasi laba bersih (akrual) sejak mulai bisnis." },
  { value: "operating_cashflow", label: "Cashflow operasional", hint: "Kas masuk penjualan − kas keluar operasional (tanpa modal masuk/keluar)." },
  { value: "net_profit_after_reserve", label: "Laba bersih setelah Save Money", hint: "Laba bersih dikurangi cadangan Save Money harian (paling konservatif)." },
];

/** Anggaran biaya tidak tetap (belanja bahan baku) per hari, Rp. */
export type VariableBudget = { barMin: number; barMax: number; dapurMin: number; dapurMax: number };

export const DEFAULT_VARIABLE_BUDGET: VariableBudget = {
  barMin: 300_000,
  barMax: 800_000,
  dapurMin: 300_000,
  dapurMax: 500_000,
};

export type CogsBasis = "purchase" | "recipe";

export type FinanceConfig = {
  businessStartDate: string;
  /** Kebijakan tanggal operasional (B1b). Tidak diisi = kalender (fixture/tes lama). */
  businessDay?: BusinessDayPolicy;
  openingCash: { amount: number; date: string; isSet: boolean };
  revenueTargetDaily: number | null;
  thresholds: FinanceThresholds;
  capitalRecoveryMethod?: CapitalRecoveryMethod;
  variableBudget?: VariableBudget;
  /**
   * Dasar biaya bahan di laba rugi. "purchase" (konsep owner, Okt 2026):
   * Belanja bahan yang diterima gudang = biaya. "recipe": HPP resep + susut.
   * Tidak diisi = "recipe" (kompatibel data lama/fixture).
   */
  cogsBasis?: CogsBasis;
  /** Target profit bersih per bulan (Rp) — patokan balik modal. null = belum diisi. */
  netProfitTargetMonthly?: number | null;
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
  /** Ongkir delivery (titipan biaya antar) — DI LUAR penjualan bersih. */
  deliveryFees: number;
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
  /** Belanja bahan dari penerimaan gudang (cash lunas) per area. */
  purchases: { bar: number; dapur: number; umum: number };
  /** HPP Mitra: setoran mitra yang disetujui Owner (expense `sourceDoc` PSET:…) — biaya bahan, dihitung sekali. */
  partnerCost?: number;
  payments: Record<string, number>;
  settlementFees: number;
  capitalIn: number;
  capitalOut: number;
  /** Pendapatan lain di luar penjualan: uang sponsor event (buku kas, bersih setelah pembatalan). */
  otherIncome: number;
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
  /** Ongkir delivery terkumpul — dipisah dari penjualan (bukan omzet menu). */
  deliveryFees: number;
  /**
   * Biaya bahan di laba rugi. Mode purchase = belanja bahan diterima gudang;
   * mode recipe = HPP resep + susut gudang (PRD §11).
   */
  cogs: number;
  cogsRecipe: number;
  cogsShrinkage: number;
  /** Belanja bahan (penerimaan gudang) per area — selalu terisi sebagai info. */
  purchaseBar: number;
  purchaseDapur: number;
  purchaseUmum: number;
  /** Setoran mitra (HPP produk mitra, Owner 23 Nov 2026) — bagian dari `cogs` di kedua mode, bukan biaya operasional. */
  cogsPartner: number;
  grossProfit: number;
  payroll: number;
  operatingExpense: number;
  operatingProfit: number;
  nonOperatingExpense: number;
  /** Pendapatan lain (sponsor event). Menambah net profit, bukan omzet. */
  otherIncome: number;
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
  "deliveryFees",
  "cogs",
  "cogsRecipe",
  "cogsShrinkage",
  "purchaseBar",
  "purchaseDapur",
  "purchaseUmum",
  "cogsPartner",
  "grossProfit",
  "payroll",
  "operatingExpense",
  "operatingProfit",
  "nonOperatingExpense",
  "otherIncome",
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

/**
 * Tanggal WIB. Dengan `policy` (modul keuangan, B1b) = tanggal operasional
 * (cut-off); tanpa `policy` = kalender (payroll/absensi tetap kalender).
 */
export function jakartaDateKey(date = new Date(), policy: BusinessDayPolicy = CALENDAR_POLICY) {
  return businessDateKey(date, policy);
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

/** Awal hari WIB sebagai Date (untuk filter timestamp); `policy` = awal hari operasional. */
export function jakartaDayStart(key: string, policy: BusinessDayPolicy = CALENDAR_POLICY) {
  return businessDayStart(key, policy);
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

/** Kode item biaya "Upah karyawan". */
export const WAGE_ITEM_CODE = "GAJI";

/**
 * Item upah yang dibebankan harian ke P&L (treatment "accrue"). Upah = biaya
 * pasti harian; bila absensi Payroll punya upah aktual hari itu, angka aktual
 * yang dipakai (tidak dobel). "budget_only" = hanya patokan BEP.
 */
export function accruedWageItem(config: Pick<FinanceConfig, "costItems">) {
  return config.costItems.find((item) => item.code === WAGE_ITEM_CODE && item.active && item.treatment === "accrue") ?? null;
}

export function payrollMasterMonthly(config: Pick<FinanceConfig, "payrollPositions">) {
  return config.payrollPositions
    .filter((row) => row.active)
    .reduce((sum, row) => sum + row.monthlySalary * Math.max(0, row.headcount), 0);
}

/**
 * Payroll budget harian. Sumber utama = item biaya "GAJI" (Upah karyawan per
 * hari, diisi owner). Bila tidak ada/0, jatuh ke Payroll Master (bulanan ÷ 30).
 */
export function payrollBudgetDaily(config: Pick<FinanceConfig, "payrollPositions"> & Partial<Pick<FinanceConfig, "costItems">>) {
  const wageItem = config.costItems?.find(
    (item) => item.code === WAGE_ITEM_CODE && item.active && item.treatment !== "reserve" && item.dailyAmount > 0,
  );
  if (wageItem) return wageItem.dailyAmount;
  return Math.round(payrollMasterMonthly(config) / 30);
}

/** Cadangan harian (Save Money) — bukan beban, tidak masuk laba/BEP. */
export function reserveDaily(config: Pick<FinanceConfig, "costItems">) {
  return config.costItems
    .filter((item) => item.active && item.treatment === "reserve")
    .reduce((sum, item) => sum + item.dailyAmount, 0);
}

/** Item akru harian selain upah (upah dihitung di payroll). */
export function accruedDailyOpex(config: Pick<FinanceConfig, "costItems">) {
  return config.costItems
    .filter((item) => item.active && item.treatment === "accrue" && item.code !== WAGE_ITEM_CODE)
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
    ? config.costItems.filter((item) => item.active && item.treatment === "accrue" && item.code !== WAGE_ITEM_CODE)
    : [];
  const wageItem = active ? accruedWageItem(config) : null;
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

  // HPP Mitra (audit Owner 23 Nov 2026): dulu ikut biaya operasional (kategori tak terdaftar) DAN belanja bahan
  // (punya sourceDoc) → laba turun dua kali. Sekarang hanya biaya bahan; uang keluarnya tetap di arus kas (grup belanja).
  const cogsPartner = raw.partnerCost ?? 0;
  if (cogsPartner) {
    expenseCashOut += cogsPartner;
    add(cashOutByGroup, "cogs_purchase", cogsPartner);
  }

  let opexAccrued = 0;
  for (const item of accrueItems) {
    opexAccrued += item.dailyAmount;
    add(costLines, item.name, item.dailyAmount);
  }

  // Upah: aktual dari absensi bila ada; tanpa absensi → upah harian standar
  // (item GAJI "accrue") karena gaji tetap wajib dibayar tiap hari.
  const wages = raw.payrollWages > 0 || !wageItem ? raw.payrollWages : wageItem.dailyAmount;
  const payroll = wages + raw.payrollFee + payrollExpense;
  const wageLabel = wageItem?.name ?? "Upah karyawan";
  add(costLines, raw.payrollWages > 0 ? `${wageLabel} (absensi)` : wageLabel, wages);
  add(costLines, "Fee karyawan", raw.payrollFee);
  add(costLines, "Payroll lain", payrollExpense);
  add(costLines, "Biaya transaksi", raw.settlementFees);

  const reserveAllocation = active
    ? config.costItems
        .filter((item) => item.active && item.treatment === "reserve")
        .reduce((sum, item) => sum + item.dailyAmount, 0)
    : 0;

  const operatingExpense = opexAccrued + opexActual + raw.settlementFees;
  // Mode purchase: biaya bahan = belanja diterima gudang (sejak tanggal mulai
  // usaha; sebelum itu = stok awal, bagian modal). Mode recipe: HPP resep + susut.
  const purchaseMode = config.cogsBasis === "purchase";
  const purchases = raw.purchases ?? { bar: 0, dapur: 0, umum: 0 };
  const purchaseTotal = active ? purchases.bar + purchases.dapur + purchases.umum : 0;
  const cogs = (purchaseMode ? purchaseTotal : raw.cogs + raw.shrinkage) + cogsPartner;
  const grossProfit = raw.netSales - cogs;
  const operatingProfit = grossProfit - payroll - operatingExpense;
  const channels = { ...raw.payments };
  add(channels, "Modal", raw.capitalIn);
  const otherIncome = raw.otherIncome ?? 0;
  add(channels, "Sponsor", otherIncome);

  return {
    date: raw.date,
    orderCount: raw.orderCount,
    grossSales: raw.netSales + raw.discount + raw.refund,
    discount: raw.discount,
    refund: raw.refund,
    voidCount: raw.voidCount,
    voidAmount: raw.voidAmount,
    netSales: raw.netSales,
    deliveryFees: raw.deliveryFees,
    cogs,
    cogsRecipe: raw.cogs,
    cogsShrinkage: raw.shrinkage,
    purchaseBar: active ? purchases.bar : 0,
    purchaseDapur: active ? purchases.dapur : 0,
    purchaseUmum: active ? purchases.umum : 0,
    cogsPartner,
    grossProfit,
    payroll,
    operatingExpense,
    operatingProfit,
    nonOperatingExpense: nonOperating,
    otherIncome,
    netProfit: operatingProfit + otherIncome - nonOperating,
    cashIn: Object.values(raw.payments).reduce((sum, value) => sum + value, 0) + raw.capitalIn + otherIncome,
    cashOut: expenseCashOut + raw.capitalOut,
    reserveAllocation,
    fixedCost: active ? opexAccrued + payrollBudgetDaily(config) : 0,
    // Contribution margin: mode recipe memakai HPP resep saja (susut tidak
    // proporsional ke penjualan); mode purchase memakai belanja bahan.
    variableCost: (purchaseMode ? purchaseTotal : raw.cogs) + cogsPartner + raw.settlementFees + variableOpex,
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
  /** Mode belanja: margin dari 30 hari terakhir supaya hari belanja besar tidak membuat BEP loncat. */
  preferTrailing?: boolean;
}): BepResult {
  const periodCm = contributionMargin(input.totals);
  const trailingCm = contributionMargin(input.trailing);
  const useTrailing = input.preferTrailing ? trailingCm !== null : periodCm === null;
  const cm = useTrailing ? trailingCm : periodCm;
  const cmSource = useTrailing ? "trailing_30d" : "period";

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
  method: CapitalRecoveryMethod;
  methodLabel: string;
  initialCapital: number;
  withdrawn: number;
  recovered: number;
  remaining: number;
  recoveryPct: number;
  /** ROI = akumulasi (metode terpilih) ÷ modal awal × 100 — boleh negatif. */
  roiPct: number | null;
  avgDailyNetProfit: number | null;
  /** Rata-rata per bulan dari performa aktual 30 hari terakhir (× 30). */
  avgMonthlyNetProfit: number | null;
  estimatedPaybackMonths: number | null;
  estimatedPaybackDate: string | null;
  startDate: string;
  daysRunning: number;
  /** Target profit bersih/bulan (patokan balik modal) — null bila belum diisi. */
  target: CapitalTarget | null;
  /** Belanja bahan sebelum tanggal mulai usaha = stok awal (bagian modal, bukan biaya). */
  openingStockPurchases: number;
};

export type CapitalTarget = {
  monthly: number;
  daily: number;
  /** Bulan berjalan: target prorata s/d hari ini vs realisasi (metode terpilih). */
  monthToDateTarget: number;
  monthToDateActual: number;
  monthToDateAchievementPct: number | null;
  status: "ABOVE" | "BELOW";
  /** Balik modal bila profit bersih = target. */
  paybackMonths: number | null;
  paybackDate: string | null;
};

export function computeCapitalTarget(input: {
  monthly: number | null | undefined;
  remaining: number;
  todayKey: string;
  monthToDateActual: number;
  /** Hari aktif usaha di bulan berjalan s/d hari ini. */
  activeDaysInMonth: number;
  monthDays: number;
}): CapitalTarget | null {
  if (!input.monthly || input.monthly <= 0) return null;
  const daily = input.monthly / Math.max(1, input.monthDays);
  const monthToDateTarget = Math.round(daily * Math.max(0, input.activeDaysInMonth));
  const paybackDays = input.remaining > 0 ? Math.ceil(input.remaining / (input.monthly / 30)) : 0;
  return {
    monthly: input.monthly,
    daily: Math.round(daily),
    monthToDateTarget,
    monthToDateActual: input.monthToDateActual,
    monthToDateAchievementPct:
      monthToDateTarget > 0 ? Math.round((input.monthToDateActual / monthToDateTarget) * 1000) / 10 : null,
    status: input.monthToDateActual >= monthToDateTarget ? "ABOVE" : "BELOW",
    paybackMonths: Math.round((paybackDays / 30) * 10) / 10,
    paybackDate: paybackDays > 0 ? addDays(input.todayKey, paybackDays) : null,
  };
}

export function computeCapitalRecovery(input: {
  capital: CapitalTx[];
  cumulativeNetProfit: number;
  recentNetProfits: number[];
  startDate: string;
  todayKey: string;
  method?: CapitalRecoveryMethod;
  targetMonthly?: number | null;
  monthToDateActual?: number;
  activeDaysInMonth?: number;
  monthDays?: number;
  openingStockPurchases?: number;
}): CapitalRecovery {
  const method = input.method ?? "net_profit";
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
    method,
    methodLabel: CAPITAL_RECOVERY_METHODS.find((row) => row.value === method)?.label ?? "Laba bersih",
    initialCapital,
    withdrawn,
    recovered,
    remaining,
    recoveryPct,
    roiPct: initialCapital > 0 ? Math.round((recovered / initialCapital) * 1000) / 10 : null,
    avgDailyNetProfit,
    avgMonthlyNetProfit: avgDailyNetProfit !== null ? avgDailyNetProfit * 30 : null,
    estimatedPaybackMonths: paybackDays !== null ? Math.round((paybackDays / 30) * 10) / 10 : remaining === 0 && initialCapital > 0 ? 0 : null,
    estimatedPaybackDate: paybackDays !== null ? addDays(input.todayKey, paybackDays) : null,
    startDate: input.startDate,
    daysRunning: Math.max(0, diffDays(input.startDate, input.todayKey) + 1),
    target: computeCapitalTarget({
      monthly: input.targetMonthly,
      remaining,
      todayKey: input.todayKey,
      monthToDateActual: input.monthToDateActual ?? 0,
      activeDaysInMonth: input.activeDaysInMonth ?? 0,
      monthDays: input.monthDays ?? 30,
    }),
    openingStockPurchases: input.openingStockPurchases ?? 0,
  };
}

/** Nilai "modal kembali" satu hari sesuai metode. capitalOutByDate = penarikan modal per tanggal. */
export function dayRecoveryValue(
  day: Pick<DayFigure, "date" | "netProfit" | "reserveAllocation" | "cashIn" | "cashOut" | "channels">,
  method: CapitalRecoveryMethod,
  capitalOutByDate: Map<string, number>,
) {
  if (method === "operating_cashflow") {
    const capitalIn = day.channels.Modal ?? 0;
    const capitalOut = capitalOutByDate.get(day.date) ?? 0;
    return day.cashIn - capitalIn - (day.cashOut - capitalOut);
  }
  if (method === "net_profit_after_reserve") return day.netProfit - day.reserveAllocation;
  return day.netProfit;
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
