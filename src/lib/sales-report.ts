// =============================================================================
// Laporan Penjualan (owner, Okt 2026): rentang tanggal WIB, per produk, kategori,
// metode bayar, jam, kasir, tipe order + diskon & void/refund.
//   Owner/Manajer → seluruh outlet.
//   Kasir         → hanya shift miliknya (sessionId), tanpa angka kas laci.
// Sumber: orders + order_items + payments (kasir = pemilik sesi kas penerima
// pembayaran, jadi order QR yang dibayar di kasir ikut terhitung).
// =============================================================================

import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { cashSessions, menuItems, orderItems, orders, payments, user } from "@/db/schema";
import { isCalendarDateKey } from "@/lib/date-range";
import { CHANNEL_GROUP_LABEL, channelGroupOf } from "@/lib/payment-status";

export type SalesReportRange = { from: string; to: string };

export type SalesReportOrder = {
  id: string;
  orderNo: string;
  status: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  channel: string;
  /** Sumber & fulfillment untuk jenis pesanan (Dine-in kasir/Menu digital/Take away/Delivery). */
  orderSource?: string | null;
  fulfillment?: string | null;
  createdAt: Date;
};

export type SalesReportPayment = {
  orderId: string;
  method: string;
  amount: number;
  status: string;
  cashierName: string | null;
  /** Kode shift kas penerima pembayaran (opsional, untuk rekap per shift). */
  shiftCode?: string | null;
};

export type SalesGranularity = "day" | "week" | "month" | "year";

/** Tanggal kalender WIB (YYYY-MM-DD) dari Date. */
export function wibDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

/** Kunci & label periode rekap (minggu = Senin–Minggu, ISO). */
export function periodBucket(dateKey: string, granularity: SalesGranularity) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (granularity === "year") return { key: String(y), label: String(y) };
  if (granularity === "month") {
    const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
    return { key: `${y}-${String(m).padStart(2, "0")}`, label };
  }
  if (granularity === "week") {
    const date = new Date(Date.UTC(y, m - 1, d));
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000);
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const key = monday.toISOString().slice(0, 10);
    return { key, label: `${key} s/d ${sunday.toISOString().slice(0, 10)}` };
  }
  return { key: dateKey, label: dateKey };
}

export type SalesReportItem = {
  orderId: string;
  itemName: string;
  variantLabel: string;
  category: string | null;
  qty: number;
  lineTotal: number;
};

type Row = { key: string; label: string; qty: number; count: number; revenue: number };

const PAID = "paid";
const VOID_STATUSES = new Set(["voided", "void", "cancelled", "rejected"]);

export function paymentMethodGroup(method: string): string {
  const value = method.toLowerCase();
  if (value.includes("cash") || value.includes("tunai")) return "Tunai";
  if (value.includes("qris")) return "QRIS";
  if (value.includes("transfer") || value.includes("bank")) return "Transfer";
  if (value.includes("wallet")) return "E-Wallet";
  if (value.includes("card") || value.includes("kartu") || value.includes("debit")) return "Kartu";
  return method || "Lainnya";
}

function wibHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(date),
  ) % 24;
}

function bump(map: Map<string, Row>, key: string, label: string, qty: number, revenue: number, count = 1) {
  const row = map.get(key) ?? { key, label, qty: 0, count: 0, revenue: 0 };
  row.qty += qty;
  row.count += count;
  row.revenue += revenue;
  map.set(key, row);
}

const byRevenue = (a: Row, b: Row) => b.revenue - a.revenue || b.qty - a.qty;

/** Agregasi murni (diuji unit) dari baris order/item/pembayaran. */
export function aggregateSalesReport(input: {
  orders: SalesReportOrder[];
  items: SalesReportItem[];
  payments: SalesReportPayment[];
  granularity?: SalesGranularity;
}) {
  const paidOrders = input.orders.filter((order) => order.status === PAID);
  const paidIds = new Set(paidOrders.map((order) => order.id));
  const voidOrders = input.orders.filter((order) => VOID_STATUSES.has(order.status));
  const refundedOrders = input.orders.filter((order) => order.status === "refunded");

  const gross = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const subtotal = paidOrders.reduce((sum, order) => sum + order.subtotal, 0);
  const discount = paidOrders.reduce((sum, order) => sum + order.discount, 0);
  const deliveryFee = paidOrders.reduce((sum, order) => sum + order.deliveryFee, 0);

  const products = new Map<string, Row>();
  const categories = new Map<string, Row>();
  let itemsSold = 0;
  for (const item of input.items) {
    if (!paidIds.has(item.orderId)) continue;
    itemsSold += item.qty;
    const variant = item.variantLabel && item.variantLabel !== "Regular" ? ` (${item.variantLabel})` : "";
    bump(products, `${item.itemName}|${item.variantLabel}`, `${item.itemName}${variant}`, item.qty, item.lineTotal);
    const category = item.category || "Lainnya";
    bump(categories, category, category, item.qty, item.lineTotal);
  }

  const methods = new Map<string, Row>();
  const cashiers = new Map<string, Row>();
  const cashierByOrder = new Map<string, string>();
  for (const payment of input.payments) {
    if (!paidIds.has(payment.orderId)) continue;
    if (payment.status !== "captured" || payment.amount <= 0) continue;
    const group = paymentMethodGroup(payment.method);
    bump(methods, group, group, 0, payment.amount);
    if (payment.cashierName && !cashierByOrder.has(payment.orderId)) {
      cashierByOrder.set(payment.orderId, payment.cashierName);
    }
  }

  const hours = new Map<string, Row>();
  const orderTypes = new Map<string, Row>();
  for (const order of paidOrders) {
    const hour = wibHour(order.createdAt);
    const key = String(hour).padStart(2, "0");
    bump(hours, key, `${key}.00`, 0, order.total);
    const group = channelGroupOf(order);
    bump(orderTypes, group, CHANNEL_GROUP_LABEL[group], 0, order.total);
    const cashier = cashierByOrder.get(order.id) ?? "Tanpa kasir";
    bump(cashiers, cashier, cashier, 0, order.total);
  }

  // Rekap per periode, per shift, detail transaksi & daftar pembatalan.
  const granularity = input.granularity ?? "day";
  const periods = new Map<string, { key: string; label: string; transactions: number; subtotal: number; discount: number; deliveryFee: number; total: number }>();
  const methodsByOrder = new Map<string, string[]>();
  const shiftByOrder = new Map<string, string>();
  for (const payment of input.payments) {
    if (payment.status !== "captured" || payment.amount <= 0) continue;
    const list = methodsByOrder.get(payment.orderId) ?? [];
    const group = paymentMethodGroup(payment.method);
    if (!list.includes(group)) list.push(group);
    methodsByOrder.set(payment.orderId, list);
    if (payment.shiftCode && !shiftByOrder.has(payment.orderId)) shiftByOrder.set(payment.orderId, payment.shiftCode);
  }
  const shifts = new Map<string, Row>();
  const transactions = paidOrders
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((order) => {
      const dateKey = wibDateKey(order.createdAt);
      const bucket = periodBucket(dateKey, granularity);
      const period = periods.get(bucket.key) ?? { ...bucket, transactions: 0, subtotal: 0, discount: 0, deliveryFee: 0, total: 0 };
      period.transactions += 1;
      period.subtotal += order.subtotal;
      period.discount += order.discount;
      period.deliveryFee += order.deliveryFee;
      period.total += order.total;
      periods.set(bucket.key, period);
      const shift = shiftByOrder.get(order.id) ?? "Tanpa shift";
      bump(shifts, shift, shift, 0, order.total);
      return {
        orderNo: order.orderNo,
        date: dateKey,
        time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(order.createdAt),
        channel: order.channel,
        cashier: cashierByOrder.get(order.id) ?? "-",
        shift,
        method: (methodsByOrder.get(order.id) ?? []).join(" + ") || "-",
        subtotal: order.subtotal,
        discount: order.discount,
        deliveryFee: order.deliveryFee,
        total: order.total,
      };
    });
  const cancellations = [...voidOrders, ...refundedOrders]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((order) => ({
      orderNo: order.orderNo,
      date: wibDateKey(order.createdAt),
      status: VOID_STATUSES.has(order.status) ? "Void/Batal" : "Refund",
      channel: order.channel,
      total: order.total,
    }));

  return {
    granularity,
    periods: [...periods.values()].sort((a, b) => a.key.localeCompare(b.key)),
    shifts: [...shifts.values()].sort(byRevenue),
    transactions,
    cancellations,
    summary: {
      gross,
      netSales: subtotal - discount,
      subtotal,
      discount,
      deliveryFee,
      transactions: paidOrders.length,
      averageTicket: paidOrders.length ? Math.round(gross / paidOrders.length) : 0,
      itemsSold,
      voidCount: voidOrders.length,
      voidValue: voidOrders.reduce((sum, order) => sum + order.total, 0),
      refundCount: refundedOrders.length,
    },
    products: [...products.values()].sort(byRevenue),
    categories: [...categories.values()].sort(byRevenue),
    paymentMethods: [...methods.values()].sort(byRevenue),
    hours: [...hours.values()].sort((a, b) => a.key.localeCompare(b.key)),
    cashiers: [...cashiers.values()].sort(byRevenue),
    orderTypes: [...orderTypes.values()].sort(byRevenue),
  };
}

export type SalesReport = ReturnType<typeof aggregateSalesReport> & {
  range: SalesReportRange;
  scope: "outlet" | "shift";
  sessionCode: string | null;
};

function wibStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+07:00`);
}

export function isDateKey(value: string) {
  return isCalendarDateKey(value);
}

/** Ambil data & susun laporan. `sessionId` = laporan satu shift (Kasir). */
export async function getSalesReport(params: {
  outletId: string;
  range: SalesReportRange;
  sessionId?: string | null;
  granularity?: SalesGranularity;
}): Promise<SalesReport> {
  const db = getDb();
  const start = wibStart(params.range.from);
  const end = new Date(wibStart(params.range.to).getTime() + 24 * 60 * 60_000);

  let sessionCode: string | null = null;
  let orderIdFilter: string[] | null = null;
  if (params.sessionId) {
    const [session] = await db
      .select({ code: cashSessions.code })
      .from(cashSessions)
      .where(and(eq(cashSessions.id, params.sessionId), eq(cashSessions.outletId, params.outletId)))
      .limit(1);
    sessionCode = session?.code ?? null;
    const rows = await db
      .selectDistinct({ orderId: payments.orderId })
      .from(payments)
      .where(eq(payments.cashSessionId, params.sessionId));
    orderIdFilter = rows.map((row) => row.orderId).filter((id): id is string => Boolean(id));
  }

  const orderRows =
    orderIdFilter && orderIdFilter.length === 0
      ? []
      : await db
          .select({
            id: orders.id,
            orderNo: orders.orderNo,
            status: orders.status,
            subtotal: orders.subtotal,
            discount: orders.discount,
            deliveryFee: orders.deliveryFee,
            total: orders.total,
            channel: orders.channel,
            orderSource: orders.orderSource,
            fulfillment: orders.fulfillment,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(
            orderIdFilter
              ? and(eq(orders.outletId, params.outletId), inArray(orders.id, orderIdFilter))
              : and(eq(orders.outletId, params.outletId), gte(orders.createdAt, start), lt(orders.createdAt, end)),
          );

  const ids = orderRows.map((row) => row.id);
  const [itemRows, paymentRows] = ids.length
    ? await Promise.all([
        db
          .select({
            orderId: orderItems.orderId,
            itemName: orderItems.itemName,
            variantLabel: orderItems.variantLabel,
            category: menuItems.category,
            qty: orderItems.qty,
            lineTotal: orderItems.lineTotal,
          })
          .from(orderItems)
          .leftJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
          .where(inArray(orderItems.orderId, ids)),
        db
          .select({
            orderId: payments.orderId,
            method: payments.method,
            amount: payments.amount,
            status: payments.status,
            cashierName: user.name,
            shiftCode: cashSessions.code,
          })
          .from(payments)
          .leftJoin(cashSessions, eq(cashSessions.id, payments.cashSessionId))
          .leftJoin(user, eq(user.id, cashSessions.openedBy))
          .where(inArray(payments.orderId, ids)),
      ])
    : [[], []];

  return {
    range: params.range,
    scope: params.sessionId ? "shift" : "outlet",
    sessionCode,
    ...aggregateSalesReport({
      orders: orderRows,
      items: itemRows,
      payments: paymentRows.flatMap((row): SalesReportPayment[] => (row.orderId ? [{ ...row, orderId: row.orderId }] : [])),
      granularity: params.granularity,
    }),
  };
}
