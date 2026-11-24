// Loader DB untuk ringkasan penjualan + HPP produk (Owner 24 Nov 2026).
// Aturan & hitungan murni ada di `sales-hpp-summary.ts`.

import { and, eq, gte, inArray, lt, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { financeDailyClosings, menuItems, menuVariants, orderItems, orders, payments } from "@/db/schema";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { addDays, eachDay, jakartaDateKey, jakartaDayStart } from "@/lib/finance-control-core";
import { getDayFigures, loadFinanceConfig } from "@/lib/finance-control";
import { buildDailyBankReport, summarizeSalesHpp, type DailyBankReport, type SalesHppSummary, type SalesLine } from "@/lib/sales-hpp-summary";

type Where = ReturnType<typeof and>;

async function loadLines(where: Where): Promise<SalesLine[]> {
  const rows = await getDb()
    .select({
      menuItemId: orderItems.menuItemId,
      variantId: orderItems.variantId,
      itemName: orderItems.itemName,
      variantLabel: orderItems.variantLabel,
      qty: orderItems.qty,
      revenue: orderItems.lineTotal,
      category: menuItems.category,
      station: menuItems.station,
      productType: menuItems.productType,
      unitHpp: menuVariants.baseCost,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .leftJoin(menuVariants, and(eq(menuVariants.itemId, orderItems.menuItemId), eq(menuVariants.variantId, orderItems.variantId)))
    .where(where);
  return rows.map((row) => ({
    menuItemId: row.menuItemId,
    variantId: row.variantId,
    itemName: row.itemName,
    variantLabel: row.variantLabel,
    category: row.category,
    station: row.station,
    productType: row.productType,
    qty: Number(row.qty) || 0,
    revenue: Number(row.revenue) || 0,
    unitHpp: row.unitHpp === null ? null : Number(row.unitHpp),
  }));
}

/** Penjualan LUNAS dari order tertentu (mis. order satu shift kasir). */
export async function salesHppForOrders(orderIds: string[]) {
  if (!orderIds.length) return summarizeSalesHpp([]);
  return summarizeSalesHpp(await loadLines(and(inArray(orders.id, orderIds), eq(orders.status, "paid"))));
}

/**
 * Penjualan satu shift kasir: order LUNAS yang pembayaran captured TERAKHIRNYA masuk sesi kas ini. Bill yang dibuat di
 * shift A tapi dibayar di shift B hanya dihitung di shift B (tidak dobel antar shift).
 */
export async function salesHppForCashSession(sessionId: string) {
  const db = getDb();
  const touched = await db
    .selectDistinct({ orderId: payments.orderId })
    .from(payments)
    .where(and(eq(payments.cashSessionId, sessionId), eq(payments.status, "captured")));
  const candidateIds = touched.map((row) => row.orderId).filter((id): id is string => Boolean(id));
  if (!candidateIds.length) return summarizeSalesHpp([]);
  const captured = await db
    .select({ orderId: payments.orderId, cashSessionId: payments.cashSessionId, createdAt: payments.createdAt })
    .from(payments)
    .where(and(inArray(payments.orderId, candidateIds), eq(payments.status, "captured")));
  const latest = new Map<string, { sessionId: string | null; at: number }>();
  for (const row of captured) {
    if (!row.orderId) continue;
    const at = row.createdAt.getTime();
    const prev = latest.get(row.orderId);
    if (!prev || at >= prev.at) latest.set(row.orderId, { sessionId: row.cashSessionId, at });
  }
  return salesHppForOrders(candidateIds.filter((id) => latest.get(id)?.sessionId === sessionId));
}

/** Penjualan LUNAS satu hari bisnis (batas hari sama dengan Finance). */
export async function salesHppForDay(dateKey: string) {
  const policy = await loadBusinessDayPolicy();
  const start = jakartaDayStart(dateKey, policy);
  const end = jakartaDayStart(addDays(dateKey, 1), policy);
  return summarizeSalesHpp(await loadLines(and(eq(orders.status, "paid"), gte(orders.createdAt, start), lt(orders.createdAt, end))));
}

export class DailyBankReportError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const MAX_DAILY_BANK_DAYS = 62;

/**
 * Laporan Harian Rekening Bersama per tanggal: angka Finance (omzet, upah, biaya operasional, uang masuk per metode;
 * angka Daily Closing bila sudah dikunci) + HPP produk terjual dari varian.
 */
export async function getDailyBankReports(fromKey: string, toKey: string): Promise<DailyBankReport[]> {
  if (toKey < fromKey) throw new DailyBankReportError("INVALID_RANGE", "Tanggal akhir sebelum tanggal awal.");
  const days = eachDay(fromKey, toKey);
  if (days.length > MAX_DAILY_BANK_DAYS) throw new DailyBankReportError("RANGE_TOO_LONG", `Maksimal ${MAX_DAILY_BANK_DAYS} hari per laporan.`);
  const config = await loadFinanceConfig();
  const todayKey = jakartaDateKey(new Date(), config.businessDay);
  if (fromKey > todayKey) throw new DailyBankReportError("FUTURE_DATE", "Tanggal belum terjadi.");
  const lastKey = toKey > todayKey ? todayKey : toKey;
  const figures = await getDayFigures(fromKey, lastKey, config, todayKey);
  // Hari yang di-Daily Closing memakai ringkasan HPP produk yang dibekukan saat closing (HPP bahan bisa berubah sesudahnya).
  const closings = await getDb()
    .select({ date: financeDailyClosings.date, status: financeDailyClosings.status, figures: financeDailyClosings.figures })
    .from(financeDailyClosings)
    .where(and(gte(financeDailyClosings.date, fromKey), lte(financeDailyClosings.date, lastKey)));
  const frozenSales = new Map<string, SalesHppSummary>();
  for (const row of closings) {
    const productSales = (row.figures as { productSales?: SalesHppSummary } | null)?.productSales;
    if (row.status === "closed" && productSales?.totals) frozenSales.set(String(row.date), productSales);
  }
  const reports: DailyBankReport[] = [];
  for (const figure of figures) {
    const frozen = frozenSales.get(figure.date);
    reports.push(buildDailyBankReport(figure, frozen ?? (await salesHppForDay(figure.date)), { hppFrozen: Boolean(frozen) }));
  }
  return reports;
}
