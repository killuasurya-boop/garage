import ExcelJS from "exceljs";
import { and, desc, eq, gte, lt } from "drizzle-orm";

import { getDb } from "@/db";
import {
  aiActionDrafts,
  aiAgentConfigs,
  aiAgentEvents,
  aiAgentRuns,
  approvals,
  cashSessions,
  customers,
  expenses,
  inventoryItems,
  kitchenTickets,
  paymentSettlements,
  orderItems,
  orders,
  payments,
  stockMovements,
  supplierInvoices,
  suppliers,
} from "@/db/schema";

export const garageAiReportMimeType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type GarageAiReportPeriod = "daily" | "monthly" | "yearly";

export type GarageAiReportInput = {
  period?: GarageAiReportPeriod;
  date?: string;
  days?: number;
};

export type GarageAiReportBuildResult = {
  buffer: Buffer;
  fileName: string;
  generatedAt: string;
  days: number;
  period: GarageAiReportPeriod;
  date: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  rowCounts: {
    configs: number;
    runs: number;
    drafts: number;
    events: number;
    orders: number;
    orderItems: number;
    payments: number;
    cashSessions: number;
    expenses: number;
    paymentSettlements: number;
    supplierInvoices: number;
    inventory: number;
    stockMovements: number;
    kitchenTickets: number;
    approvals: number;
    customers: number;
  };
};

type PeriodRange = {
  start: Date;
  end: Date;
  generatedAt: Date;
  period: GarageAiReportPeriod;
  date: string;
  days: number;
  label: string;
  fileDate: string;
  legacyDaysMode: boolean;
};

type SectionColumn = {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
};

type SectionRow = Record<string, string | number | boolean | Date | null>;

const jakartaTimezone = "Asia/Jakarta";
const jakartaOffset = "+07:00";
const dayMs = 24 * 60 * 60 * 1000;
const idrFormat = '"Rp" #,##0;[Red]-"Rp" #,##0';
const numberFormat = "#,##0";
const decimalFormat = "#,##0.00";
const percentFormat = "0.0%";

function safeJson(value: unknown) {
  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clampDays(days: number | undefined) {
  if (!Number.isFinite(days)) {
    return 30;
  }

  return Math.min(Math.max(Math.trunc(days ?? 30), 1), 365);
}

function getJakartaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: jakartaTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

function getJakartaDateKey(date = new Date()) {
  const parts = getJakartaParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getJakartaMonthKey(date = new Date()) {
  const parts = getJakartaParts(date);

  return `${parts.year}-${parts.month}`;
}

function getJakartaYearKey(date = new Date()) {
  return getJakartaParts(date).year;
}

function startOfJakartaDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00${jakartaOffset}`);
}

function startOfJakartaMonth(monthKey: string) {
  return new Date(`${monthKey}-01T00:00:00${jakartaOffset}`);
}

function startOfJakartaYear(yearKey: string) {
  return new Date(`${yearKey}-01-01T00:00:00${jakartaOffset}`);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function normalizeReportInput(input: GarageAiReportInput = {}): PeriodRange {
  const generatedAt = new Date();

  if (!input.period && input.days) {
    const days = clampDays(input.days);
    const start = new Date(generatedAt.getTime() - days * dayMs);

    return {
      start,
      end: generatedAt,
      generatedAt,
      period: "daily",
      date: getJakartaDateKey(generatedAt),
      days,
      label: `${days} hari terakhir`,
      fileDate: `last-${days}-days`,
      legacyDaysMode: true,
    };
  }

  const period = input.period ?? "daily";

  if (period === "yearly") {
    const date = /^\d{4}$/.test(input.date ?? "")
      ? input.date!
      : getJakartaYearKey(generatedAt);
    const start = startOfJakartaYear(date);

    return {
      start,
      end: addYears(start, 1),
      generatedAt,
      period,
      date,
      days: 365,
      label: `Tahunan ${date}`,
      fileDate: date,
      legacyDaysMode: false,
    };
  }

  if (period === "monthly") {
    const normalizedDate = input.date?.slice(0, 7);
    const date = /^\d{4}-\d{2}$/.test(normalizedDate ?? "")
      ? normalizedDate!
      : getJakartaMonthKey(generatedAt);
    const start = startOfJakartaMonth(date);

    return {
      start,
      end: addMonths(start, 1),
      generatedAt,
      period,
      date,
      days: Math.ceil((addMonths(start, 1).getTime() - start.getTime()) / dayMs),
      label: `Bulanan ${date}`,
      fileDate: date,
      legacyDaysMode: false,
    };
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")
    ? input.date!
    : getJakartaDateKey(generatedAt);
  const start = startOfJakartaDay(date);

  return {
    start,
    end: new Date(start.getTime() + dayMs),
    generatedAt,
    period: "daily",
    date,
    days: 1,
    label: `Harian ${date}`,
    fileDate: date,
    legacyDaysMode: false,
  };
}

function formatDateForCell(value: Date | string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: jakartaTimezone,
  });
}

function formatDateBucket(date: Date, period: GarageAiReportPeriod) {
  const parts = getJakartaParts(date);

  if (period === "yearly") {
    return `${parts.year}-${parts.month}`;
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function sumBy<T>(rows: T[], selector: (row: T) => number | null | undefined) {
  return rows.reduce((total, row) => total + Number(selector(row) ?? 0), 0);
}

function average(values: Array<number | null | undefined>) {
  const safeValues = values
    .map((value) => Number(value ?? 0))
    .filter((value) => Number.isFinite(value));

  if (!safeValues.length) {
    return 0;
  }

  return safeValues.reduce((total, value) => total + value, 0) / safeValues.length;
}

function percent(part: number, total: number) {
  if (!total) {
    return 0;
  }

  return part / total;
}

function groupRows<T>(rows: T[], getKey: (row: T) => string) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = getKey(row) || "-";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}

function styleTitleCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111116" },
  };
  cell.alignment = { vertical: "middle" };
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF202027" },
  };
  row.alignment = { vertical: "middle", wrapText: true };
}

function statusFill(value: unknown) {
  const text = String(value ?? "").toLowerCase();

  if (
    text.includes("critical") ||
    text.includes("high") ||
    text.includes("error") ||
    text.includes("failed") ||
    text.includes("gagal") ||
    text.includes("rejected") ||
    text.includes("void") ||
    text.includes("refund")
  ) {
    return {
      bg: "FFFDE2E4",
      fg: "FFB91C1C",
    };
  }

  if (
    text.includes("pending") ||
    text.includes("low") ||
    text.includes("limited") ||
    text.includes("watch") ||
    text.includes("draft") ||
    text.includes("queue") ||
    text.includes("cooking") ||
    text.includes("medium")
  ) {
    return {
      bg: "FFFFF7D6",
      fg: "FF92400E",
    };
  }

  if (
    text.includes("approved") ||
    text.includes("ready") ||
    text.includes("captured") ||
    text.includes("completed") ||
    text.includes("paid") ||
    text.includes("low") === false
  ) {
    return {
      bg: "FFE7F7ED",
      fg: "FF166534",
    };
  }

  return null;
}

function shouldColorStatus(column: SectionColumn) {
  const key = column.key.toLowerCase();
  const header = column.header.toLowerCase();

  return (
    key.includes("status") ||
    key.includes("risk") ||
    key.includes("priority") ||
    key.includes("approval") ||
    header.includes("status") ||
    header.includes("risk") ||
    header.includes("prioritas")
  );
}

function applyBaseSheetStyle(sheet: ExcelJS.Worksheet) {
  sheet.properties.defaultRowHeight = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });
}

function addSection(
  sheet: ExcelJS.Worksheet,
  title: string,
  columns: SectionColumn[],
  rows: SectionRow[],
  startRow: number,
) {
  const titleRow = sheet.getRow(startRow);
  sheet.mergeCells(startRow, 1, startRow, Math.max(columns.length, 4));
  titleRow.getCell(1).value = title;
  styleTitleCell(titleRow.getCell(1));
  titleRow.height = 22;

  const headerRowNumber = startRow + 1;
  const headerRow = sheet.getRow(headerRowNumber);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    sheet.getColumn(index + 1).width = Math.max(
      sheet.getColumn(index + 1).width ?? 12,
      column.width ?? 16,
    );
  });
  styleHeaderRow(headerRow);

  if (!rows.length) {
    const emptyRow = sheet.getRow(headerRowNumber + 1);
    emptyRow.getCell(1).value = "Tidak ada data untuk periode ini.";
    emptyRow.font = { italic: true, color: { argb: "FF6B7280" } };
    return headerRowNumber + 4;
  }

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(headerRowNumber + 1 + rowIndex);
    columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      cell.value = row[column.key] ?? "";
      if (column.numFmt) {
        cell.numFmt = column.numFmt;
      }

      if (shouldColorStatus(column)) {
        const color = statusFill(row[column.key]);
        if (color) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: color.bg },
          };
          cell.font = { bold: true, color: { argb: color.fg } };
        }
      }
    });
  });

  return headerRowNumber + rows.length + 3;
}

function addSimpleSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  columns: SectionColumn[],
  rows: SectionRow[],
) {
  const sheet = workbook.addWorksheet(title);
  addSection(sheet, title, columns, rows, 1);
  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: Math.max(rows.length + 2, 2), column: columns.length },
  };
  applyBaseSheetStyle(sheet);
  return sheet;
}

function setKpiCell(cell: ExcelJS.Cell, fill: string) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fill },
  };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

export async function buildGarageAiAgentReport(input: GarageAiReportInput | number = {}) {
  const reportInput = typeof input === "number" ? { days: input } : input;
  const range = normalizeReportInput(reportInput);
  const db = getDb();

  const [
    configs,
    runs,
    drafts,
    events,
    orderRows,
    paymentRows,
    cashRows,
    expenseRows,
    settlementRows,
    supplierInvoiceRows,
    inventoryRows,
    stockRows,
    kitchenRows,
    approvalRows,
    customerRows,
  ] = await Promise.all([
    db.select().from(aiAgentConfigs).orderBy(aiAgentConfigs.sortOrder),
    db
      .select()
      .from(aiAgentRuns)
      .where(and(gte(aiAgentRuns.createdAt, range.start), lt(aiAgentRuns.createdAt, range.end)))
      .orderBy(desc(aiAgentRuns.createdAt))
      .limit(3000),
    db
      .select()
      .from(aiActionDrafts)
      .where(and(gte(aiActionDrafts.createdAt, range.start), lt(aiActionDrafts.createdAt, range.end)))
      .orderBy(desc(aiActionDrafts.createdAt))
      .limit(3000),
    db
      .select()
      .from(aiAgentEvents)
      .where(and(gte(aiAgentEvents.createdAt, range.start), lt(aiAgentEvents.createdAt, range.end)))
      .orderBy(desc(aiAgentEvents.createdAt))
      .limit(5000),
    db
      .select()
      .from(orders)
      .where(and(gte(orders.createdAt, range.start), lt(orders.createdAt, range.end)))
      .orderBy(desc(orders.createdAt))
      .limit(5000),
    db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        method: payments.method,
        amount: payments.amount,
        status: payments.status,
        createdAt: payments.createdAt,
        orderNo: orders.orderNo,
        channel: orders.channel,
      })
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .where(and(gte(payments.createdAt, range.start), lt(payments.createdAt, range.end)))
      .orderBy(desc(payments.createdAt))
      .limit(5000),
    db
      .select()
      .from(cashSessions)
      .where(and(gte(cashSessions.openedAt, range.start), lt(cashSessions.openedAt, range.end)))
      .orderBy(desc(cashSessions.openedAt))
      .limit(1000),
    db
      .select()
      .from(expenses)
      .where(and(gte(expenses.expenseDate, range.start), lt(expenses.expenseDate, range.end)))
      .orderBy(desc(expenses.expenseDate))
      .limit(3000),
    db
      .select()
      .from(paymentSettlements)
      .where(
        and(
          gte(paymentSettlements.settlementDate, range.start),
          lt(paymentSettlements.settlementDate, range.end),
        ),
      )
      .orderBy(desc(paymentSettlements.settlementDate))
      .limit(3000),
    db
      .select({
        invoiceNo: supplierInvoices.invoiceNo,
        supplierName: suppliers.name,
        category: supplierInvoices.category,
        description: supplierInvoices.description,
        amount: supplierInvoices.amount,
        paidAmount: supplierInvoices.paidAmount,
        status: supplierInvoices.status,
        dueDate: supplierInvoices.dueDate,
        issuedAt: supplierInvoices.issuedAt,
        paidAt: supplierInvoices.paidAt,
        paymentRef: supplierInvoices.paymentRef,
      })
      .from(supplierInvoices)
      .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(gte(supplierInvoices.issuedAt, range.start), lt(supplierInvoices.issuedAt, range.end)))
      .orderBy(desc(supplierInvoices.issuedAt))
      .limit(3000),
    db.select().from(inventoryItems).orderBy(inventoryItems.category, inventoryItems.sku),
    db
      .select()
      .from(stockMovements)
      .where(and(gte(stockMovements.createdAt, range.start), lt(stockMovements.createdAt, range.end)))
      .orderBy(desc(stockMovements.createdAt))
      .limit(3000),
    db
      .select()
      .from(kitchenTickets)
      .where(and(gte(kitchenTickets.createdAt, range.start), lt(kitchenTickets.createdAt, range.end)))
      .orderBy(desc(kitchenTickets.createdAt))
      .limit(3000),
    db
      .select()
      .from(approvals)
      .where(and(gte(approvals.createdAt, range.start), lt(approvals.createdAt, range.end)))
      .orderBy(desc(approvals.createdAt))
      .limit(3000),
    db.select().from(customers).orderBy(desc(customers.visits), customers.name).limit(1000),
  ]);

  const itemRows = await db
    .select({
      orderNo: orders.orderNo,
      orderCreatedAt: orders.createdAt,
      channel: orders.channel,
      status: orders.status,
      itemName: orderItems.itemName,
      variantLabel: orderItems.variantLabel,
      unitPrice: orderItems.unitPrice,
      qty: orderItems.qty,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(gte(orders.createdAt, range.start), lt(orders.createdAt, range.end)))
    .orderBy(desc(orders.createdAt))
    .limit(10000);

  const capturedPayments = paymentRows.filter((payment) => payment.status === "captured");
  const totalOrders = orderRows.length;
  const subtotal = sumBy(orderRows, (order) => order.subtotal);
  const netSales = sumBy(orderRows, (order) => order.total);
  const capturedAmount = sumBy(capturedPayments, (payment) => payment.amount);
  const averageTicket = totalOrders ? netSales / totalOrders : 0;
  const cashDiscrepancy = sumBy(cashRows, (session) => session.discrepancy);
  const lowStockRows = inventoryRows.filter(
    (item) =>
      item.status.toLowerCase().includes("low") ||
      item.onHand <= item.min ||
      item.status.toLowerCase().includes("critical"),
  );
  const pendingApprovals = approvalRows.filter((approval) => approval.status === "pending");
  const pendingDrafts = drafts.filter((draft) => draft.approvalStatus === "pending");
  const errorRuns = runs.filter((run) => run.status === "error");
  const fallbackRuns = runs.filter((run) => run.fallbackUsed);

  const salesTrendRows = Array.from(
    groupRows(orderRows, (order) => formatDateBucket(order.createdAt, range.period)),
  )
    .map(([bucket, rows]) => ({
      bucket,
      orders: rows.length,
      subtotal: sumBy(rows, (order) => order.subtotal),
      discount: sumBy(rows, (order) => order.discount),
      service: sumBy(rows, (order) => order.service),
      tax: sumBy(rows, (order) => order.tax),
      netSales: sumBy(rows, (order) => order.total),
      averageTicket: rows.length ? sumBy(rows, (order) => order.total) / rows.length : 0,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  const topItemRows = Array.from(
    groupRows(itemRows, (item) => `${item.itemName} - ${item.variantLabel}`),
  )
    .map(([item, rows]) => ({
      item,
      qty: sumBy(rows, (row) => row.qty),
      sales: sumBy(rows, (row) => row.lineTotal),
      orders: new Set(rows.map((row) => row.orderNo)).size,
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 25);

  const paymentBreakdownRows = Array.from(groupRows(capturedPayments, (row) => row.method))
    .map(([method, rows]) => ({
      method,
      amount: sumBy(rows, (row) => row.amount),
      transactions: rows.length,
      share: percent(sumBy(rows, (row) => row.amount), capturedAmount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const expenseSummaryRows = Array.from(groupRows(expenseRows, (row) => row.category))
    .map(([category, rows]) => ({
      category,
      amount: sumBy(rows, (row) => row.amount),
      transactions: rows.length,
      paid: sumBy(
        rows.filter((row) => row.status === "paid"),
        (row) => row.amount,
      ),
      status: rows.some((row) => row.status !== "paid") ? "open" : "paid",
    }))
    .sort((a, b) => b.amount - a.amount);
  const cogsExpense = expenseSummaryRows.find((row) => row.category === "COGS")?.amount ?? 0;
  const payrollExpense =
    expenseSummaryRows.find((row) => row.category === "Payroll")?.amount ?? 0;
  const operationalExpense =
    expenseSummaryRows.find((row) => row.category === "Operasional")?.amount ?? 0;
  const marketingExpense =
    expenseSummaryRows.find((row) => row.category === "Marketing")?.amount ?? 0;
  const otherExpense = expenseSummaryRows
    .filter((row) => !["COGS", "Payroll", "Operasional", "Marketing"].includes(row.category))
    .reduce((sum, row) => sum + row.amount, 0);
  const reportCogs = cogsExpense || Math.round(netSales * 0.382);
  const reportGrossProfit = netSales - reportCogs;
  const reportNetProfit =
    reportGrossProfit - payrollExpense - operationalExpense - marketingExpense - otherExpense;
  const settlementSummaryRows = Array.from(groupRows(settlementRows, (row) => row.method))
    .map(([method, rows]) => ({
      method,
      expected: sumBy(rows, (row) => row.expectedAmount),
      settled: sumBy(rows, (row) => row.settledAmount),
      fee: sumBy(rows, (row) => row.feeAmount),
      gap: sumBy(rows, (row) => row.settledAmount - row.expectedAmount),
      status: rows.some((row) => row.status === "mismatch")
        ? "mismatch"
        : rows.some((row) => row.status !== "settled")
          ? "pending"
          : "settled",
    }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const supplierSummaryRows = Array.from(
    groupRows(supplierInvoiceRows, (row) => row.supplierName ?? "Supplier"),
  )
    .map(([supplierName, rows]) => ({
      supplierName,
      invoices: rows.length,
      amount: sumBy(rows, (row) => row.amount),
      paid: sumBy(rows, (row) => row.paidAmount),
      remaining: sumBy(rows, (row) => Math.max(0, row.amount - row.paidAmount)),
      status: rows.some((row) => row.status === "overdue")
        ? "overdue"
        : rows.some((row) => row.status !== "paid")
          ? "open"
          : "paid",
    }))
    .sort((a, b) => b.remaining - a.remaining);

  const channelRows = Array.from(groupRows(orderRows, (order) => order.channel))
    .map(([channel, rows]) => ({
      channel,
      orders: rows.length,
      netSales: sumBy(rows, (order) => order.total),
      share: percent(sumBy(rows, (order) => order.total), netSales),
    }))
    .sort((a, b) => b.netSales - a.netSales);

  const kitchenByStationRows = Array.from(groupRows(kitchenRows, (ticket) => ticket.station))
    .map(([station, rows]) => ({
      station,
      tickets: rows.length,
      averageElapsed: average(rows.map((row) => row.elapsed)),
      delayed: rows.filter((row) => row.elapsed >= 15 || row.priority === "high").length,
      queue: rows.filter((row) => row.status === "queue").length,
      cooking: rows.filter((row) => row.status === "cooking").length,
      delivered: rows.filter((row) => row.status === "delivered").length,
    }))
    .sort((a, b) => b.delayed - a.delayed);

  const providerRows = Array.from(groupRows(runs, (run) => run.provider ?? "deterministic"))
    .map(([provider, rows]) => ({
      provider,
      requests: rows.length,
      errors: rows.filter((row) => row.status === "error").length,
      fallback: rows.filter((row) => row.fallbackUsed).length,
      averageLatency: average(rows.map((row) => row.latencyMs ?? 0)),
      tokens: sumBy(rows, (row) => row.tokenUsage?.totalTokens ?? 0),
    }))
    .sort((a, b) => b.requests - a.requests);

  const agentActivityRows = Array.from(
    groupRows(
      runs.flatMap((run) =>
        run.agentsUsed.length
          ? run.agentsUsed.map((agent) => ({ agent, run }))
          : [{ agent: "supervisor", run }],
      ),
      (item) => item.agent,
    ),
  )
    .map(([agent, rows]) => ({
      agent,
      runs: rows.length,
      errors: rows.filter((row) => row.run.status === "error").length,
      highRisk: rows.filter((row) => row.run.riskLevel === "high").length,
      approvalRequired: rows.filter((row) => row.run.approvalStatus === "pending").length,
      averageLatency: average(rows.map((row) => row.run.latencyMs ?? 0)),
    }))
    .sort((a, b) => b.runs - a.runs);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GARAGE AI";
  workbook.subject = "GARAGE Master Operations Report";
  workbook.title = "GARAGE Master Report";
  workbook.created = range.generatedAt;
  workbook.modified = range.generatedAt;

  const dashboard = workbook.addWorksheet("Owner Dashboard");
  dashboard.views = [{ state: "frozen", ySplit: 4 }];
  dashboard.mergeCells("A1:H1");
  dashboard.getCell("A1").value = "GARAGE MASTER REPORT";
  dashboard.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 18 };
  dashboard.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111116" },
  };
  dashboard.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  dashboard.getRow(1).height = 32;
  dashboard.mergeCells("A2:H2");
  dashboard.getCell("A2").value = `Periode: ${range.label} | Dibuat: ${formatDateForCell(range.generatedAt)}`;
  dashboard.getCell("A2").font = { italic: true, color: { argb: "FF4B5563" } };
  dashboard.getCell("A2").alignment = { horizontal: "center" };

  const kpis = [
    ["Gross Sales", subtotal, idrFormat, "FF111116"],
    ["Net Sales", netSales, idrFormat, "FFD11A2A"],
    ["Total Order", totalOrders, numberFormat, "FF202027"],
    ["Avg Ticket", averageTicket, idrFormat, "FF202027"],
    ["Cash Gap", cashDiscrepancy, idrFormat, Math.abs(cashDiscrepancy) > 0 ? "FFD11A2A" : "FF166534"],
    ["Low Stock", lowStockRows.length, numberFormat, lowStockRows.length ? "FFF59E0B" : "FF166534"],
    ["Pending Approval", pendingApprovals.length + pendingDrafts.length, numberFormat, pendingApprovals.length + pendingDrafts.length ? "FFF59E0B" : "FF166534"],
    ["AI Alerts", errorRuns.length + fallbackRuns.length, numberFormat, errorRuns.length + fallbackRuns.length ? "FFD11A2A" : "FF166534"],
  ] as const;

  kpis.forEach(([label, value, numFmt, fill], index) => {
    const col = (index % 4) * 2 + 1;
    const row = Math.floor(index / 4) * 3 + 4;
    dashboard.getCell(row, col).value = label;
    dashboard.getCell(row, col).font = { bold: true, color: { argb: "FF6B7280" } };
    dashboard.getCell(row + 1, col).value = value;
    dashboard.getCell(row + 1, col).numFmt = numFmt;
    dashboard.mergeCells(row + 1, col, row + 1, col + 1);
    setKpiCell(dashboard.getCell(row + 1, col), fill);
  });

  let dashboardRow = 11;
  dashboardRow = addSection(
    dashboard,
    "Prioritas Owner",
    [
      { header: "Area", key: "area", width: 24 },
      { header: "Status", key: "status", width: 18 },
      { header: "Ringkasan", key: "summary", width: 70 },
      { header: "Next Action", key: "nextAction", width: 60 },
    ],
    [
      {
        area: "Sales",
        status: totalOrders ? "ready" : "watch",
        summary: `${totalOrders} order dengan net sales Rp ${netSales.toLocaleString("id-ID")}.`,
        nextAction: totalOrders ? "Review top item dan channel mix." : "Cek apakah outlet belum transaksi atau data belum sync.",
      },
      {
        area: "Finance",
        status: Math.abs(cashDiscrepancy) > 0 ? "watch" : "ready",
        summary: `Selisih kas periode ini Rp ${cashDiscrepancy.toLocaleString("id-ID")}.`,
        nextAction: Math.abs(cashDiscrepancy) > 0 ? "Audit cash session dan payment method." : "Tidak ada cash gap pada data periode ini.",
      },
      {
        area: "Inventory",
        status: lowStockRows.length ? "low" : "ready",
        summary: `${lowStockRows.length} item perlu perhatian stok.`,
        nextAction: lowStockRows.length ? "Buat draft reorder untuk item prioritas." : "Monitor stok berjalan.",
      },
      {
        area: "Approval",
        status: pendingApprovals.length + pendingDrafts.length ? "pending" : "ready",
        summary: `${pendingApprovals.length + pendingDrafts.length} approval/draft masih menunggu keputusan.`,
        nextAction: "Buka sheet Approval & Risk untuk keputusan.",
      },
      {
        area: "GARAGE AI",
        status: errorRuns.length ? "error" : fallbackRuns.length ? "watch" : "ready",
        summary: `${runs.length} run, ${fallbackRuns.length} fallback, ${errorRuns.length} error.`,
        nextAction: errorRuns.length ? "Cek provider/error pada sheet GARAGE AI Activity." : "Provider berjalan normal.",
      },
    ],
    dashboardRow,
  );
  addSection(
    dashboard,
    "Trend Penjualan",
    [
      { header: "Periode", key: "bucket", width: 18 },
      { header: "Order", key: "orders", width: 12, numFmt: numberFormat },
      { header: "Net Sales", key: "netSales", width: 18, numFmt: idrFormat },
      { header: "Avg Ticket", key: "averageTicket", width: 18, numFmt: idrFormat },
    ],
    salesTrendRows,
    dashboardRow,
  );
  applyBaseSheetStyle(dashboard);

  addSimpleSheet(
    workbook,
    "Sales Report",
    [
      { header: "Periode", key: "bucket", width: 18 },
      { header: "Orders", key: "orders", width: 12, numFmt: numberFormat },
      { header: "Subtotal", key: "subtotal", width: 18, numFmt: idrFormat },
      { header: "Discount", key: "discount", width: 18, numFmt: idrFormat },
      { header: "Service", key: "service", width: 18, numFmt: idrFormat },
      { header: "Tax", key: "tax", width: 18, numFmt: idrFormat },
      { header: "Net Sales", key: "netSales", width: 18, numFmt: idrFormat },
      { header: "Avg Ticket", key: "averageTicket", width: 18, numFmt: idrFormat },
    ],
    salesTrendRows,
  );

  const salesDetail = workbook.addWorksheet("Sales Detail");
  let salesDetailRow = addSection(
    salesDetail,
    "Top Menu Items",
    [
      { header: "Item", key: "item", width: 42 },
      { header: "Qty", key: "qty", width: 12, numFmt: numberFormat },
      { header: "Sales", key: "sales", width: 18, numFmt: idrFormat },
      { header: "Orders", key: "orders", width: 12, numFmt: numberFormat },
    ],
    topItemRows,
    1,
  );
  salesDetailRow = addSection(
    salesDetail,
    "Channel Mix",
    [
      { header: "Channel", key: "channel", width: 20 },
      { header: "Orders", key: "orders", width: 12, numFmt: numberFormat },
      { header: "Net Sales", key: "netSales", width: 18, numFmt: idrFormat },
      { header: "Share", key: "share", width: 12, numFmt: percentFormat },
    ],
    channelRows,
    salesDetailRow,
  );
  addSection(
    salesDetail,
    "Order Detail",
    [
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "Order No", key: "orderNo", width: 18 },
      { header: "Channel", key: "channel", width: 16 },
      { header: "Status", key: "status", width: 14 },
      { header: "Subtotal", key: "subtotal", width: 16, numFmt: idrFormat },
      { header: "Discount", key: "discount", width: 16, numFmt: idrFormat },
      { header: "Total", key: "total", width: 16, numFmt: idrFormat },
    ],
    orderRows.map((order) => ({
      createdAt: formatDateForCell(order.createdAt),
      orderNo: order.orderNo,
      channel: order.channel,
      status: order.status,
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
    })),
    salesDetailRow,
  );
  applyBaseSheetStyle(salesDetail);

  const finance = workbook.addWorksheet("Finance Report");
  let financeRow = addSection(
    finance,
    "Payment Breakdown",
    [
      { header: "Method", key: "method", width: 24 },
      { header: "Amount", key: "amount", width: 18, numFmt: idrFormat },
      { header: "Transactions", key: "transactions", width: 14, numFmt: numberFormat },
      { header: "Share", key: "share", width: 12, numFmt: percentFormat },
    ],
    paymentBreakdownRows,
    1,
  );
  financeRow = addSection(
    finance,
    "Cash Sessions",
    [
      { header: "Code", key: "code", width: 18 },
      { header: "Status", key: "status", width: 14 },
      { header: "Opening Cash", key: "openingCash", width: 18, numFmt: idrFormat },
      { header: "Expected Cash", key: "expectedCash", width: 18, numFmt: idrFormat },
      { header: "Actual Cash", key: "actualCash", width: 18, numFmt: idrFormat },
      { header: "Discrepancy", key: "discrepancy", width: 18, numFmt: idrFormat },
      { header: "Opened At", key: "openedAt", width: 24 },
      { header: "Closed At", key: "closedAt", width: 24 },
    ],
    cashRows.map((session) => ({
      code: session.code,
      status: session.status,
      openingCash: session.openingCash,
      expectedCash: session.expectedCash,
      actualCash: session.actualCash ?? "",
      discrepancy: session.discrepancy,
      openedAt: formatDateForCell(session.openedAt),
      closedAt: formatDateForCell(session.closedAt),
    })),
    financeRow,
  );
  financeRow = addSection(
    finance,
    "Profit & Loss Snapshot",
    [
      { header: "Item", key: "item", width: 28 },
      { header: "Amount", key: "amount", width: 18, numFmt: idrFormat },
      { header: "Note", key: "note", width: 58 },
    ],
    [
      { item: "Net Sales", amount: netSales, note: "Paid order total pada periode laporan." },
      { item: "COGS", amount: -reportCogs, note: cogsExpense ? "Dari expense COGS." : "Fallback rasio coffee shop saat expense COGS belum lengkap." },
      { item: "Gross Profit", amount: reportGrossProfit, note: "Net sales dikurangi COGS." },
      { item: "Payroll", amount: -payrollExpense, note: "Expense kategori Payroll pada periode." },
      { item: "Operational", amount: -operationalExpense, note: "Expense kategori Operasional pada periode." },
      { item: "Marketing", amount: -marketingExpense, note: "Expense kategori Marketing pada periode." },
      { item: "Other", amount: -otherExpense, note: "Kategori expense lain." },
      { item: "Net Profit", amount: reportNetProfit, note: "Snapshot laba rugi otomatis." },
    ],
    financeRow,
  );
  financeRow = addSection(
    finance,
    "Expense Summary",
    [
      { header: "Category", key: "category", width: 24 },
      { header: "Amount", key: "amount", width: 18, numFmt: idrFormat },
      { header: "Transactions", key: "transactions", width: 14, numFmt: numberFormat },
      { header: "Paid", key: "paid", width: 18, numFmt: idrFormat },
      { header: "Status", key: "status", width: 16 },
    ],
    expenseSummaryRows,
    financeRow,
  );
  financeRow = addSection(
    finance,
    "Settlement Reconciliation",
    [
      { header: "Method", key: "method", width: 18 },
      { header: "Expected", key: "expected", width: 18, numFmt: idrFormat },
      { header: "Settled", key: "settled", width: 18, numFmt: idrFormat },
      { header: "Fee", key: "fee", width: 18, numFmt: idrFormat },
      { header: "Gap", key: "gap", width: 18, numFmt: idrFormat },
      { header: "Status", key: "status", width: 16 },
    ],
    settlementSummaryRows,
    financeRow,
  );
  financeRow = addSection(
    finance,
    "Supplier Payables",
    [
      { header: "Supplier", key: "supplierName", width: 32 },
      { header: "Invoices", key: "invoices", width: 12, numFmt: numberFormat },
      { header: "Amount", key: "amount", width: 18, numFmt: idrFormat },
      { header: "Paid", key: "paid", width: 18, numFmt: idrFormat },
      { header: "Remaining", key: "remaining", width: 18, numFmt: idrFormat },
      { header: "Status", key: "status", width: 16 },
    ],
    supplierSummaryRows,
    financeRow,
  );
  addSection(
    finance,
    "Finance Risk",
    [
      { header: "Source", key: "source", width: 18 },
      { header: "Type", key: "type", width: 20 },
      { header: "Risk", key: "risk", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "Amount/Title", key: "amount", width: 34 },
      { header: "Reason/Detail", key: "reason", width: 70 },
    ],
    [
      ...approvalRows
        .filter((approval) =>
          ["refund", "void", "discount", "finance"].some((keyword) =>
            `${approval.type} ${approval.reason}`.toLowerCase().includes(keyword),
          ),
        )
        .map((approval) => ({
          source: "Approval",
          type: approval.type,
          risk: approval.risk,
          status: approval.status,
          amount: approval.amount,
          reason: approval.reason,
        })),
      ...drafts
        .filter((draft) => draft.agentId === "finance_guard" || draft.actionType.includes("finance"))
        .map((draft) => ({
          source: "AI Draft",
          type: draft.actionType,
          risk: draft.riskLevel,
          status: draft.approvalStatus,
          amount: draft.title,
          reason: draft.detail,
        })),
    ],
    financeRow,
  );
  applyBaseSheetStyle(finance);

  const inventory = workbook.addWorksheet("Inventory Report");
  let inventoryRow = addSection(
    inventory,
    "Low Stock & Reorder Priority",
    [
      { header: "SKU", key: "sku", width: 18 },
      { header: "Name", key: "name", width: 32 },
      { header: "Category", key: "category", width: 18 },
      { header: "Unit", key: "unit", width: 12 },
      { header: "On Hand", key: "onHand", width: 14, numFmt: decimalFormat },
      { header: "Minimum", key: "min", width: 14, numFmt: decimalFormat },
      { header: "Gap", key: "gap", width: 14, numFmt: decimalFormat },
      { header: "Status", key: "status", width: 14 },
      { header: "Movement", key: "movement", width: 26 },
    ],
    lowStockRows
      .map((item) => ({
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        onHand: item.onHand,
        min: item.min,
        gap: item.onHand - item.min,
        status: item.status,
        movement: item.movement,
      }))
      .sort((a, b) => Number(a.gap) - Number(b.gap)),
    1,
  );
  inventoryRow = addSection(
    inventory,
    "Stock Movements",
    [
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Type", key: "type", width: 16 },
      { header: "Qty", key: "qty", width: 12, numFmt: decimalFormat },
      { header: "Actor", key: "actor", width: 20 },
      { header: "Note", key: "note", width: 70 },
    ],
    stockRows.map((row) => ({
      createdAt: formatDateForCell(row.createdAt),
      sku: row.itemSku ?? "",
      type: row.type,
      qty: row.qty ?? "",
      actor: row.actor,
      note: row.note,
    })),
    inventoryRow,
  );
  addSection(
    inventory,
    "AI Inventory Drafts",
    [
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "Action", key: "action", width: 24 },
      { header: "Risk", key: "risk", width: 14 },
      { header: "Approval", key: "approval", width: 16 },
      { header: "Title", key: "title", width: 36 },
      { header: "Detail", key: "detail", width: 70 },
    ],
    drafts
      .filter((draft) => draft.agentId === "inventory" || draft.actionType.includes("stock"))
      .map((draft) => ({
        createdAt: formatDateForCell(draft.createdAt),
        action: draft.actionType,
        risk: draft.riskLevel,
        approval: draft.approvalStatus,
        title: draft.title,
        detail: draft.detail,
      })),
    inventoryRow,
  );
  applyBaseSheetStyle(inventory);

  const kitchen = workbook.addWorksheet("Kitchen Report");
  const kitchenRow = addSection(
    kitchen,
    "Kitchen by Station",
    [
      { header: "Station", key: "station", width: 18 },
      { header: "Tickets", key: "tickets", width: 12, numFmt: numberFormat },
      { header: "Avg Elapsed", key: "averageElapsed", width: 16, numFmt: decimalFormat },
      { header: "Delayed", key: "delayed", width: 12, numFmt: numberFormat },
      { header: "Queue", key: "queue", width: 12, numFmt: numberFormat },
      { header: "Cooking", key: "cooking", width: 12, numFmt: numberFormat },
      { header: "Delivered", key: "delivered", width: 12, numFmt: numberFormat },
    ],
    kitchenByStationRows,
    1,
  );
  addSection(
    kitchen,
    "Ticket Detail",
    [
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "Ticket", key: "ticket", width: 16 },
      { header: "Table", key: "table", width: 12 },
      { header: "Channel", key: "channel", width: 16 },
      { header: "Station", key: "station", width: 16 },
      { header: "Status", key: "status", width: 14 },
      { header: "Priority", key: "priority", width: 14 },
      { header: "Elapsed", key: "elapsed", width: 12, numFmt: numberFormat },
      { header: "Items", key: "items", width: 70 },
    ],
    kitchenRows.map((ticket) => ({
      createdAt: formatDateForCell(ticket.createdAt),
      ticket: ticket.ticketNo,
      table: ticket.tableLabel,
      channel: ticket.channel,
      station: ticket.station,
      status: ticket.status,
      priority: ticket.priority,
      elapsed: ticket.elapsed,
      items: ticket.items.join(", "),
    })),
    kitchenRow,
  );
  applyBaseSheetStyle(kitchen);

  const approvalRisk = workbook.addWorksheet("Approval & Risk");
  const approvalRow = addSection(
    approvalRisk,
    "Approval Requests",
    [
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "ID", key: "id", width: 18 },
      { header: "Type", key: "type", width: 20 },
      { header: "Requester", key: "requester", width: 24 },
      { header: "Amount", key: "amount", width: 18 },
      { header: "Risk", key: "risk", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "Reason", key: "reason", width: 70 },
    ],
    approvalRows.map((approval) => ({
      createdAt: formatDateForCell(approval.createdAt),
      id: approval.id,
      type: approval.type,
      requester: approval.requester,
      amount: approval.amount,
      risk: approval.risk,
      status: approval.status,
      reason: approval.reason,
    })),
    1,
  );
  addSection(
    approvalRisk,
    "AI Action Drafts",
    [
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "Draft ID", key: "id", width: 38 },
      { header: "Agent", key: "agent", width: 22 },
      { header: "Action", key: "action", width: 24 },
      { header: "Safety", key: "safety", width: 14 },
      { header: "Risk", key: "risk", width: 14 },
      { header: "Approval", key: "approval", width: 16 },
      { header: "Title", key: "title", width: 36 },
      { header: "Detail", key: "detail", width: 70 },
    ],
    drafts.map((draft) => ({
      createdAt: formatDateForCell(draft.createdAt),
      id: draft.id,
      agent: draft.agentId,
      action: draft.actionType,
      safety: draft.safetyLevel,
      risk: draft.riskLevel,
      approval: draft.approvalStatus,
      title: draft.title,
      detail: draft.detail,
    })),
    approvalRow,
  );
  applyBaseSheetStyle(approvalRisk);

  const aiActivity = workbook.addWorksheet("GARAGE AI Activity");
  let aiRow = addSection(
    aiActivity,
    "Agent Configs",
    [
      { header: "Agent ID", key: "agentId", width: 26 },
      { header: "Label", key: "label", width: 28 },
      { header: "Enabled", key: "enabled", width: 12 },
      { header: "Autonomy", key: "autonomy", width: 16 },
      { header: "Max Risk", key: "risk", width: 14 },
      { header: "Allowed Intents", key: "intents", width: 48 },
      { header: "Updated At", key: "updatedAt", width: 24 },
    ],
    configs.map((config) => ({
      agentId: config.agentId,
      label: config.label,
      enabled: config.enabled ? "ready" : "disabled",
      autonomy: config.autonomyMode,
      risk: config.maxRiskLevel,
      intents: config.allowedIntents.join(", "),
      updatedAt: formatDateForCell(config.updatedAt),
    })),
    1,
  );
  aiRow = addSection(
    aiActivity,
    "Agent Run Summary",
    [
      { header: "Agent", key: "agent", width: 24 },
      { header: "Runs", key: "runs", width: 12, numFmt: numberFormat },
      { header: "Errors", key: "errors", width: 12, numFmt: numberFormat },
      { header: "High Risk", key: "highRisk", width: 12, numFmt: numberFormat },
      { header: "Approval Required", key: "approvalRequired", width: 18, numFmt: numberFormat },
      { header: "Avg Latency", key: "averageLatency", width: 16, numFmt: decimalFormat },
    ],
    agentActivityRows,
    aiRow,
  );
  aiRow = addSection(
    aiActivity,
    "Provider Health",
    [
      { header: "Provider", key: "provider", width: 22 },
      { header: "Requests", key: "requests", width: 12, numFmt: numberFormat },
      { header: "Errors", key: "errors", width: 12, numFmt: numberFormat },
      { header: "Fallback", key: "fallback", width: 12, numFmt: numberFormat },
      { header: "Avg Latency", key: "averageLatency", width: 16, numFmt: decimalFormat },
      { header: "Tokens", key: "tokens", width: 14, numFmt: numberFormat },
    ],
    providerRows,
    aiRow,
  );
  addSection(
    aiActivity,
    "Agent Run Detail",
    [
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "Run ID", key: "id", width: 38 },
      { header: "Role", key: "role", width: 18 },
      { header: "Intent", key: "intent", width: 18 },
      { header: "Profile", key: "profile", width: 14 },
      { header: "Provider", key: "provider", width: 18 },
      { header: "Model", key: "model", width: 28 },
      { header: "Status", key: "status", width: 16 },
      { header: "Risk", key: "risk", width: 12 },
      { header: "Fallback", key: "fallback", width: 12 },
      { header: "Latency Ms", key: "latency", width: 14, numFmt: numberFormat },
      { header: "Total Tokens", key: "tokens", width: 14, numFmt: numberFormat },
      { header: "Agents Used", key: "agents", width: 38 },
      { header: "Prompt", key: "prompt", width: 72 },
      { header: "Error", key: "error", width: 42 },
    ],
    runs.map((run) => ({
      createdAt: formatDateForCell(run.createdAt),
      id: run.id,
      role: run.role,
      intent: run.intent,
      profile: run.profile,
      provider: run.provider ?? "deterministic",
      model: run.model ?? "",
      status: run.status,
      risk: run.riskLevel,
      fallback: run.fallbackUsed ? "yes" : "no",
      latency: run.latencyMs ?? "",
      tokens: run.tokenUsage?.totalTokens ?? "",
      agents: run.agentsUsed.join(", "),
      prompt: run.prompt,
      error: run.error ?? "",
    })),
    aiRow,
  );
  applyBaseSheetStyle(aiActivity);

  addSimpleSheet(
    workbook,
    "Customers",
    [
      { header: "Name", key: "name", width: 30 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Tier", key: "tier", width: 16 },
      { header: "Points", key: "points", width: 12, numFmt: numberFormat },
      { header: "Visits", key: "visits", width: 12, numFmt: numberFormat },
      { header: "Last Order", key: "lastOrder", width: 18 },
      { header: "Flag", key: "flag", width: 24 },
    ],
    customerRows.map((customer) => ({
      name: customer.name,
      phone: customer.phone,
      tier: customer.tier,
      points: customer.points,
      visits: customer.visits,
      lastOrder: customer.lastOrder,
      flag: customer.flag,
    })),
  );

  const rawRows: SectionRow[] = [
    ...orderRows.map((order) => ({
      type: "order",
      createdAt: formatDateForCell(order.createdAt),
      reference: order.orderNo,
      status: order.status,
      amount: order.total,
      detail: `${order.channel} ${order.tableLabel}`,
      metadata: safeJson({
        subtotal: order.subtotal,
        discount: order.discount,
        service: order.service,
        tax: order.tax,
      }),
    })),
    ...paymentRows.map((payment) => ({
      type: "payment",
      createdAt: formatDateForCell(payment.createdAt),
      reference: payment.orderNo ?? payment.id,
      status: payment.status,
      amount: payment.amount,
      detail: payment.method,
      metadata: safeJson({ channel: payment.channel }),
    })),
    ...expenseRows.map((expense) => ({
      type: "expense",
      createdAt: formatDateForCell(expense.expenseDate),
      reference: expense.id,
      status: expense.status,
      amount: expense.amount,
      detail: `${expense.category} - ${expense.description}`,
      metadata: safeJson({ paymentMethod: expense.paymentMethod, notes: expense.notes }),
    })),
    ...settlementRows.map((settlement) => ({
      type: "payment_settlement",
      createdAt: formatDateForCell(settlement.settlementDate),
      reference: settlement.settlementNo,
      status: settlement.status,
      amount: settlement.settledAmount,
      detail: `${settlement.method} ${settlement.provider}`,
      metadata: safeJson({
        expectedAmount: settlement.expectedAmount,
        feeAmount: settlement.feeAmount,
        reference: settlement.reference,
      }),
    })),
    ...supplierInvoiceRows.map((invoice) => ({
      type: "supplier_invoice",
      createdAt: formatDateForCell(invoice.issuedAt),
      reference: invoice.invoiceNo,
      status: invoice.status,
      amount: invoice.amount,
      detail: `${invoice.supplierName ?? "Supplier"} - ${invoice.description}`,
      metadata: safeJson({
        category: invoice.category,
        paidAmount: invoice.paidAmount,
        dueDate: invoice.dueDate,
        paymentRef: invoice.paymentRef,
      }),
    })),
    ...stockRows.map((movement) => ({
      type: "stock_movement",
      createdAt: formatDateForCell(movement.createdAt),
      reference: movement.itemSku ?? movement.id,
      status: movement.type,
      amount: movement.qty ?? 0,
      detail: movement.note,
      metadata: safeJson({ actor: movement.actor }),
    })),
    ...events.map((event) => ({
      type: "ai_event",
      createdAt: formatDateForCell(event.createdAt),
      reference: event.id,
      status: event.eventType,
      amount: 0,
      detail: event.message,
      metadata: safeJson(event.metadata),
    })),
  ];
  addSimpleSheet(
    workbook,
    "Raw Data Appendix",
    [
      { header: "Type", key: "type", width: 18 },
      { header: "Created At", key: "createdAt", width: 24 },
      { header: "Reference", key: "reference", width: 38 },
      { header: "Status", key: "status", width: 18 },
      { header: "Amount/Qty", key: "amount", width: 18, numFmt: decimalFormat },
      { header: "Detail", key: "detail", width: 70 },
      { header: "Metadata", key: "metadata", width: 70 },
    ],
    rawRows,
  );

  workbook.eachSheet((sheet) => {
    sheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    };
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const fileName = `garage-master-report-${range.period}-${range.fileDate}.xlsx`;

  return {
    buffer,
    fileName,
    generatedAt: range.generatedAt.toISOString(),
    days: range.days,
    period: range.period,
    date: range.date,
    periodLabel: range.label,
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
    rowCounts: {
      configs: configs.length,
      runs: runs.length,
      drafts: drafts.length,
      events: events.length,
      orders: orderRows.length,
      orderItems: itemRows.length,
      payments: paymentRows.length,
      cashSessions: cashRows.length,
      expenses: expenseRows.length,
      paymentSettlements: settlementRows.length,
      supplierInvoices: supplierInvoiceRows.length,
      inventory: inventoryRows.length,
      stockMovements: stockRows.length,
      kitchenTickets: kitchenRows.length,
      approvals: approvalRows.length,
      customers: customerRows.length,
    },
  } satisfies GarageAiReportBuildResult;
}
