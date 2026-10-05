// Garage Financial Control System — Financial Engine server-side (PRD V2.0).
// Sumber data (single source of truth, PRD §53):
//   POS (orders/payments) → Revenue & cash in
//   Resep (menu_recipes × inventory_items.unit_cost) → HPP
//   Payroll V2 (staff_daily_wages + fee_pool_splits) → Labor cost
//   Expenses → OPEX & cash out
// Hasil per hari disimpan ke financial_snapshots agar dashboard tidak
// menghitung ulang seluruh histori setiap dibuka (PRD §54).
import { and, asc, eq, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import {
  auditLogs,
  capitalTransactions,
  cashSessions,
  expenses,
  feePoolSplits,
  financeCostItems,
  financeDailyClosings,
  financeExpenseCategories,
  financePayrollPositions,
  financeSettings,
  financialSnapshots,
  inventoryItems,
  menuRecipes,
  orderItems,
  orders,
  paymentSettlements,
  payments,
  staffDailyWages,
  stockMovements,
  wmsStockMovement,
} from "@/db/schema";
import {
  DEFAULT_THRESHOLDS,
  addDays,
  buildAlerts,
  buildInsights,
  changePct,
  computeBep,
  computeBudgets,
  CAPITAL_RECOVERY_METHODS,
  DEFAULT_VARIABLE_BUDGET,
  computeCapitalRecovery,
  computeDayFigure,
  dayRecoveryValue,
  type CapitalRecoveryMethod,
  type VariableBudget,
  computeHealth,
  computePayrollRecon,
  daysInMonth,
  eachDay,
  fixedCostDaily,
  jakartaDateKey,
  jakartaDayStart,
  monthLabel,
  monthStartKey,
  payrollBudgetDaily,
  payrollMasterMonthly,
  ratioPct,
  resolvePeriod,
  shortDayLabel,
  sumFigures,
  type BepResult,
  type CostClass,
  type CostTreatment,
  type DayFigure,
  type DayRaw,
  type ExpenseGroup,
  type FinanceConfig,
  type FinanceCostItem,
  type FinanceExpenseCategory,
  type FinancePayrollPosition,
  type FinanceThresholds,
  type PeriodKey,
} from "@/lib/finance-control-core";
import type { GarageSession } from "@/lib/server-auth";

type Db = ReturnType<typeof getDb>;

// ─── Default master data dari PRD (§5, §6, §7) ──────────────────────────────

// Biaya tetap harian versi owner (Okt 2026): total Rp799.000/hari =
// operasional Rp699.000 + Save Money Rp100.000 (cadangan laba, bukan beban).
const DEFAULT_COST_ITEMS: FinanceCostItem[] = [
  { code: "GAJI", name: "Upah karyawan", dailyAmount: 544_000, costClass: "fixed", treatment: "budget_only", active: true, sortOrder: 1 },
  { code: "LISTRIK", name: "Listrik", dailyAmount: 35_000, costClass: "semi_variable", treatment: "accrue", active: true, sortOrder: 2 },
  { code: "INTERNET", name: "Internet", dailyAmount: 10_000, costClass: "fixed", treatment: "accrue", active: true, sortOrder: 3 },
  { code: "IKLAN", name: "Iklan", dailyAmount: 30_000, costClass: "variable", treatment: "accrue", active: true, sortOrder: 4 },
  { code: "SAVE", name: "Save Money", dailyAmount: 100_000, costClass: "reserve", treatment: "reserve", active: true, sortOrder: 5 },
  { code: "SEWA", name: "Sewa lapak", dailyAmount: 25_000, costClass: "fixed", treatment: "accrue", active: true, sortOrder: 6 },
  { code: "OVERHEAD", name: "Overhead mesin", dailyAmount: 55_000, costClass: "semi_variable", treatment: "accrue", active: true, sortOrder: 7 },
  { code: "SISTEM", name: "Sistem", dailyAmount: 0, costClass: "fixed", treatment: "accrue", active: false, sortOrder: 8 },
];

const DEFAULT_PAYROLL: Array<Omit<FinancePayrollPosition, "active">> = [
  { position: "Barista 1", monthlySalary: 2_000_000, headcount: 1 },
  { position: "Barista 2", monthlySalary: 2_000_000, headcount: 1 },
  { position: "Waiter 1", monthlySalary: 1_500_000, headcount: 1 },
  { position: "Waiter 2", monthlySalary: 1_500_000, headcount: 1 },
  { position: "Koki 1", monthlySalary: 2_000_000, headcount: 1 },
  { position: "Asisten Koki", monthlySalary: 1_500_000, headcount: 1 },
  { position: "Jaga Malam", monthlySalary: 2_000_000, headcount: 1 },
  { position: "Kasir", monthlySalary: 1_200_000, headcount: 1 },
  { position: "Manajer", monthlySalary: 2_500_000, headcount: 1 },
];

// Kategori yang dipakai form expense & payout Payroll V2 saat ini.
const DEFAULT_CATEGORIES: FinanceExpenseCategory[] = [
  { name: "COGS", groupKey: "cogs_purchase", costClass: "variable", costItemCode: null },
  { name: "Belanja Dapur", groupKey: "cogs_purchase", costClass: "variable", costItemCode: null },
  { name: "Belanja Bar", groupKey: "cogs_purchase", costClass: "variable", costItemCode: null },
  { name: "Payroll", groupKey: "payroll", costClass: "fixed", costItemCode: null },
  { name: "Gaji Karyawan", groupKey: "payroll_payout", costClass: "fixed", costItemCode: null },
  { name: "Fee/Insentif Karyawan", groupKey: "payroll_payout", costClass: "variable", costItemCode: null },
  { name: "Kasbon", groupKey: "non_pnl", costClass: "fixed", costItemCode: null },
  { name: "THR Karyawan", groupKey: "payroll", costClass: "fixed", costItemCode: null },
  { name: "Listrik", groupKey: "opex", costClass: "semi_variable", costItemCode: "LISTRIK" },
  { name: "Sewa", groupKey: "opex", costClass: "fixed", costItemCode: "SEWA" },
  { name: "Internet", groupKey: "opex", costClass: "fixed", costItemCode: "INTERNET" },
  { name: "Marketing", groupKey: "opex", costClass: "variable", costItemCode: "IKLAN" },
  { name: "Iklan", groupKey: "opex", costClass: "variable", costItemCode: "IKLAN" },
  { name: "Sistem", groupKey: "opex", costClass: "fixed", costItemCode: "SISTEM" },
  { name: "Overhead Mesin", groupKey: "opex", costClass: "semi_variable", costItemCode: "OVERHEAD" },
  { name: "Maintenance", groupKey: "opex", costClass: "semi_variable", costItemCode: null },
  { name: "Save Money", groupKey: "reserve", costClass: "reserve", costItemCode: "SAVE" },
  { name: "Operasional", groupKey: "opex", costClass: "semi_variable", costItemCode: null },
  { name: "Beli Air", groupKey: "opex", costClass: "variable", costItemCode: null },
  { name: "Beli Tisu", groupKey: "opex", costClass: "variable", costItemCode: null },
  { name: "Transport", groupKey: "opex", costClass: "variable", costItemCode: null },
  { name: "Konsumsi Staff", groupKey: "opex", costClass: "variable", costItemCode: null },
  { name: "Lain-lain", groupKey: "opex", costClass: "variable", costItemCode: null },
];

const INITIAL_CAPITAL = 500_000_000;

type SettingsShape = {
  businessStartDate: string;
  openingCash: { amount: number; date: string; isSet: boolean };
  revenueTargetDaily: number | null;
  thresholds: FinanceThresholds;
  /** Expense ≥ nilai ini wajib approval (PRD §46, configurable). */
  expenseApprovalThreshold: number;
  /** Expense ≥ nilai ini: review Manajer lalu keputusan final Owner (approval 2 tingkat). */
  expenseOwnerApprovalThreshold: number;
  /** Metode hitung modal kembali / payback (dipilih Owner). */
  capitalRecoveryMethod: CapitalRecoveryMethod;
  /** Anggaran belanja bahan baku per hari (Bar & Dapur). */
  variableBudget: VariableBudget;
};

export const DEFAULT_EXPENSE_APPROVAL_THRESHOLD = 1_000_000;
export const DEFAULT_EXPENSE_OWNER_APPROVAL_THRESHOLD = 5_000_000;

let defaultsReady: Promise<void> | null = null;

async function seedDefaults(db: Db) {
  const [costCount] = await db.select({ n: sql<number>`count(*)::int` }).from(financeCostItems);
  if (Number(costCount?.n ?? 0) === 0) {
    await db.insert(financeCostItems).values(DEFAULT_COST_ITEMS).onConflictDoNothing();
  }
  const [payrollCount] = await db.select({ n: sql<number>`count(*)::int` }).from(financePayrollPositions);
  if (Number(payrollCount?.n ?? 0) === 0) {
    await db
      .insert(financePayrollPositions)
      .values(DEFAULT_PAYROLL.map((row, index) => ({ ...row, sortOrder: index + 1 })));
  }
  const [categoryCount] = await db.select({ n: sql<number>`count(*)::int` }).from(financeExpenseCategories);
  if (Number(categoryCount?.n ?? 0) === 0) {
    await db.insert(financeExpenseCategories).values(DEFAULT_CATEGORIES).onConflictDoNothing();
  }

  const existing = await db.select({ key: financeSettings.key }).from(financeSettings);
  const keys = new Set(existing.map((row) => row.key));
  let startDate = jakartaDateKey();
  if (!keys.has("businessStartDate") || !keys.has("openingCash")) {
    const [first] = await db
      .select({ at: sql<Date | string | null>`min(${orders.createdAt})` })
      .from(orders);
    if (first?.at) startDate = jakartaDateKey(new Date(first.at));
  }
  const defaults: Record<string, unknown> = {
    businessStartDate: startDate,
    openingCash: { amount: 0, date: startDate, isSet: false },
    // 0 = belum ada target (jsonb null tidak boleh di kolom NOT NULL).
    revenueTargetDaily: 0,
    thresholds: DEFAULT_THRESHOLDS,
    expenseApprovalThreshold: DEFAULT_EXPENSE_APPROVAL_THRESHOLD,
    expenseOwnerApprovalThreshold: DEFAULT_EXPENSE_OWNER_APPROVAL_THRESHOLD,
  };
  const missing = Object.entries(defaults).filter(([key]) => !keys.has(key));
  if (missing.length) {
    await db
      .insert(financeSettings)
      .values(missing.map(([key, value]) => ({ key, value })))
      .onConflictDoNothing();
  }

  const [capitalCount] = await db.select({ n: sql<number>`count(*)::int` }).from(capitalTransactions);
  if (Number(capitalCount?.n ?? 0) === 0) {
    const [start] = await db
      .select({ value: financeSettings.value })
      .from(financeSettings)
      .where(eq(financeSettings.key, "businessStartDate"));
    await db.insert(capitalTransactions).values({
      txDate: typeof start?.value === "string" ? start.value : startDate,
      type: "injection",
      amount: INITIAL_CAPITAL,
      description: "Modal awal Garage (PRD V2.0)",
    });
  }
}

function ensureDefaults(db: Db) {
  if (!defaultsReady) {
    defaultsReady = seedDefaults(db).catch((error) => {
      defaultsReady = null;
      throw error;
    });
  }
  return defaultsReady;
}

function readSettings(rows: Array<{ key: string; value: unknown }>): SettingsShape {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const today = jakartaDateKey();
  const start = typeof map.get("businessStartDate") === "string" ? (map.get("businessStartDate") as string) : today;
  const opening = (map.get("openingCash") ?? {}) as Partial<SettingsShape["openingCash"]>;
  const target = map.get("revenueTargetDaily");
  return {
    businessStartDate: start,
    openingCash: {
      amount: Number(opening.amount ?? 0),
      date: typeof opening.date === "string" ? opening.date : start,
      isSet: Boolean(opening.isSet),
    },
    revenueTargetDaily: typeof target === "number" && target > 0 ? target : null,
    thresholds: { ...DEFAULT_THRESHOLDS, ...((map.get("thresholds") ?? {}) as Partial<FinanceThresholds>) },
    expenseApprovalThreshold:
      typeof map.get("expenseApprovalThreshold") === "number" && (map.get("expenseApprovalThreshold") as number) > 0
        ? (map.get("expenseApprovalThreshold") as number)
        : DEFAULT_EXPENSE_APPROVAL_THRESHOLD,
    expenseOwnerApprovalThreshold:
      typeof map.get("expenseOwnerApprovalThreshold") === "number" && (map.get("expenseOwnerApprovalThreshold") as number) > 0
        ? (map.get("expenseOwnerApprovalThreshold") as number)
        : DEFAULT_EXPENSE_OWNER_APPROVAL_THRESHOLD,
    capitalRecoveryMethod: CAPITAL_RECOVERY_METHODS.some((row) => row.value === map.get("capitalRecoveryMethod"))
      ? (map.get("capitalRecoveryMethod") as CapitalRecoveryMethod)
      : "net_profit",
    variableBudget: { ...DEFAULT_VARIABLE_BUDGET, ...((map.get("variableBudget") ?? {}) as Partial<VariableBudget>) },
  };
}

async function readNumberSetting(key: string, fallback: number) {
  try {
    const [row] = await getDb()
      .select({ value: financeSettings.value })
      .from(financeSettings)
      .where(eq(financeSettings.key, key))
      .limit(1);
    return typeof row?.value === "number" && row.value > 0 ? row.value : fallback;
  } catch {
    return fallback;
  }
}

/** Batas approval expense (dipakai createExpense). Aman dipanggil sebelum defaults ter-seed. */
export async function getExpenseApprovalThreshold() {
  return readNumberSetting("expenseApprovalThreshold", DEFAULT_EXPENSE_APPROVAL_THRESHOLD);
}

/** Batas approval tingkat 2: expense ≥ nilai ini wajib keputusan final Owner. */
export async function getExpenseOwnerApprovalThreshold() {
  return readNumberSetting("expenseOwnerApprovalThreshold", DEFAULT_EXPENSE_OWNER_APPROVAL_THRESHOLD);
}

export async function loadFinanceConfig(): Promise<FinanceConfig> {
  const db = getDb();
  await ensureDefaults(db);
  const [settingRows, costRows, payrollRows, categoryRows, capitalRows] = await Promise.all([
    db.select({ key: financeSettings.key, value: financeSettings.value }).from(financeSettings),
    db.select().from(financeCostItems).orderBy(asc(financeCostItems.sortOrder)),
    db.select().from(financePayrollPositions).orderBy(asc(financePayrollPositions.sortOrder)),
    db.select().from(financeExpenseCategories).orderBy(asc(financeExpenseCategories.name)),
    db.select().from(capitalTransactions).orderBy(asc(capitalTransactions.txDate)),
  ]);
  const settings = readSettings(settingRows);
  return {
    ...settings,
    costItems: costRows.map((row) => ({
      code: row.code,
      name: row.name,
      dailyAmount: row.dailyAmount,
      costClass: row.costClass as CostClass,
      treatment: row.treatment as CostTreatment,
      active: row.active,
      sortOrder: row.sortOrder,
    })),
    payrollPositions: payrollRows.map((row) => ({
      position: row.position,
      monthlySalary: row.monthlySalary,
      headcount: row.headcount,
      active: row.active,
    })),
    categories: categoryRows.map((row) => ({
      name: row.name,
      groupKey: row.groupKey as ExpenseGroup,
      costClass: row.costClass as CostClass,
      costItemCode: row.costItemCode,
    })),
    capital: capitalRows.map((row) => ({
      date: String(row.txDate),
      type: row.type === "withdrawal" ? "withdrawal" : "injection",
      amount: Number(row.amount),
    })),
  };
}

// ─── Loader transaksi per hari ──────────────────────────────────────────────

/** Tanggal WIB dari kolom timestamptz, format YYYY-MM-DD (WIB tanpa DST). */
function wibDay(column: AnyPgColumn): SQL<string> {
  return sql<string>`to_char((${column} at time zone 'UTC') + interval '7 hours', 'YYYY-MM-DD')`;
}

function dateText(column: AnyPgColumn): SQL<string> {
  return sql<string>`to_char(${column}, 'YYYY-MM-DD')`;
}

const PNL_EXPENSE_STATUSES = ["recorded", "approved", "paid"];

/** Pergerakan stok outlet yang dihitung sebagai susut/selisih (bukan penjualan/transfer). */
const SHRINKAGE_MOVEMENT_TYPES = [
  "opname_outlet",
  "opname_warehouse",
  "outlet_subtract",
  "warehouse_subtract",
  "outlet_clear",
  "warehouse_clear",
];

export function emptyRaw(date: string): DayRaw {
  return {
    date,
    orderCount: 0,
    netSales: 0,
    deliveryFees: 0,
    discount: 0,
    refund: 0,
    voidCount: 0,
    voidAmount: 0,
    cogs: 0,
    shrinkage: 0,
    lineSales: 0,
    coveredLineSales: 0,
    payrollWages: 0,
    payrollFee: 0,
    expenses: {},
    payments: {},
    settlementFees: 0,
    capitalIn: 0,
    capitalOut: 0,
  };
}

export async function loadDayRaws(fromKey: string, toKey: string): Promise<Map<string, DayRaw>> {
  const db = getDb();
  const start = jakartaDayStart(fromKey);
  const end = jakartaDayStart(addDays(toKey, 1));
  const orderDay = wibDay(orders.createdAt);
  const paymentDay = wibDay(payments.createdAt);
  const expenseDay = wibDay(expenses.expenseDate);
  const settlementDay = wibDay(paymentSettlements.settlementDate);
  const wageDay = dateText(staffDailyWages.date);
  const feeDay = dateText(feePoolSplits.date);
  const capitalDay = dateText(capitalTransactions.txDate);
  const movementDay = wibDay(stockMovements.createdAt);
  const wmsDay = wibDay(wmsStockMovement.createdAt);
  const inOrderRange = and(gte(orders.createdAt, start), lt(orders.createdAt, end));
  const recipeMatch = and(
    eq(orderItems.menuItemId, menuRecipes.menuItemId),
    eq(menuRecipes.status, "active"),
    sql`(${menuRecipes.variantId} = ${orderItems.variantId} or ${menuRecipes.variantId} = 'all')`,
  );

  const [
    salesRows,
    voidRows,
    refundRows,
    paymentRows,
    cogsRows,
    coverageRows,
    wageRows,
    feeRows,
    expenseRows,
    settlementRows,
    capitalRows,
    outletShrinkRows,
    wmsShrinkRows,
  ] = await Promise.all([
    db
      .select({
        day: orderDay,
        count: sql<number>`count(*)::int`,
        net: sql<string>`coalesce(sum(${orders.total} - ${orders.tax} - ${orders.deliveryFee}), 0)::bigint`,
        discount: sql<string>`coalesce(sum(${orders.discount}), 0)::bigint`,
        deliveryFees: sql<string>`coalesce(sum(${orders.deliveryFee}), 0)::bigint`,
      })
      .from(orders)
      .where(and(eq(orders.status, "paid"), inOrderRange))
      .groupBy(orderDay),
    db
      .select({
        day: orderDay,
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${orders.total} - ${orders.tax} - ${orders.deliveryFee}), 0)::bigint`,
      })
      .from(orders)
      .where(and(eq(orders.status, "voided"), inOrderRange))
      .groupBy(orderDay),
    db
      .select({
        day: orderDay,
        amount: sql<string>`coalesce(sum(coalesce((${payments.metadata}->>'refundedAmount')::numeric, 0)), 0)::bigint`,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(and(eq(orders.status, "paid"), inOrderRange))
      .groupBy(orderDay),
    db
      .select({
        day: paymentDay,
        method: payments.method,
        amount: sql<string>`coalesce(sum(${payments.amount}), 0)::bigint`,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          eq(payments.status, "captured"),
          eq(orders.status, "paid"),
          gte(payments.createdAt, start),
          lt(payments.createdAt, end),
        ),
      )
      .groupBy(paymentDay, payments.method),
    db
      .select({
        day: orderDay,
        cogs: sql<string>`coalesce(sum(${orderItems.qty} * ${menuRecipes.qty} * coalesce(${inventoryItems.unitCost}, 0) * (1 + greatest(${menuRecipes.wastePct}, 0) / 100.0)), 0)::float8`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(menuRecipes, recipeMatch)
      .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
      .where(and(eq(orders.status, "paid"), inOrderRange))
      .groupBy(orderDay),
    db
      .select({
        day: orderDay,
        lineSales: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)::bigint`,
        covered: sql<string>`coalesce(sum(case when exists (
          select 1 from ${menuRecipes}
          inner join ${inventoryItems} on ${inventoryItems.sku} = ${menuRecipes.inventorySku}
          where ${menuRecipes.menuItemId} = ${orderItems.menuItemId}
            and ${menuRecipes.status} = 'active'
            and (${menuRecipes.variantId} = ${orderItems.variantId} or ${menuRecipes.variantId} = 'all')
            and ${inventoryItems.unitCost} > 0
        ) then ${orderItems.lineTotal} else 0 end), 0)::bigint`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.status, "paid"), inOrderRange))
      .groupBy(orderDay),
    db
      .select({ day: wageDay, amount: sql<string>`coalesce(sum(${staffDailyWages.totalCredited}), 0)::bigint` })
      .from(staffDailyWages)
      .where(and(gte(staffDailyWages.date, fromKey), lte(staffDailyWages.date, toKey)))
      .groupBy(wageDay),
    db
      .select({ day: feeDay, amount: sql<string>`coalesce(sum(${feePoolSplits.amount}), 0)::bigint` })
      .from(feePoolSplits)
      .where(and(gte(feePoolSplits.date, fromKey), lte(feePoolSplits.date, toKey)))
      .groupBy(feeDay),
    db
      .select({
        day: expenseDay,
        category: expenses.category,
        amount: sql<string>`coalesce(sum(${expenses.amount}), 0)::bigint`,
      })
      .from(expenses)
      .where(
        and(
          inArray(expenses.status, PNL_EXPENSE_STATUSES),
          gte(expenses.expenseDate, start),
          lt(expenses.expenseDate, end),
        ),
      )
      .groupBy(expenseDay, expenses.category),
    db
      .select({ day: settlementDay, fee: sql<string>`coalesce(sum(${paymentSettlements.feeAmount}), 0)::bigint` })
      .from(paymentSettlements)
      .where(and(gte(paymentSettlements.settlementDate, start), lt(paymentSettlements.settlementDate, end)))
      .groupBy(settlementDay),
    db
      .select({
        day: capitalDay,
        type: capitalTransactions.type,
        amount: sql<string>`coalesce(sum(${capitalTransactions.amount}), 0)::bigint`,
      })
      .from(capitalTransactions)
      .where(and(gte(capitalTransactions.txDate, fromKey), lte(capitalTransactions.txDate, toKey)))
      .groupBy(capitalDay, capitalTransactions.type),
    // Susut stok outlet: selisih opname + pengurangan/kosongkan manual, × harga bahan.
    // qty negatif = barang hilang (rugi), positif opname = selisih lebih.
    db
      .select({
        day: movementDay,
        value: sql<string>`coalesce(sum(-1 * coalesce(${stockMovements.qty}, 0) * coalesce(${inventoryItems.unitCost}, 0)), 0)::float8`,
      })
      .from(stockMovements)
      .leftJoin(inventoryItems, eq(stockMovements.itemSku, inventoryItems.sku))
      .where(
        and(
          inArray(stockMovements.type, SHRINKAGE_MOVEMENT_TYPES),
          gte(stockMovements.createdAt, start),
          lt(stockMovements.createdAt, end),
        ),
      )
      .groupBy(movementDay),
    // Susut gudang WMS: waste + adjustment (nilai HPP batch historis).
    db
      .select({
        day: wmsDay,
        value: sql<string>`coalesce(sum(case
          when ${wmsStockMovement.type} = 'waste' then abs(${wmsStockMovement.valueHpp})
          when ${wmsStockMovement.qty} < 0 then abs(${wmsStockMovement.valueHpp})
          else -abs(${wmsStockMovement.valueHpp}) end), 0)::float8`,
      })
      .from(wmsStockMovement)
      .where(
        and(
          inArray(wmsStockMovement.type, ["waste", "adjustment"]),
          gte(wmsStockMovement.createdAt, start),
          lt(wmsStockMovement.createdAt, end),
        ),
      )
      .groupBy(wmsDay),
  ]);

  const map = new Map<string, DayRaw>();
  const at = (day: string) => {
    let raw = map.get(day);
    if (!raw) {
      raw = emptyRaw(day);
      map.set(day, raw);
    }
    return raw;
  };

  for (const row of salesRows) {
    const raw = at(row.day);
    raw.orderCount = Number(row.count);
    raw.netSales = Number(row.net);
    raw.deliveryFees = Number(row.deliveryFees);
    raw.discount = Number(row.discount);
  }
  for (const row of voidRows) {
    const raw = at(row.day);
    raw.voidCount = Number(row.count);
    raw.voidAmount = Number(row.amount);
  }
  for (const row of refundRows) at(row.day).refund = Number(row.amount);
  for (const row of paymentRows) {
    const raw = at(row.day);
    raw.payments[row.method] = (raw.payments[row.method] ?? 0) + Number(row.amount);
  }
  for (const row of cogsRows) at(row.day).cogs = Math.round(Number(row.cogs));
  for (const row of coverageRows) {
    const raw = at(row.day);
    raw.lineSales = Number(row.lineSales);
    raw.coveredLineSales = Number(row.covered);
  }
  for (const row of wageRows) at(row.day).payrollWages = Number(row.amount);
  for (const row of feeRows) at(row.day).payrollFee = Number(row.amount);
  for (const row of expenseRows) {
    const raw = at(row.day);
    raw.expenses[row.category] = (raw.expenses[row.category] ?? 0) + Number(row.amount);
  }
  for (const row of settlementRows) at(row.day).settlementFees = Number(row.fee);
  for (const row of capitalRows) {
    const raw = at(row.day);
    if (row.type === "withdrawal") raw.capitalOut += Number(row.amount);
    else raw.capitalIn += Number(row.amount);
  }
  for (const row of [...outletShrinkRows, ...wmsShrinkRows]) {
    const value = Math.round(Number(row.value));
    if (value) at(row.day).shrinkage += value;
  }
  return map;
}

// ─── Snapshot harian ────────────────────────────────────────────────────────

/** Hari yang lebih tua dari ini dianggap stabil → dibaca dari snapshot. */
const LIVE_WINDOW_DAYS = 7;

/**
 * Versi rumus engine. Snapshot "auto" dengan versi lama dihitung ulang otomatis;
 * snapshot "locked" (Daily Closing) tidak pernah diubah.
 * v2: HPP aktual = resep + susut gudang (PRD §11).
 */
const ENGINE_VERSION = 3; // v3: ongkir delivery dipisah dari penjualan bersih

type SnapshotRow = typeof financialSnapshots.$inferSelect;

function figureFromSnapshot(row: SnapshotRow): DayFigure {
  const breakdown = (row.breakdown ?? {}) as Record<string, Record<string, number> | number | undefined>;
  const record = (key: string) => (breakdown[key] && typeof breakdown[key] === "object" ? (breakdown[key] as Record<string, number>) : {});
  return {
    date: String(row.date),
    orderCount: row.orderCount,
    grossSales: Number(row.grossSales),
    discount: Number(row.discount),
    refund: Number(row.refund),
    voidCount: row.voidCount,
    voidAmount: Number(row.voidAmount),
    netSales: Number(row.netSales),
    deliveryFees: Number(breakdown.deliveryFees ?? 0),
    cogs: Number(row.cogs),
    // Snapshot versi lama (sebelum v2) belum memisah susut → seluruh HPP = resep.
    cogsRecipe: breakdown.cogsRecipe !== undefined ? Number(breakdown.cogsRecipe) : Number(row.cogs),
    cogsShrinkage: Number(breakdown.cogsShrinkage ?? 0),
    grossProfit: Number(row.grossProfit),
    payroll: Number(row.payroll),
    operatingExpense: Number(row.operatingExpense),
    operatingProfit: Number(row.operatingProfit),
    nonOperatingExpense: Number(row.nonOperatingExpense),
    netProfit: Number(row.netProfit),
    cashIn: Number(row.cashIn),
    cashOut: Number(row.cashOut),
    reserveAllocation: Number(row.reserveAllocation),
    fixedCost: Number(row.fixedCost),
    variableCost: Number(row.variableCost),
    lineSales: Number(breakdown.lineSales ?? 0),
    coveredLineSales: Number(breakdown.coveredLineSales ?? 0),
    costLines: record("costLines"),
    cashOutByGroup: record("cashOutByGroup"),
    channels: record("channels"),
    linkedActual: record("linkedActual"),
    source: row.status === "locked" ? "locked" : "auto",
  };
}

function bp(value: number | null) {
  return value === null ? 0 : Math.round(value * 100);
}

export function snapshotFromFigure(figure: DayFigure) {
  const cm = figure.netSales > 0 ? (figure.netSales - figure.variableCost) / figure.netSales : null;
  const bepTarget = cm && cm > 0 ? Math.round(figure.fixedCost / cm) : null;
  return {
    date: figure.date,
    grossSales: figure.grossSales,
    discount: figure.discount,
    refund: figure.refund,
    voidAmount: figure.voidAmount,
    voidCount: figure.voidCount,
    netSales: figure.netSales,
    orderCount: figure.orderCount,
    cogs: figure.cogs,
    grossProfit: figure.grossProfit,
    grossMarginBp: bp(ratioPct(figure.grossProfit, figure.netSales)),
    payroll: figure.payroll,
    operatingExpense: figure.operatingExpense,
    operatingProfit: figure.operatingProfit,
    nonOperatingExpense: figure.nonOperatingExpense,
    netProfit: figure.netProfit,
    netMarginBp: bp(ratioPct(figure.netProfit, figure.netSales)),
    cashIn: figure.cashIn,
    cashOut: figure.cashOut,
    reserveAllocation: figure.reserveAllocation,
    fixedCost: figure.fixedCost,
    variableCost: figure.variableCost,
    bepTarget,
    bepAchievementBp: bepTarget ? Math.round((figure.netSales / bepTarget) * 10_000) : null,
    hppCoverageBp: bp(ratioPct(figure.coveredLineSales, figure.lineSales)),
    breakdown: {
      costLines: figure.costLines,
      cashOutByGroup: figure.cashOutByGroup,
      channels: figure.channels,
      linkedActual: figure.linkedActual,
      lineSales: figure.lineSales,
      coveredLineSales: figure.coveredLineSales,
      cogsRecipe: figure.cogsRecipe,
      cogsShrinkage: figure.cogsShrinkage,
      deliveryFees: figure.deliveryFees,
      engineVersion: ENGINE_VERSION,
    },
    status: "auto",
    computedAt: new Date(),
    updatedAt: new Date(),
  };
}

async function storeSnapshots(figures: DayFigure[]) {
  if (!figures.length) return;
  const db = getDb();
  for (let index = 0; index < figures.length; index += 100) {
    const chunk = figures.slice(index, index + 100).map(snapshotFromFigure);
    await db
      .insert(financialSnapshots)
      .values(chunk)
      .onConflictDoUpdate({
        target: financialSnapshots.date,
        set: {
          grossSales: sql`excluded.gross_sales`,
          discount: sql`excluded.discount`,
          refund: sql`excluded.refund`,
          voidAmount: sql`excluded.void_amount`,
          voidCount: sql`excluded.void_count`,
          netSales: sql`excluded.net_sales`,
          orderCount: sql`excluded.order_count`,
          cogs: sql`excluded.cogs`,
          grossProfit: sql`excluded.gross_profit`,
          grossMarginBp: sql`excluded.gross_margin_bp`,
          payroll: sql`excluded.payroll`,
          operatingExpense: sql`excluded.operating_expense`,
          operatingProfit: sql`excluded.operating_profit`,
          nonOperatingExpense: sql`excluded.non_operating_expense`,
          netProfit: sql`excluded.net_profit`,
          netMarginBp: sql`excluded.net_margin_bp`,
          cashIn: sql`excluded.cash_in`,
          cashOut: sql`excluded.cash_out`,
          reserveAllocation: sql`excluded.reserve_allocation`,
          fixedCost: sql`excluded.fixed_cost`,
          variableCost: sql`excluded.variable_cost`,
          bepTarget: sql`excluded.bep_target`,
          bepAchievementBp: sql`excluded.bep_achievement_bp`,
          hppCoverageBp: sql`excluded.hpp_coverage_bp`,
          breakdown: sql`excluded.breakdown`,
          computedAt: sql`excluded.computed_at`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: sql`${financialSnapshots.status} <> 'locked'`,
      });
  }
}

/**
 * Angka harian [fromKey, toKey]. Hari > 7 hari lalu dibaca dari snapshot (dan
 * dibuat bila belum ada); 7 hari terakhir + hari ini dihitung live karena
 * transaksi terlambat/backdate masih mungkin. Snapshot `locked` selalu dipakai.
 */
export async function getDayFigures(fromKey: string, toKey: string, config: FinanceConfig, todayKey: string) {
  const db = getDb();
  const liveFrom = addDays(todayKey, -LIVE_WINDOW_DAYS);
  const snapshotRows = await db
    .select()
    .from(financialSnapshots)
    .where(and(gte(financialSnapshots.date, fromKey), lte(financialSnapshots.date, toKey)));
  const usable = new Map<string, DayFigure>();
  for (const row of snapshotRows) {
    const key = String(row.date);
    const version = Number((row.breakdown as { engineVersion?: number } | null)?.engineVersion ?? 1);
    if (row.status === "locked" || (key < liveFrom && version === ENGINE_VERSION)) {
      usable.set(key, figureFromSnapshot(row));
    }
  }

  const days = eachDay(fromKey, toKey);
  const missing = days.filter((day) => !usable.has(day));
  const computed = new Map<string, DayFigure>();
  if (missing.length) {
    const raws = await loadDayRaws(missing[0], missing[missing.length - 1]);
    for (const day of missing) computed.set(day, computeDayFigure(raws.get(day) ?? emptyRaw(day), config));
    // Simpan hari yang sudah lewat; hari ini tetap live.
    await storeSnapshots(missing.filter((day) => day < todayKey).map((day) => computed.get(day)!));
  }

  return days.map((day) => usable.get(day) ?? computed.get(day)!);
}

/** Hapus snapshot otomatis (bukan locked) — dipakai setelah master data berubah. */
export async function invalidateAutoSnapshots() {
  await getDb().delete(financialSnapshots).where(eq(financialSnapshots.status, "auto"));
}

async function loadHourlyNetSales(dayKey: string) {
  const db = getDb();
  const hourExpr = sql<number>`extract(hour from (${orders.createdAt} at time zone 'UTC') + interval '7 hours')::int`;
  const rows = await db
    .select({ hour: hourExpr, net: sql<string>`coalesce(sum(${orders.total} - ${orders.tax} - ${orders.deliveryFee}), 0)::bigint` })
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, jakartaDayStart(dayKey)),
        lt(orders.createdAt, jakartaDayStart(addDays(dayKey, 1))),
      ),
    )
    .groupBy(hourExpr);
  const byHour = new Map(rows.map((row) => [Number(row.hour), Number(row.net)]));
  return Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? 0);
}

async function loadCashVariance(fromKey: string, toKey: string, tolerance: number) {
  const rows = await getDb()
    .select({ discrepancy: cashSessions.discrepancy })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.status, "closed"),
        gte(cashSessions.closedAt, jakartaDayStart(fromKey)),
        lt(cashSessions.closedAt, jakartaDayStart(addDays(toKey, 1))),
      ),
    );
  const flagged = rows.filter((row) => Math.abs(row.discrepancy) > tolerance);
  return {
    sessions: rows.length,
    flagged: flagged.length,
    totalAbs: flagged.reduce((sum, row) => sum + Math.abs(row.discrepancy), 0),
  };
}

// ─── Dashboard CEO ──────────────────────────────────────────────────────────

export type CashStatus = "AMAN" | "PERHATIAN" | "KRITIS" | "BELUM DISET";

export type TrendPoint = {
  key: string;
  label: string;
  revenue: number;
  bep: number | null;
  target: number | null;
  grossProfit: number;
  netProfit: number;
  cogs: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  /** Setoran modal hari/bulan itu (tidak ikut cashIn grafik). */
  capitalIn: number;
  prevNetProfit: number | null;
  prevRevenue: number | null;
};

function min(...keys: string[]) {
  return keys.reduce((a, b) => (a < b ? a : b));
}

function max(...keys: string[]) {
  return keys.reduce((a, b) => (a > b ? a : b));
}

export async function getFinanceControlDashboard(input: {
  period: PeriodKey;
  from?: string | null;
  to?: string | null;
}) {
  const config = await loadFinanceConfig();
  const todayKey = jakartaDateKey();
  const period = resolvePeriod(input.period, todayKey, { from: input.from, to: input.to });
  const month = resolvePeriod("this_month", todayKey);
  const monthDays = daysInMonth(todayKey);
  const singleDay = period.granularity === "hour";
  const chartFrom = singleDay ? addDays(period.toKey, -6) : period.fromKey;

  const loadFrom = min(
    config.businessStartDate,
    config.openingCash.date,
    period.prevFromKey,
    chartFrom,
    addDays(todayKey, -37),
    month.prevFromKey,
  );
  const figures = await getDayFigures(loadFrom, todayKey, config, todayKey);
  const byDate = new Map(figures.map((figure) => [figure.date, figure]));
  const range = (fromKey: string, toKey: string) =>
    fromKey > toKey ? [] : eachDay(fromKey, toKey).map((day) => byDate.get(day)).filter((f): f is DayFigure => Boolean(f));

  const periodFigures = range(period.fromKey, period.toKey);
  const totals = sumFigures(periodFigures);
  const prevTotals = sumFigures(range(period.prevFromKey, period.prevToKey));
  const trailing = sumFigures(range(addDays(todayKey, -29), todayKey));
  const fixedDaily = fixedCostDaily(config);

  const bep = computeBep({ totals, trailing, fixedDaily, monthDays });
  const today = byDate.get(todayKey) ?? null;
  const todayBep = computeBep({ totals: sumFigures(today ? [today] : []), trailing, fixedDaily, monthDays });
  const previous7 = range(addDays(todayKey, -7), addDays(todayKey, -1));
  const monthToDate = sumFigures(range(month.fromKey, todayKey));
  const previousMonthToDate = sumFigures(range(month.prevFromKey, month.prevToKey));

  // Kas: saldo awal + (cash in − cash out) sejak tanggal saldo awal. Saldo awal
  // dianggap SUDAH termasuk modal yang disetor s/d tanggal itu → modal di tanggal
  // saldo awal tidak dihitung lagi (hindari double counting).
  const openingKey = config.openingCash.date;
  const dayCashNet = (day: DayFigure) =>
    day.cashIn - day.cashOut - (day.date === openingKey ? (day.channels.Modal ?? 0) : 0);
  const cashBefore = (key: string) =>
    config.openingCash.amount + range(openingKey, addDays(key, -1)).reduce((sum, day) => sum + dayCashNet(day), 0);
  const periodOpeningCash = cashBefore(max(period.fromKey, openingKey));
  const periodClosingCash = cashBefore(addDays(period.toKey, 1));
  const currentCash = cashBefore(addDays(todayKey, 1));
  const last30 = range(addDays(todayKey, -29), todayKey);
  const avgDailyCashOut = last30.length ? last30.reduce((sum, day) => sum + day.cashOut, 0) / last30.length : 0;
  const burnDaily = Math.max(avgDailyCashOut, fixedDaily);
  const cashRunwayDays = burnDaily > 0 ? Math.max(0, Math.floor(currentCash / burnDaily)) : null;
  const cashStatus: CashStatus = !config.openingCash.isSet
    ? "BELUM DISET"
    : cashRunwayDays === null || cashRunwayDays >= config.thresholds.cashRunwaySafeDays
      ? "AMAN"
      : cashRunwayDays >= config.thresholds.cashRunwayWarnDays
        ? "PERHATIAN"
        : "KRITIS";

  // Capital recovery: akumulasi sejak mulai bisnis sesuai metode pilihan Owner
  // (default laba bersih). Rata-rata = performa aktual 30 hari terakhir.
  const recoveryMethod = config.capitalRecoveryMethod ?? "net_profit";
  const capitalOutByDate = new Map<string, number>();
  for (const tx of config.capital) {
    if (tx.type === "withdrawal") capitalOutByDate.set(tx.date, (capitalOutByDate.get(tx.date) ?? 0) + tx.amount);
  }
  const recoveryOf = (day: DayFigure) => dayRecoveryValue(day, recoveryMethod, capitalOutByDate);
  const sinceStart = range(config.businessStartDate, todayKey);
  const capital = computeCapitalRecovery({
    capital: config.capital,
    cumulativeNetProfit: sinceStart.reduce((sum, day) => sum + recoveryOf(day), 0),
    recentNetProfits: range(max(config.businessStartDate, addDays(todayKey, -29)), todayKey).map(recoveryOf),
    startDate: config.businessStartDate,
    todayKey,
    method: recoveryMethod,
  });
  // Pembeda untuk Owner: kas & aset BUKAN "modal kembali".
  const [inventoryAsset] = await getDb()
    .select({
      value: sql<string>`coalesce(sum(greatest(${inventoryItems.onHand}, 0) * coalesce(${inventoryItems.unitCost}, 0)), 0)::float8`,
    })
    .from(inventoryItems);
  const capitalView = {
    ...capital,
    cashBalance: currentCash,
    cashBalanceIsSet: config.openingCash.isSet,
    inventoryValue: Math.round(Number(inventoryAsset?.value ?? 0)),
  };

  const budgets = computeBudgets({ config, monthToDate, monthDays });
  const payrollRecon = computePayrollRecon({
    config,
    monthToDate,
    monthDays,
    daysElapsed: Number(todayKey.slice(8, 10)),
  });
  const cashVariance = await loadCashVariance(period.fromKey, period.toKey, config.thresholds.cashVarianceTolerance);
  const hppCoveragePct = ratioPct(totals.coveredLineSales, totals.lineSales);
  const knownCategories = new Set(config.categories.map((row) => row.name.toLowerCase()));
  const unclassifiedCategories = (await listExpenseCategoriesSeen()).filter(
    (name) => !knownCategories.has(name.toLowerCase()),
  );

  const health = computeHealth({
    periodLabel: period.label,
    totals,
    bep,
    thresholds: config.thresholds,
    cashVariance,
    cashRunwayDays: config.openingCash.isSet ? cashRunwayDays : null,
    hppCoveragePct,
  });
  const insights = buildInsights({
    periodLabel: period.label,
    isToday: period.key === "today",
    totals,
    bep,
    today,
    previous7,
    budgets,
    payrollRecon,
    thresholds: config.thresholds,
  });
  // Daily closing: hari yang sudah lewat (maks. 7 hari) tapi belum dikunci.
  const closingFrom = max(config.businessStartDate, addDays(todayKey, -7));
  const closingTo = addDays(todayKey, -1);
  const closedRows =
    closingFrom <= closingTo
      ? await getDb()
          .select({ date: financeDailyClosings.date })
          .from(financeDailyClosings)
          .where(
            and(
              gte(financeDailyClosings.date, closingFrom),
              lte(financeDailyClosings.date, closingTo),
              eq(financeDailyClosings.status, "closed"),
            ),
          )
      : [];
  const closedSet = new Set(closedRows.map((row) => String(row.date)));
  const pendingClosingDays = closingFrom <= closingTo ? eachDay(closingFrom, closingTo).filter((day) => !closedSet.has(day)) : [];

  const alerts = buildAlerts({
    today,
    todayBep,
    previous7,
    budgets,
    payrollRecon,
    cashVariance,
    monthToDate,
    previousMonthToDate,
    openingCashSet: config.openingCash.isSet,
    hppCoveragePct,
    unclassifiedCategories,
  });
  if (pendingClosingDays.length) {
    alerts.unshift({
      area: "Closing",
      level: "watch",
      message: `${pendingClosingDays.length} hari belum di-closing (${pendingClosingDays.slice(-3).map(shortDayLabel).join(", ")}).`,
    });
  }

  // Tren: harian (atau bulanan untuk tahun) + perbandingan periode sebelumnya.
  const cm = bep.available ? bep.contributionMarginPct / 100 : null;
  const target = config.revenueTargetDaily;
  let trend: TrendPoint[];
  if (period.granularity === "month") {
    const groups = new Map<string, DayFigure[]>();
    for (const figure of periodFigures) {
      const key = figure.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), figure]);
    }
    const prevGroups = new Map<string, DayFigure[]>();
    for (const figure of range(period.prevFromKey, period.prevToKey)) {
      const key = figure.date.slice(5, 7);
      prevGroups.set(key, [...(prevGroups.get(key) ?? []), figure]);
    }
    trend = Array.from(groups.entries()).map(([key, list]) => {
      const sum = sumFigures(list);
      const prev = prevGroups.get(key.slice(5, 7));
      const prevSum = prev ? sumFigures(prev) : null;
      return {
        key,
        label: monthLabel(`${key}-01`).split(" ")[0].slice(0, 3),
        revenue: sum.netSales,
        bep: cm ? Math.round(sum.fixedCost / cm) : null,
        target: target ? target * list.length : null,
        grossProfit: sum.grossProfit,
        netProfit: sum.netProfit,
        cogs: sum.cogs,
        cashIn: sum.cashIn - (sum.channels.Modal ?? 0),
        cashOut: sum.cashOut,
        netCash: sum.cashIn - (sum.channels.Modal ?? 0) - sum.cashOut,
        capitalIn: sum.channels.Modal ?? 0,
        prevNetProfit: prevSum ? prevSum.netProfit : null,
        prevRevenue: prevSum ? prevSum.netSales : null,
      };
    });
  } else {
    const chartDays = eachDay(chartFrom, period.toKey);
    const prevStart = singleDay ? addDays(chartFrom, -chartDays.length) : period.prevFromKey;
    trend = chartDays.map((day, index) => {
      const figure = byDate.get(day);
      const prev = byDate.get(addDays(prevStart, index));
      return {
        key: day,
        label: shortDayLabel(day),
        revenue: figure?.netSales ?? 0,
        bep: cm && figure ? Math.round(figure.fixedCost / cm) : null,
        target,
        grossProfit: figure?.grossProfit ?? 0,
        netProfit: figure?.netProfit ?? 0,
        cogs: figure?.cogs ?? 0,
        // Grafik cashflow = operasional; setoran modal dipisah agar tidak menenggelamkan penjualan.
        cashIn: (figure?.cashIn ?? 0) - (figure?.channels.Modal ?? 0),
        cashOut: figure?.cashOut ?? 0,
        netCash: (figure?.cashIn ?? 0) - (figure?.channels.Modal ?? 0) - (figure?.cashOut ?? 0),
        capitalIn: figure?.channels.Modal ?? 0,
        prevNetProfit: prev ? prev.netProfit : null,
        prevRevenue: prev ? prev.netSales : null,
      };
    });
  }

  let hourly: Array<{ hour: string; revenue: number; cumulative: number | null; bep: number | null }> | null = null;
  if (singleDay) {
    const perHour = await loadHourlyNetSales(period.toKey);
    const lastHour = period.toKey === todayKey ? new Date(Date.now() + 7 * 3_600_000).getUTCHours() : 23;
    const dayBep = todayBep.available && period.toKey === todayKey ? todayBep.dailyTarget : bep.available ? bep.periodTarget : null;
    let running = 0;
    hourly = perHour.map((value, hour) => {
      running += value;
      return {
        hour: `${String(hour).padStart(2, "0")}:00`,
        revenue: value,
        cumulative: hour <= lastHour ? running : null,
        bep: dayBep,
      };
    });
  }

  const costLines = Object.entries(totals.costLines)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));
  const channels = Object.entries(totals.channels)
    .filter(([name, value]) => name !== "Modal" && value > 0)
    .sort((a, b) => b[1] - a[1]);
  const channelTotal = channels.reduce((sum, [, value]) => sum + value, 0);

  return {
    generatedAt: new Date().toISOString(),
    todayKey,
    period,
    kpis: {
      revenue: { value: totals.netSales, changePct: changePct(totals.netSales, prevTotals.netSales) },
      netProfit: { value: totals.netProfit, changePct: changePct(totals.netProfit, prevTotals.netProfit) },
      cash: { value: periodClosingCash, current: currentCash, status: cashStatus, runwayDays: cashRunwayDays },
      bep: bep.available
        ? { achievementPct: bep.periodAchievementPct, status: bep.periodStatus, target: bep.periodTarget }
        : { achievementPct: null, status: null, target: null },
    },
    pnl: {
      grossSales: totals.grossSales,
      discount: totals.discount,
      refund: totals.refund,
      netSales: totals.netSales,
      deliveryFees: totals.deliveryFees,
      cogs: totals.cogs,
      cogsRecipe: totals.cogsRecipe,
      cogsShrinkage: totals.cogsShrinkage,
      grossProfit: totals.grossProfit,
      grossMarginPct: ratioPct(totals.grossProfit, totals.netSales),
      payroll: totals.payroll,
      operatingExpense: totals.operatingExpense,
      operatingProfit: totals.operatingProfit,
      nonOperatingExpense: totals.nonOperatingExpense,
      netProfit: totals.netProfit,
      netMarginPct: ratioPct(totals.netProfit, totals.netSales),
      reserveAllocation: totals.reserveAllocation,
      voidCount: totals.voidCount,
      voidAmount: totals.voidAmount,
      orderCount: totals.orderCount,
      hppCoveragePct,
      hppRatioPct: ratioPct(totals.cogs, totals.netSales),
    },
    bep: bep as BepResult,
    todayBep: todayBep as BepResult,
    trend,
    hourly,
    expenses: {
      lines: costLines,
      total: costLines.reduce((sum, row) => sum + row.amount, 0),
      budgets,
    },
    cashflow: {
      opening: periodOpeningCash,
      cashIn: totals.cashIn,
      cashOut: totals.cashOut,
      net: totals.cashIn - totals.cashOut,
      // Setoran modal dipisah: cashflow operasional = uang masuk penjualan − pengeluaran.
      capitalIn: totals.channels.Modal ?? 0,
      operatingNet: totals.cashIn - (totals.channels.Modal ?? 0) - totals.cashOut,
      closing: periodClosingCash,
      outByGroup: Object.entries(totals.cashOutByGroup)
        .sort((a, b) => b[1] - a[1])
        .map(([group, amount]) => ({ group, amount })),
      openingCashSet: config.openingCash.isSet,
    },
    channels: channels.map(([name, amount]) => ({
      name,
      amount,
      share: channelTotal ? Math.round((amount / channelTotal) * 1000) / 10 : 0,
    })),
    capital: capitalView,
    payrollRecon,
    health,
    insights,
    alerts,
    closing: {
      pendingPastDays: pendingClosingDays,
      lockedDaysInPeriod: periodFigures.filter((figure) => figure.source === "locked").length,
    },
    dataQuality: {
      openingCashSet: config.openingCash.isSet,
      hppCoveragePct,
      unclassifiedCategories,
      payrollBudgetDaily: payrollBudgetDaily(config),
      fixedCostDaily: fixedDaily,
    },
  };
}

export type FinanceControlDashboard = Awaited<ReturnType<typeof getFinanceControlDashboard>>;

async function listExpenseCategoriesSeen() {
  const rows = await getDb()
    .selectDistinct({ category: expenses.category })
    .from(expenses)
    .where(inArray(expenses.status, PNL_EXPENSE_STATUSES));
  return rows.map((row) => row.category);
}

// ─── Ringkasan untuk modul lain (tanpa angka karangan) ─────────────────────

/** Angka P&L hari ini & bulan berjalan dari engine, untuk getFinanceOverview. */
export async function getFinanceEngineSummary() {
  const config = await loadFinanceConfig();
  const todayKey = jakartaDateKey();
  const monthFrom = monthStartKey(todayKey);
  const figures = await getDayFigures(min(monthFrom, addDays(todayKey, -29)), todayKey, config, todayKey);
  const byDate = new Map(figures.map((figure) => [figure.date, figure]));
  const today = sumFigures(byDate.get(todayKey) ? [byDate.get(todayKey)!] : []);
  const monthFigures = figures.filter((figure) => figure.date >= monthFrom);
  const month = sumFigures(monthFigures);
  return { todayKey, today, month, monthFigures, config };
}

// ─── Settings (Owner) ───────────────────────────────────────────────────────

export async function getFinanceSettingsBundle() {
  const config = await loadFinanceConfig();
  const expenseApprovalThreshold = await getExpenseApprovalThreshold();
  const expenseOwnerApprovalThreshold = await getExpenseOwnerApprovalThreshold();
  const db = getDb();
  const capitalRows = await db.select().from(capitalTransactions).orderBy(asc(capitalTransactions.txDate));
  const seen = await listExpenseCategoriesSeen();
  const known = new Set(config.categories.map((row) => row.name.toLowerCase()));
  return {
    settings: {
      businessStartDate: config.businessStartDate,
      openingCash: config.openingCash,
      revenueTargetDaily: config.revenueTargetDaily,
      thresholds: config.thresholds,
      expenseApprovalThreshold,
      expenseOwnerApprovalThreshold,
      capitalRecoveryMethod: config.capitalRecoveryMethod ?? "net_profit",
      variableBudget: config.variableBudget ?? DEFAULT_VARIABLE_BUDGET,
    },
    capitalRecoveryMethods: CAPITAL_RECOVERY_METHODS,
    costItems: config.costItems,
    payrollPositions: config.payrollPositions,
    payrollMasterMonthly: payrollMasterMonthly(config),
    categories: config.categories,
    unclassifiedCategories: seen.filter((name) => !known.has(name.toLowerCase())),
    capital: capitalRows.map((row) => ({
      id: row.id,
      date: String(row.txDate),
      type: row.type,
      amount: Number(row.amount),
      description: row.description,
    })),
  };
}

export type FinanceSettingsBundle = Awaited<ReturnType<typeof getFinanceSettingsBundle>>;

export type FinanceSettingsUpdate = {
  settings?: Partial<Omit<SettingsShape, "thresholds">> & { thresholds?: Partial<FinanceThresholds> };
  costItems?: FinanceCostItem[];
  payrollPositions?: FinancePayrollPosition[];
  categories?: FinanceExpenseCategory[];
  capital?: Array<{ id?: string; date: string; type: "injection" | "withdrawal"; amount: number; description: string }>;
  reason: string;
};

export async function updateFinanceSettings(input: FinanceSettingsUpdate, garage: GarageSession) {
  const before = await getFinanceSettingsBundle();
  const db = getDb();
  const now = new Date();
  const changed: string[] = [];

  await db.transaction(async (tx) => {
    if (input.settings) {
      const merged: SettingsShape = {
        ...before.settings,
        ...input.settings,
        openingCash: { ...before.settings.openingCash, ...(input.settings.openingCash ?? {}) },
        thresholds: { ...before.settings.thresholds, ...(input.settings.thresholds ?? {}) },
        capitalRecoveryMethod: input.settings.capitalRecoveryMethod ?? before.settings.capitalRecoveryMethod,
        variableBudget: { ...before.settings.variableBudget, ...(input.settings.variableBudget ?? {}) },
      };
      for (const [key, raw] of Object.entries(merged)) {
        if (JSON.stringify(raw) === JSON.stringify(before.settings[key as keyof SettingsShape])) continue;
        const value = raw ?? 0;
        changed.push(key);
        await tx
          .insert(financeSettings)
          .values({ key, value, updatedBy: garage.user.id, updatedAt: now })
          .onConflictDoUpdate({
            target: financeSettings.key,
            set: { value, updatedBy: garage.user.id, updatedAt: now },
          });
      }
    }
    if (input.costItems) {
      changed.push("costItems");
      await tx.delete(financeCostItems);
      if (input.costItems.length) {
        await tx.insert(financeCostItems).values(
          input.costItems.map((item, index) => ({ ...item, code: item.code.toUpperCase(), sortOrder: index + 1, updatedAt: now })),
        );
      }
    }
    if (input.payrollPositions) {
      changed.push("payrollPositions");
      await tx.delete(financePayrollPositions);
      if (input.payrollPositions.length) {
        await tx
          .insert(financePayrollPositions)
          .values(input.payrollPositions.map((row, index) => ({ ...row, sortOrder: index + 1, updatedAt: now })));
      }
    }
    if (input.categories) {
      changed.push("categories");
      await tx.delete(financeExpenseCategories);
      if (input.categories.length) {
        await tx
          .insert(financeExpenseCategories)
          .values(input.categories.map((row) => ({ ...row, updatedAt: now })));
      }
    }
    if (input.capital) {
      changed.push("capital");
      await tx.delete(capitalTransactions);
      if (input.capital.length) {
        await tx.insert(capitalTransactions).values(
          input.capital.map((row) => ({
            txDate: row.date,
            type: row.type,
            amount: row.amount,
            description: row.description,
            createdBy: garage.user.id,
          })),
        );
      }
    }

    if (changed.length) {
      // Snapshot otomatis dihitung ulang dengan master data baru; locked tetap.
      await tx.delete(financialSnapshots).where(eq(financialSnapshots.status, "auto"));
      await tx.insert(auditLogs).values({
        time: new Intl.DateTimeFormat("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Jakarta",
        }).format(now),
        actor: `${garage.user.name} / ${garage.profile.role}`,
        action: "Finance master data diubah",
        object: changed.join(", "),
        device: garage.profile.deviceLabel,
        status: "recorded",
        metadata: {
          module: "finance-control",
          reason: input.reason,
          changed,
          oldValue: pick(before, changed),
          newValue: pick(
            {
              settings: input.settings,
              costItems: input.costItems,
              payrollPositions: input.payrollPositions,
              categories: input.categories,
              capital: input.capital,
            },
            changed,
          ),
        },
      });
    }
  });

  return { changed, bundle: await getFinanceSettingsBundle() };
}

function pick(source: Record<string, unknown>, changed: string[]) {
  const settingsKeys = [
    "businessStartDate",
    "openingCash",
    "revenueTargetDaily",
    "thresholds",
    "expenseApprovalThreshold",
    "expenseOwnerApprovalThreshold",
    "capitalRecoveryMethod",
    "variableBudget",
  ];
  const out: Record<string, unknown> = {};
  for (const key of changed) {
    if (settingsKeys.includes(key)) {
      const settings = (source.settings ?? {}) as Record<string, unknown>;
      out[key] = settings[key];
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

export async function rebuildFinanceSnapshots() {
  await invalidateAutoSnapshots();
  const config = await loadFinanceConfig();
  const todayKey = jakartaDateKey();
  const figures = await getDayFigures(min(config.businessStartDate, addDays(todayKey, -37)), todayKey, config, todayKey);
  return { days: figures.length };
}
