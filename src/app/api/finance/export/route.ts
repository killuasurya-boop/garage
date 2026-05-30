import ExcelJS from "exceljs";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  cashMovements,
  cashSessions,
  expenses,
  orders,
  payments,
  paymentSettlements,
  stockOpnameItems,
  stockOpnameSessions,
  supplierInvoices,
  suppliers,
} from "@/db/schema";
import { fail } from "@/lib/api-response";
import { getFinanceOverview } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

function jakartaDateRange(dateText: string) {
  // dateText format: YYYY-MM-DD (Jakarta-local)
  const start = new Date(`${dateText}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end };
}

function jakartaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) {
    return session.response;
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") ?? jakartaToday();
  const range = jakartaDateRange(dateParam);
  if (!range) {
    return fail(400, "INVALID_DATE", "date harus format YYYY-MM-DD.");
  }

  const db = getDb();

  const dayOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, range.start),
        lt(orders.createdAt, range.end),
      ),
    )
    .orderBy(desc(orders.createdAt));

  const orderIds = dayOrders.map((row) => row.id);
  const dayPayments = orderIds.length
    ? await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.status, "captured"),
            inArray(payments.orderId, orderIds),
          ),
        )
    : [];
  const paymentByOrder = new Map<string, { method: string; amount: number }>();
  for (const row of dayPayments) {
    if (!row.orderId) continue;
    if (!paymentByOrder.has(row.orderId)) {
      paymentByOrder.set(row.orderId, { method: row.method, amount: row.amount });
    }
  }

  const [overview, dayExpenses, daySettlements, supplierRows, cashRows, opnameRows] =
    await Promise.all([
      getFinanceOverview(),
      db
        .select()
        .from(expenses)
        .where(
          and(
            gte(expenses.expenseDate, range.start),
            lt(expenses.expenseDate, range.end),
          ),
        )
        .orderBy(desc(expenses.expenseDate)),
      db
        .select()
        .from(paymentSettlements)
        .where(
          and(
            gte(paymentSettlements.settlementDate, range.start),
            lt(paymentSettlements.settlementDate, range.end),
          ),
        )
        .orderBy(desc(paymentSettlements.createdAt)),
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
          paidAt: supplierInvoices.paidAt,
          paymentRef: supplierInvoices.paymentRef,
        })
        .from(supplierInvoices)
        .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
        .orderBy(desc(supplierInvoices.dueDate))
        .limit(500),
      db
        .select()
        .from(cashSessions)
        .where(
          and(
            gte(cashSessions.openedAt, range.start),
            lt(cashSessions.openedAt, range.end),
          ),
        )
        .orderBy(desc(cashSessions.openedAt)),
      db
        .select({
          code: stockOpnameSessions.code,
          status: stockOpnameSessions.status,
          note: stockOpnameSessions.note,
          totalItems: stockOpnameSessions.totalItems,
          totalDelta: stockOpnameSessions.totalDelta,
          itemSku: stockOpnameItems.itemSku,
          itemName: stockOpnameItems.itemName,
          unit: stockOpnameItems.unit,
          systemQty: stockOpnameItems.systemQty,
          physicalQty: stockOpnameItems.physicalQty,
          delta: stockOpnameItems.delta,
          itemNote: stockOpnameItems.note,
          createdAt: stockOpnameSessions.createdAt,
          approvedAt: stockOpnameSessions.approvedAt,
          appliedAt: stockOpnameSessions.appliedAt,
        })
        .from(stockOpnameSessions)
        .leftJoin(stockOpnameItems, eq(stockOpnameItems.sessionId, stockOpnameSessions.id))
        .where(
          and(
            gte(stockOpnameSessions.createdAt, range.start),
            lt(stockOpnameSessions.createdAt, range.end),
          ),
        )
        .orderBy(desc(stockOpnameSessions.createdAt)),
    ]);

  // Build workbook.
  const wb = new ExcelJS.Workbook();
  wb.creator = "Garage Coffee & Motor OS";
  wb.created = new Date();

  // Sheet 1: Summary
  const sum = wb.addWorksheet("Ringkasan");
  sum.addRow(["Garage Coffee & Motor — Finance Report"]);
  sum.addRow(["Tanggal", dateParam]);
  sum.addRow(["Order paid", dayOrders.length]);

  const revenue = dayOrders.reduce((acc, row) => acc + (row.total ?? 0), 0);
  sum.addRow(["Revenue", currency.format(revenue)]);
  sum.addRow(["Expense", currency.format(overview.today.expense)]);
  sum.addRow(["Gross profit", currency.format(overview.today.grossProfit)]);
  sum.addRow(["Net profit", currency.format(overview.today.netProfit)]);
  sum.addRow(["Food cost", `${overview.today.foodCostRatio}%`]);
  sum.addRow(["Finance health", `${overview.financeGuard.healthScore} / ${overview.financeGuard.level}`]);
  sum.addRow(["Guard brief", overview.financeGuard.brief]);

  const methodTotals = new Map<string, number>();
  for (const row of dayPayments) {
    methodTotals.set(row.method, (methodTotals.get(row.method) ?? 0) + row.amount);
  }
  sum.addRow([]);
  sum.addRow(["Payment Method", "Total"]);
  for (const [method, total] of methodTotals.entries()) {
    sum.addRow([method, currency.format(total)]);
  }

  sum.getColumn(1).width = 28;
  sum.getColumn(2).width = 24;
  sum.getRow(1).font = { bold: true, size: 14 };

  // Sheet 2: Orders
  const orderSheet = wb.addWorksheet("Order");
  orderSheet.addRow([
    "Order No",
    "Channel",
    "Meja",
    "Subtotal",
    "Service",
    "Tax",
    "Discount",
    "Total",
    "Payment",
    "Waktu",
  ]);
  for (const row of dayOrders) {
    const pay = paymentByOrder.get(row.id);
    orderSheet.addRow([
      row.orderNo,
      row.channel,
      row.tableLabel,
      row.subtotal,
      row.service,
      row.tax,
      row.discount,
      row.total,
      pay?.method ?? "-",
      new Intl.DateTimeFormat("id-ID", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "Asia/Jakarta",
      }).format(row.createdAt),
    ]);
  }
  orderSheet.getRow(1).font = { bold: true };
  orderSheet.columns.forEach((col) => {
    col.width = 16;
  });

  const pnlSheet = wb.addWorksheet("P&L");
  pnlSheet.addRow(["Item", "Nominal"]);
  [
    ["Pendapatan bruto", overview.profitLoss.grossRevenue],
    ["Diskon & retur", -overview.profitLoss.discounts],
    ["Pendapatan neto", overview.profitLoss.netRevenue],
    ["HPP / COGS", -overview.profitLoss.cogs],
    ["Gross profit", overview.profitLoss.grossProfit],
    ["Gaji pegawai", -overview.profitLoss.payroll],
    ["Operasional", -overview.profitLoss.operational],
    ["Marketing", -overview.profitLoss.marketing],
    ["Lain-lain", -overview.profitLoss.other],
    ["Net profit", overview.profitLoss.netProfit],
  ].forEach((row) => pnlSheet.addRow(row));
  pnlSheet.getRow(1).font = { bold: true };
  pnlSheet.getColumn(1).width = 28;
  pnlSheet.getColumn(2).width = 18;

  const expenseSheet = wb.addWorksheet("Expense");
  expenseSheet.addRow([
    "Tanggal",
    "Kategori",
    "Deskripsi",
    "Nominal",
    "Metode",
    "Status",
    "Notes",
  ]);
  for (const row of dayExpenses) {
    expenseSheet.addRow([
      row.expenseDate,
      row.category,
      row.description,
      row.amount,
      row.paymentMethod,
      row.status,
      row.notes ?? "",
    ]);
  }
  expenseSheet.getRow(1).font = { bold: true };
  expenseSheet.columns.forEach((col) => {
    col.width = 18;
  });

  const settlementSheet = wb.addWorksheet("Settlement");
  settlementSheet.addRow([
    "Settlement No",
    "Metode",
    "Provider",
    "Expected",
    "Settled",
    "Fee",
    "Gap",
    "Status",
    "Tanggal",
    "Reference",
  ]);
  for (const row of daySettlements) {
    settlementSheet.addRow([
      row.settlementNo,
      row.method,
      row.provider,
      row.expectedAmount,
      row.settledAmount,
      row.feeAmount,
      row.settledAmount - row.expectedAmount,
      row.status,
      row.settlementDate,
      row.reference ?? "",
    ]);
  }
  settlementSheet.getRow(1).font = { bold: true };
  settlementSheet.columns.forEach((col) => {
    col.width = 18;
  });

  const supplierSheet = wb.addWorksheet("Supplier Payable");
  supplierSheet.addRow([
    "Supplier",
    "Invoice",
    "Kategori",
    "Deskripsi",
    "Nominal",
    "Terbayar",
    "Sisa",
    "Status",
    "Jatuh Tempo",
    "Paid At",
    "Payment Ref",
  ]);
  for (const row of supplierRows) {
    supplierSheet.addRow([
      row.supplierName ?? "Supplier",
      row.invoiceNo,
      row.category,
      row.description,
      row.amount,
      row.paidAmount,
      Math.max(0, row.amount - row.paidAmount),
      row.status,
      row.dueDate,
      row.paidAt ?? "",
      row.paymentRef ?? "",
    ]);
  }
  supplierSheet.getRow(1).font = { bold: true };
  supplierSheet.columns.forEach((col) => {
    col.width = 18;
  });

  const cashSheet = wb.addWorksheet("Cash Closing");
  cashSheet.addRow([
    "Code",
    "Status",
    "Opening",
    "Expected",
    "Actual",
    "Discrepancy",
    "Discrepancy Status",
    "Manager Sign-off",
    "Opened At",
    "Closed At",
    "Closing Note",
  ]);
  for (const row of cashRows) {
    cashSheet.addRow([
      row.code,
      row.status,
      row.openingCash,
      row.expectedCash,
      row.actualCash ?? "",
      row.discrepancy,
      row.discrepancyStatus,
      row.managerSignOffAt ? "Signed" : "Pending",
      row.openedAt,
      row.closedAt ?? "",
      row.closingNote ?? "",
    ]);
  }
  cashSheet.getRow(1).font = { bold: true };
  cashSheet.columns.forEach((col) => {
    col.width = 18;
  });

  const reconSheet = wb.addWorksheet("Shift Reconciliation");
  reconSheet.addRow([
    "Session",
    "Opening",
    "Cash Payments (linked)",
    "Cash Out (movements)",
    "Calculated Expected",
    "System Expected",
    "Variance",
    "Actual",
    "Discrepancy",
  ]);
  for (const session of cashRows) {
    const [paymentAgg] = await db
      .select({
        cashIn: sql<number>`coalesce(sum(case when lower(${payments.method}) = 'cash' then ${payments.amount} else 0 end), 0)::int`,
        totalCaptured: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.cashSessionId, session.id),
          eq(payments.status, "captured"),
        ),
      );
    const [movementAgg] = await db
      .select({
        cashOut: sql<number>`coalesce(sum(${cashMovements.amount}), 0)::int`,
      })
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.cashSessionId, session.id),
          eq(cashMovements.type, "out"),
        ),
      );
    const cashIn = Number(paymentAgg?.cashIn ?? 0);
    const cashOut = Number(movementAgg?.cashOut ?? 0);
    const calculatedExpected = session.openingCash + cashIn - cashOut;
    const variance = calculatedExpected - session.expectedCash;
    reconSheet.addRow([
      session.code,
      session.openingCash,
      cashIn,
      cashOut,
      calculatedExpected,
      session.expectedCash,
      variance,
      session.actualCash ?? "",
      session.discrepancy,
    ]);
  }
  reconSheet.getRow(1).font = { bold: true };
  reconSheet.columns.forEach((col) => {
    col.width = 16;
  });

  const opnameSheet = wb.addWorksheet("Stock Opname");
  opnameSheet.addRow([
    "Code",
    "Status",
    "Total Item",
    "Total Delta",
    "SKU",
    "Item",
    "Unit",
    "System Qty",
    "Physical Qty",
    "Delta",
    "Note",
    "Created At",
    "Approved At",
    "Applied At",
  ]);
  for (const row of opnameRows) {
    opnameSheet.addRow([
      row.code,
      row.status,
      row.totalItems,
      row.totalDelta,
      row.itemSku ?? "",
      row.itemName ?? "",
      row.unit ?? "",
      row.systemQty ?? "",
      row.physicalQty ?? "",
      row.delta ?? "",
      row.itemNote ?? row.note ?? "",
      row.createdAt,
      row.approvedAt ?? "",
      row.appliedAt ?? "",
    ]);
  }
  opnameSheet.getRow(1).font = { bold: true };
  opnameSheet.columns.forEach((col) => {
    col.width = 18;
  });

  const guardSheet = wb.addWorksheet("Finance Guard");
  guardSheet.addRow(["Health Score", overview.financeGuard.healthScore]);
  guardSheet.addRow(["Level", overview.financeGuard.level]);
  guardSheet.addRow(["Brief", overview.financeGuard.brief]);
  if (overview.bomCoverage) {
    guardSheet.addRow([]);
    guardSheet.addRow(["BOM coverage %", overview.bomCoverage.coveragePct]);
    guardSheet.addRow(["Variants with BOM", overview.bomCoverage.withBom]);
    guardSheet.addRow(["Low margin count", overview.bomCoverage.lowMarginCount]);
  }
  guardSheet.addRow([]);
  guardSheet.addRow(["Risiko", "Level", "Pesan"]);
  overview.financeGuard.risks.forEach((risk) => {
    guardSheet.addRow([risk.area, risk.level, risk.message]);
  });
  guardSheet.addRow([]);
  guardSheet.addRow(["Next Action"]);
  overview.financeGuard.nextActions.forEach((action) => {
    guardSheet.addRow([action]);
  });
  guardSheet.getColumn(1).width = 28;
  guardSheet.getColumn(2).width = 18;
  guardSheet.getColumn(3).width = 72;

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="garage-finance-${dateParam}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
