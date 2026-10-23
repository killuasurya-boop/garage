import { daysBetween, isCalendarDateKey } from "@/lib/date-range";

export class EventSalesError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "EventSalesError";
  }
}

export type EventSalesOrder = {
  id: string; orderNo: string; status: string; parentOrderId: string | null;
  subtotal: number; discount: number; total: number; createdAt: Date;
};
type Snapshot = {
  entryId: string; entryName: string; kind: "item" | "bundle"; groupId: string;
  entryQuantity: number; unitCost: number | null;
};
export type EventSalesItem = {
  orderId: string; itemName: string; variantLabel: string; qty: number; lineTotal: number;
  eventSnapshot: Snapshot | null;
};
export type EventSalesPayment = {
  orderId: string | null; method: string; amount: number; status: string;
  metadata: Record<string, unknown> | null;
};

const cancelled = new Set(["voided", "void", "cancelled", "rejected", "failed"]);
const nonNegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

/** All money is the CURRENT main-ledger value. Refunds have already reduced
 * order totals and captured payments, so the refund information is not deducted again. */
export function aggregateEventSales(input: {
  orders: EventSalesOrder[]; items: EventSalesItem[]; payments: EventSalesPayment[];
}) {
  const byId = new Map(input.orders.map((row) => [row.id, row]));
  const paid = input.orders.filter((row) => row.status === "paid");
  const paidIds = new Set(paid.map((row) => row.id));
  const eventGrossByOrder = new Map<string, number>();
  for (const item of input.items) if (item.eventSnapshot && item.qty > 0) eventGrossByOrder.set(item.orderId, (eventGrossByOrder.get(item.orderId) ?? 0) + nonNegative(item.lineTotal));
  const eventGross = (order: EventSalesOrder) => eventGrossByOrder.get(order.id) ?? 0;
  const eventDiscount = (order: EventSalesOrder) => order.subtotal > 0 ? Math.min(eventGross(order), Math.round(nonNegative(order.discount) * eventGross(order) / order.subtotal)) : 0;
  const methods = new Map<string, { method: string; captured: number; pending: number; failed: number }>();
  let paidRevenue = 0, pendingAmount = 0, failedAmount = 0, refundAmount = 0, voidReturnAmount = 0;
  for (const payment of input.payments) {
    const order = payment.orderId ? byId.get(payment.orderId) : null;
    if (!order) continue;
    const amount = nonNegative(payment.amount);
    const row = methods.get(payment.method) ?? { method: payment.method, captured: 0, pending: 0, failed: 0 };
    if (payment.status === "captured" && paidIds.has(order.id)) { paidRevenue += amount; row.captured += amount; }
    if (payment.status === "pending" && !cancelled.has(order.status) && order.status !== "refunded") { pendingAmount += amount; row.pending += amount; }
    if (payment.status === "failed") { failedAmount += amount; row.failed += amount; }
    const returned = nonNegative(payment.metadata?.refundedAmount);
    if (payment.status === "voided" || cancelled.has(order.status)) voidReturnAmount += returned;
    else refundAmount += returned;
    methods.set(payment.method, row);
  }

  const entries = new Map<string, {
    id: string; name: string; kind: "item" | "bundle"; submittedUnits: number;
    remainingComponentUnits: number; grossItemSales: number;
  }>();
  const components = new Map<string, { name: string; variant: string; qty: number; grossItemSales: number }>();
  const countedGroups = new Set<string>();
  let componentUnits = 0, knownCost = 0, knownComponentUnits = 0, missingComponentUnits = 0;
  for (const item of input.items) {
    if (!paidIds.has(item.orderId) || item.qty <= 0 || !item.eventSnapshot) continue;
    const order = byId.get(item.orderId)!;
    componentUnits += item.qty;
    const snapshot = item.eventSnapshot;
    const entryId = snapshot?.entryId ?? "unattributed";
    const entry = entries.get(entryId) ?? {
      id: entryId, name: snapshot?.entryName ?? "Item tanpa snapshot event", kind: snapshot?.kind ?? "item",
      submittedUnits: 0, remainingComponentUnits: 0, grossItemSales: 0,
    };
    const group = snapshot ? `${order.parentOrderId ?? order.id}:${snapshot.groupId}:${entryId}` : null;
    if (snapshot && group && !countedGroups.has(group)) {
      entry.submittedUnits += nonNegative(snapshot.entryQuantity);
      countedGroups.add(group);
    }
    entry.remainingComponentUnits += item.qty;
    entry.grossItemSales += item.lineTotal;
    entries.set(entryId, entry);
    const key = `${item.itemName}\u0000${item.variantLabel}`;
    const component = components.get(key) ?? { name: item.itemName, variant: item.variantLabel, qty: 0, grossItemSales: 0 };
    component.qty += item.qty;
    component.grossItemSales += item.lineTotal;
    components.set(key, component);
    if (typeof snapshot?.unitCost === "number" && Number.isFinite(snapshot.unitCost) && snapshot.unitCost >= 0) {
      knownCost += snapshot.unitCost * item.qty;
      knownComponentUnits += item.qty;
    } else missingComponentUnits += item.qty;
  }
  const netSales = paid.reduce((sum, row) => sum + eventGross(row) - eventDiscount(row), 0);
  const completeCost = componentUnits > 0 && missingComponentUnits === 0;
  return {
    summary: {
      originalOrders: new Set(input.orders.map((row) => row.parentOrderId ?? row.id)).size,
      bills: input.orders.length, paidBills: paid.length,
      pendingBills: input.orders.filter((row) => !cancelled.has(row.status) && row.status !== "paid" && row.status !== "refunded").length,
      cancelledBills: input.orders.filter((row) => cancelled.has(row.status)).length,
      refundedBills: input.orders.filter((row) => row.status === "refunded").length,
      grossItemSales: paid.reduce((sum, row) => sum + eventGross(row), 0),
      discounts: paid.reduce((sum, row) => sum + eventDiscount(row), 0),
      netSales, paidRevenue, pendingAmount, failedAmount, refundAmount, voidReturnAmount, componentUnits,
    },
    cost: {
      complete: completeCost, total: completeCost ? knownCost : null, knownSubtotal: knownCost,
      knownComponentUnits, missingComponentUnits,
      grossMargin: completeCost ? netSales - knownCost : null,
      grossMarginPct: completeCost && netSales > 0 ? ((netSales - knownCost) / netSales) * 100 : null,
    },
    entries: [...entries.values()].sort((a, b) => b.grossItemSales - a.grossItemSales || a.name.localeCompare(b.name)),
    components: [...components.values()].sort((a, b) => b.grossItemSales - a.grossItemSales || a.name.localeCompare(b.name)),
    paymentMethods: [...methods.values()].sort((a, b) => b.captured - a.captured),
    orders: input.orders.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    stock: { available: false as const, message: "Pemakaian bahan tetap tercatat di ledger WMS/POS. Jumlah komponen di laporan ini bukan pengurangan stok kedua." },
    notes: [
      "Periode mengikuti tanggal pembuatan order dalam WIB; nilai adalah saldo transaksi terkini, termasuk koreksi/refund setelah tanggal order.",
      "Refund sudah mengurangi nilai order/pembayaran utama. Angka refund disajikan sebagai informasi dan tidak dikurangi dua kali.",
      "Jumlah paket/item dipesan berasal dari snapshot grup; setelah refund sebagian paket, gunakan rincian komponen tersisa untuk rekonsiliasi.",
      "HPP dan margin hanya tersedia bila setiap komponen lunas memiliki snapshot biaya yang valid. Margin kotor bukan laba bersih keuangan.",
      "Penjualan menu dan HPP hanya menghitung item dengan snapshot event. Diskon bill campuran dialokasikan proporsional terhadap subtotal item event, dibulatkan ke rupiah.",
      "Pembayaran diterima/pending/gagal dan refund menunjukkan seluruh bill terkait, termasuk menu reguler pada keranjang campuran; bukan alokasi kas khusus item event.",
    ],
  };
}

export function eventSalesRange(from: string, to: string) {
  if (!isCalendarDateKey(from) || !isCalendarDateKey(to) || from > to) {
    throw new EventSalesError(400, "INVALID_RANGE", "Rentang tanggal tidak valid. Gunakan YYYY-MM-DD, dari sebelum atau sama dengan sampai.");
  }
  if (daysBetween(from, to) + 1 > 93) throw new EventSalesError(400, "RANGE_TOO_LONG", "Rentang laporan maksimal 93 hari.");
  return { start: new Date(`${from}T00:00:00+07:00`), end: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000) };
}

export async function getEventSalesReport(input: { eventId: string; outletId: string; from: string; to: string }) {
  const { and, eq, gte, inArray, lt } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { eventMenuEntries, events, orderItems, orders, payments } = await import("@/db/schema");
  const db = getDb();
  const { start, end } = eventSalesRange(input.from, input.to);
  const [event] = await db.select().from(events).where(eq(events.id, input.eventId)).limit(1);
  if (!event || ((event as { outletId?: string | null }).outletId && (event as { outletId?: string | null }).outletId !== input.outletId)) {
    throw new EventSalesError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan untuk outlet ini.");
  }
  const orderRows = await db.select({
    id: orders.id, orderNo: orders.orderNo, status: orders.status, parentOrderId: orders.parentOrderId,
    subtotal: orders.subtotal, discount: orders.discount, total: orders.total, createdAt: orders.createdAt,
  }).from(orders).where(and(eq(orders.eventId, input.eventId), eq(orders.outletId, input.outletId), gte(orders.createdAt, start), lt(orders.createdAt, end)));
  const ids = orderRows.map((row) => row.id);
  const [itemRows, paymentRows] = ids.length ? await Promise.all([
    db.select({ orderId: orderItems.orderId, itemName: orderItems.itemName, variantLabel: orderItems.variantLabel,
      qty: orderItems.qty, lineTotal: orderItems.lineTotal, eventSnapshot: orderItems.eventSnapshot,
    }).from(orderItems).where(inArray(orderItems.orderId, ids)),
    db.select({ orderId: payments.orderId, method: payments.method, amount: payments.amount, status: payments.status, metadata: payments.metadata })
      .from(payments).where(inArray(payments.orderId, ids)),
  ]) : [[], []];
  // Pemakaian kuota per menu/paket (seluruh event, bukan hanya rentang) — sisa kuota untuk kasir/owner.
  const quotaRows = await db.select({ id: eventMenuEntries.id, name: eventMenuEntries.name, kind: eventMenuEntries.kind, status: eventMenuEntries.status, quota: eventMenuEntries.quota, used: eventMenuEntries.usedQuantity })
    .from(eventMenuEntries).where(eq(eventMenuEntries.eventId, input.eventId));
  return {
    event: { id: event.id, title: event.title, slug: event.slug }, range: { from: input.from, to: input.to },
    ...aggregateEventSales({ orders: orderRows, items: itemRows, payments: paymentRows }),
    quotas: quotaRows.filter((row) => row.status !== "archived").map((row) => ({ ...row, remaining: row.quota === null ? null : Math.max(0, row.quota - row.used) })),
  };
}

export type EventSalesReport = Awaited<ReturnType<typeof getEventSalesReport>>;

/** Formula-leading user labels are escaped for Excel/LibreOffice CSV imports. */
export function eventSalesCsv(report: ReturnType<typeof aggregateEventSales>) {
  const cell = (value: string | number | null) => {
    const text = value == null ? "" : String(value);
    const safe = typeof value === "string" && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows: Array<Array<string | number | null>> = [
    ["Metrik", "Nilai"], ["Penjualan menu sebelum diskon (saldo terkini)", report.summary.grossItemSales],
    ["Diskon", report.summary.discounts], ["Penjualan bersih menu", report.summary.netSales],
    ["Pembayaran seluruh bill terkait (saldo terkini)", report.summary.paidRevenue], ["Pembayaran pending seluruh bill terkait", report.summary.pendingAmount],
    ["Pembayaran gagal", report.summary.failedAmount], ["Refund (sudah diperhitungkan)", report.summary.refundAmount],
    ["Pengembalian karena pembatalan", report.summary.voidReturnAmount], ["HPP snapshot lengkap", report.cost.total],
    ["Margin kotor", report.cost.grossMargin], [],
    ["Menu/Paket", "Jenis", "Unit dipesan (snapshot grup)", "Komponen tersisa", "Penjualan item sebelum diskon"],
    ...report.entries.map((row) => [row.name, row.kind, row.submittedUnits, row.remainingComponentUnits, row.grossItemSales]),
    [], ["Komponen", "Varian", "Qty tersisa", "Penjualan sebelum diskon"],
    ...report.components.map((row) => [row.name, row.variant, row.qty, row.grossItemSales]),
    [], ["Metode pembayaran", "Diterima", "Pending", "Gagal"],
    ...report.paymentMethods.map((row) => [row.method, row.captured, row.pending, row.failed]),
    [], ...report.notes.map((note) => [note]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
