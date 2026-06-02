import { and, gte, lt, sql } from "drizzle-orm";

import { fail, ok } from "@/lib/api-response";
import { getDb } from "@/db";
import { expenses, orders, supplierInvoices } from "@/db/schema";
import { jakartaDateKey, jakartaDayRange } from "@/lib/attendance";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

// Cashflow forecast: tren revenue/expense N hari + due liability dalam 30 hari.
// Dipakai oleh /control/cashflow.
export async function GET(request: Request) {
  const session = await requirePermission("finance:read");
  if (session.response) return session.response;

  try {
    const url = new URL(request.url);
    const daysParam = Number(url.searchParams.get("days") ?? "30");
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 180) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const today = jakartaDayRange();

    const db = await getDb();

    // Revenue per hari (paid orders).
    const revRows = await db
      .select({
        day: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
        total: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
      })
      .from(orders)
      .where(and(gte(orders.createdAt, since), sql`${orders.status} = 'paid'`))
      .groupBy(sql`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`);

    // Expense per hari.
    const expRows = await db
      .select({
        day: sql<string>`to_char(${expenses.expenseDate} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`,
        total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(gte(expenses.expenseDate, since))
      .groupBy(sql`to_char(${expenses.expenseDate} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`);

    // Susun trend per hari (revenue & expense), isi 0 untuk hari kosong.
    const revByDay = new Map<string, number>();
    for (const r of revRows) revByDay.set(r.day, Number(r.total));
    const expByDay = new Map<string, number>();
    for (const r of expRows) expByDay.set(r.day, Number(r.total));

    const trend: Array<{ date: string; revenue: number; expense: number; net: number }> = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = jakartaDateKey(d);
      const revenue = revByDay.get(key) ?? 0;
      const expense = expByDay.get(key) ?? 0;
      trend.push({ date: key, revenue, expense, net: revenue - expense });
    }

    // Rata-rata 7 & 30 hari.
    const last7 = trend.slice(-7);
    const avg = (arr: Array<{ revenue: number; expense: number }>) => {
      if (arr.length === 0) return { revenue: 0, expense: 0 };
      const r = arr.reduce((s, t) => s + t.revenue, 0) / arr.length;
      const e = arr.reduce((s, t) => s + t.expense, 0) / arr.length;
      return { revenue: r, expense: e };
    };
    const avg7 = avg(last7);
    const avg30 = avg(trend);
    const dailyNet7 = avg7.revenue - avg7.expense;
    const dailyNet30 = avg30.revenue - avg30.expense;

    // Due liability dalam 7 / 30 hari ke depan.
    const now = new Date();
    const due7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const due30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const dueRows = await db
      .select({
        dueDate: supplierInvoices.dueDate,
        amount: supplierInvoices.amount,
        paidAmount: supplierInvoices.paidAmount,
        invoiceNo: supplierInvoices.invoiceNo,
        status: supplierInvoices.status,
      })
      .from(supplierInvoices)
      .where(and(lt(supplierInvoices.dueDate, due30), sql`${supplierInvoices.status} != 'paid'`));

    const dueWithin7 = dueRows
      .filter((d) => d.dueDate <= due7)
      .reduce((s, d) => s + Math.max(0, d.amount - d.paidAmount), 0);
    const dueWithin30 = dueRows.reduce(
      (s, d) => s + Math.max(0, d.amount - d.paidAmount),
      0,
    );

    // Revenue & expense hari ini.
    const todayRevRow = await db
      .select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, today.start),
          lt(orders.createdAt, today.end),
          sql`${orders.status} = 'paid'`,
        ),
      );
    const todayExpRow = await db
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(gte(expenses.expenseDate, today.start), lt(expenses.expenseDate, today.end)));
    const todayRevenue = Number(todayRevRow[0]?.total ?? 0);
    const todayExpense = Number(todayExpRow[0]?.total ?? 0);

    const proj7Net = dailyNet7 * 7 - dueWithin7;
    const proj30Net = dailyNet30 * 30 - dueWithin30;

    return ok({
      windowDays: days,
      today: {
        revenue: todayRevenue,
        expense: todayExpense,
        net: todayRevenue - todayExpense,
      },
      avg7,
      avg30,
      dailyNet7,
      dailyNet30,
      due: { within7: dueWithin7, within30: dueWithin30 },
      forecast: { proj7Net, proj30Net },
      trend,
    });
  } catch (error) {
    console.error("finance/forecast error:", error);
    return fail(500, "INTERNAL_ERROR", "Gagal menghitung forecast");
  }
}
