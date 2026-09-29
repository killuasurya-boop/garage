// =============================================================================
// GARAGE FINANCIAL CONTROL SYSTEM (PRD V2.0) — master data + snapshot harian.
// Dipisah dari schema.ts agar tidak bentrok dengan modul lain; di-export ulang
// dari schema.ts. Semua nominal Rupiah = integer/bigint (tanpa floating point).
// Rasio disimpan sebagai basis point (1% = 100 bp).
// =============================================================================
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Key-value: tanggal mulai bisnis, saldo kas awal, target omzet, ambang health.
export const financeSettings = pgTable("finance_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().$type<unknown>(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Operating cost master (PRD §7): biaya harian standar.
// treatment: accrue (diakru harian ke P&L) | budget_only (hanya budget, P&L dari
// transaksi aktual) | reserve (alokasi cadangan, bukan expense — mis. Save Money).
// costClass: fixed | variable | semi_variable | reserve.
export const financeCostItems = pgTable(
  "finance_cost_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    dailyAmount: integer("daily_amount").notNull().default(0),
    costClass: text("cost_class").notNull().default("fixed"),
    treatment: text("treatment").notNull().default("accrue"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUnique: uniqueIndex("finance_cost_items_code_uidx").on(t.code),
  }),
);

// Payroll master / budget (PRD §6). Payroll aktual tetap dari Payroll V2.
export const financePayrollPositions = pgTable("finance_payroll_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  position: text("position").notNull(),
  monthlySalary: integer("monthly_salary").notNull().default(0),
  headcount: integer("headcount").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Klasifikasi kategori expense (PRD §12, dapat diubah di Settings).
// groupKey: opex | cogs_purchase | payroll | payroll_payout | non_operating | reserve | non_pnl
// costItemCode terisi = biaya sudah diakru lewat cost item → expense aktualnya
// hanya dihitung di cashflow, tidak dihitung dua kali di P&L.
export const financeExpenseCategories = pgTable("finance_expense_categories", {
  name: text("name").primaryKey(),
  groupKey: text("group_key").notNull().default("opex"),
  costClass: text("cost_class").notNull().default("variable"),
  costItemCode: text("cost_item_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Modal (PRD §5): CAPITAL INJECTION bukan revenue.
// type: injection | withdrawal
export const capitalTransactions = pgTable(
  "capital_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    txDate: date("tx_date").notNull(),
    type: text("type").notNull().default("injection"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    description: text("description").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index("capital_transactions_date_idx").on(t.txDate),
  }),
);

// Daily Financial Snapshot (PRD §15 & §49). status: auto | locked.
export const financialSnapshots = pgTable(
  "financial_snapshots",
  {
    date: date("date").primaryKey(),
    grossSales: bigint("gross_sales", { mode: "number" }).notNull().default(0),
    discount: bigint("discount", { mode: "number" }).notNull().default(0),
    refund: bigint("refund", { mode: "number" }).notNull().default(0),
    voidAmount: bigint("void_amount", { mode: "number" }).notNull().default(0),
    voidCount: integer("void_count").notNull().default(0),
    netSales: bigint("net_sales", { mode: "number" }).notNull().default(0),
    orderCount: integer("order_count").notNull().default(0),
    cogs: bigint("cogs", { mode: "number" }).notNull().default(0),
    grossProfit: bigint("gross_profit", { mode: "number" }).notNull().default(0),
    grossMarginBp: integer("gross_margin_bp").notNull().default(0),
    payroll: bigint("payroll", { mode: "number" }).notNull().default(0),
    operatingExpense: bigint("operating_expense", { mode: "number" }).notNull().default(0),
    operatingProfit: bigint("operating_profit", { mode: "number" }).notNull().default(0),
    nonOperatingExpense: bigint("non_operating_expense", { mode: "number" }).notNull().default(0),
    netProfit: bigint("net_profit", { mode: "number" }).notNull().default(0),
    netMarginBp: integer("net_margin_bp").notNull().default(0),
    cashIn: bigint("cash_in", { mode: "number" }).notNull().default(0),
    cashOut: bigint("cash_out", { mode: "number" }).notNull().default(0),
    closingCash: bigint("closing_cash", { mode: "number" }),
    reserveAllocation: bigint("reserve_allocation", { mode: "number" }).notNull().default(0),
    fixedCost: bigint("fixed_cost", { mode: "number" }).notNull().default(0),
    variableCost: bigint("variable_cost", { mode: "number" }).notNull().default(0),
    bepTarget: bigint("bep_target", { mode: "number" }),
    bepAchievementBp: integer("bep_achievement_bp"),
    capitalRecovered: bigint("capital_recovered", { mode: "number" }),
    capitalRemaining: bigint("capital_remaining", { mode: "number" }),
    hppCoverageBp: integer("hpp_coverage_bp").notNull().default(0),
    // Rincian untuk grafik: expense per kategori, channel pembayaran, dsb.
    breakdown: jsonb("breakdown").notNull().$type<Record<string, unknown>>().default({}),
    status: text("status").notNull().default("auto"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("financial_snapshots_status_idx").on(t.status),
  }),
);

// Daily Closing (PRD §16, §42). status: closed | reopened.
// Saat closed, snapshot tanggal itu berstatus "locked" (angka dibekukan).
export const financeDailyClosings = pgTable("finance_daily_closings", {
  date: date("date").primaryKey(),
  status: text("status").notNull().default("closed"),
  checklist: jsonb("checklist").notNull().$type<unknown[]>().default([]),
  figures: jsonb("figures").notNull().$type<Record<string, unknown>>().default({}),
  notes: text("notes"),
  closedBy: text("closed_by"),
  closedByName: text("closed_by_name"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reopenedBy: text("reopened_by"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenReason: text("reopen_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Skenario What-If tersimpan (PRD §38). Tidak pernah mengubah transaksi aktual.
export const financeScenarios = pgTable(
  "finance_scenarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    params: jsonb("params").notNull().$type<Record<string, unknown>>(),
    result: jsonb("result").notNull().$type<Record<string, unknown>>(),
    createdBy: text("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("finance_scenarios_created_idx").on(t.createdAt),
  }),
);

// Monthly Closing (PRD §17, §43). month = YYYY-MM. status: closed | reopened.
export const financeMonthlyClosings = pgTable("finance_monthly_closings", {
  month: text("month").primaryKey(),
  status: text("status").notNull().default("closed"),
  checklist: jsonb("checklist").notNull().$type<unknown[]>().default([]),
  report: jsonb("report").notNull().$type<Record<string, unknown>>().default({}),
  notes: text("notes"),
  closedBy: text("closed_by"),
  closedByName: text("closed_by_name"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  reopenedBy: text("reopened_by"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenReason: text("reopen_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
