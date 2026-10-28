// Laporan Penjualan untuk ekspor (harian/mingguan/bulanan/tahunan). Angka
// diambil dari getSalesReport — sumber yang sama dengan layar Laporan Penjualan.
import { businessDateKey } from "@/lib/business-date";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { and, gte, like, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { formatRupiah, periodLabelFor, sumRows, type ReportColumn, type ReportDoc, type ReportRow } from "@/lib/report-engine";
import { rangeBounds, type ReportRange } from "@/lib/reports/common";
import { getSalesReport, type SalesGranularity } from "@/lib/sales-report";

export const GRANULARITY_LABEL: Record<SalesGranularity, string> = {
  day: "Harian",
  week: "Mingguan",
  month: "Bulanan",
  year: "Tahunan",
};

/** Refund sebagian/penuh dalam periode (nilai dari jejak audit refund). */
async function listRefunds(range: ReportRange) {
  const businessDay = await loadBusinessDayPolicy();
  const { start, end } = rangeBounds(range, businessDay);
  const rows = await getDb()
    .select({ createdAt: auditLogs.createdAt, action: auditLogs.action, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(and(like(auditLogs.action, "Refund item %"), gte(auditLogs.createdAt, start), lt(auditLogs.createdAt, end)));
  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as { orderNo?: string; refundAmount?: number };
    return {
      orderNo: meta.orderNo ?? row.action.replace("Refund item ", ""),
      date: businessDateKey(row.createdAt, businessDay),
      amount: Number(meta.refundAmount ?? 0),
    };
  });
}

export async function buildSalesExportReport(input: {
  outletId: string;
  outletName?: string | null;
  range: ReportRange;
  granularity: SalesGranularity;
}): Promise<ReportDoc> {
  const report = await getSalesReport({ outletId: input.outletId, range: input.range, granularity: input.granularity });
  const refunds = await listRefunds(input.range);
  const refundValue = refunds.reduce((sum, r) => sum + r.amount, 0);
  const s = report.summary;

  const groupColumns = (label: string, withQty: boolean): ReportColumn[] => [
    { key: "label", label, type: "text", weight: 2 },
    ...(withQty ? [{ key: "qty", label: "Qty", type: "int" as const }] : [{ key: "count", label: "Transaksi", type: "int" as const }]),
    { key: "revenue", label: "Omzet", type: "money" },
    { key: "share", label: "Porsi", type: "pct" },
  ];
  const groupRows = (rows: Array<{ label: string; qty: number; count: number; revenue: number }>, total: number) =>
    rows.map((row) => ({ label: row.label, qty: row.qty, count: row.count, revenue: row.revenue, share: total > 0 ? (row.revenue / total) * 100 : 0 }));
  const groupTable = (title: string, label: string, rows: Array<{ label: string; qty: number; count: number; revenue: number }>, withQty = false) => {
    const total = rows.reduce((sum, row) => sum + row.revenue, 0);
    const columns = groupColumns(label, withQty);
    const data = groupRows(rows, total);
    return { title, columns, rows: data, totals: data.length ? { ...sumRows(data, columns, { key: "label", text: "TOTAL" }), share: 100 } : undefined };
  };

  const periodColumns: ReportColumn[] = [
    { key: "label", label: "Periode", type: "text", weight: 1.6 },
    { key: "transactions", label: "Transaksi", type: "int" },
    { key: "subtotal", label: "Penjualan kotor", type: "money" },
    { key: "discount", label: "Diskon", type: "money" },
    { key: "netSales", label: "Penjualan bersih", type: "money" },
    { key: "deliveryFee", label: "Ongkir", type: "money" },
    { key: "total", label: "Omzet (dibayar)", type: "money" },
  ];
  const periodRows: ReportRow[] = report.periods.map((p) => ({
    label: input.granularity === "day" ? p.key : p.label,
    transactions: p.transactions,
    subtotal: p.subtotal,
    discount: p.discount,
    netSales: p.subtotal - p.discount,
    deliveryFee: p.deliveryFee,
    total: p.total,
  }));
  if (input.granularity === "day") {
    // Kolom periode harian bertipe tanggal agar tampil "13 Okt 2026".
    periodColumns[0] = { key: "label", label: "Tanggal", type: "date", weight: 1.2 };
  }

  const txColumns: ReportColumn[] = [
    { key: "date", label: "Tanggal", type: "date" },
    { key: "time", label: "Jam", type: "text", weight: 0.6 },
    { key: "orderNo", label: "No. order", type: "text", weight: 1.2 },
    { key: "channel", label: "Tipe", type: "text", weight: 0.9 },
    { key: "cashier", label: "Kasir", type: "text", weight: 1.1 },
    { key: "shift", label: "Shift", type: "text", weight: 1 },
    { key: "method", label: "Metode bayar", type: "text", weight: 1.1 },
    { key: "subtotal", label: "Subtotal", type: "money" },
    { key: "discount", label: "Diskon", type: "money" },
    { key: "deliveryFee", label: "Ongkir", type: "money" },
    { key: "total", label: "Total", type: "money" },
  ];
  const txRows = report.transactions as unknown as ReportRow[];
  const discountRows = txRows.filter((row) => Number(row.discount) > 0);
  const discountColumns = txColumns.filter((c) => ["date", "orderNo", "cashier", "subtotal", "discount", "total"].includes(c.key));

  const cancelColumns: ReportColumn[] = [
    { key: "date", label: "Tanggal", type: "date" },
    { key: "orderNo", label: "No. order", type: "text", weight: 1.3 },
    { key: "status", label: "Status", type: "text" },
    { key: "channel", label: "Tipe", type: "text" },
    { key: "total", label: "Nilai", type: "money" },
  ];
  const cancelRows: ReportRow[] = [
    ...report.cancellations.filter((c) => c.status !== "Refund"),
    ...refunds.map((r) => ({ orderNo: r.orderNo, date: r.date, status: "Refund", channel: "-", total: r.amount })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    title: `Laporan Penjualan ${GRANULARITY_LABEL[input.granularity]}`,
    division: null,
    periodLabel: periodLabelFor(input.range.from, input.range.to),
    outletName: input.outletName ?? null,
    generatedAt: new Date().toISOString(),
    summary: [
      { label: "Omzet (dibayar)", value: formatRupiah(s.gross) },
      { label: "Penjualan kotor (menu)", value: formatRupiah(s.subtotal) },
      { label: "Diskon", value: formatRupiah(s.discount) },
      { label: "Penjualan bersih", value: formatRupiah(s.netSales) },
      { label: "Ongkir", value: formatRupiah(s.deliveryFee) },
      { label: "Transaksi", value: new Intl.NumberFormat("id-ID").format(s.transactions) },
      { label: "Rata-rata per struk", value: formatRupiah(s.averageTicket) },
      { label: "Item terjual", value: new Intl.NumberFormat("id-ID").format(s.itemsSold) },
      { label: "Void / batal", value: `${s.voidCount} · ${formatRupiah(s.voidValue)}` },
      { label: "Refund", value: `${refunds.length} · ${formatRupiah(refundValue)}` },
    ],
    tables: [
      { title: `Rekap ${GRANULARITY_LABEL[input.granularity].toLowerCase()}`, columns: periodColumns, rows: periodRows, totals: periodRows.length ? sumRows(periodRows, periodColumns, { key: "label", text: "TOTAL" }) : undefined },
      groupTable("Produk terlaris", "Produk", report.products, true),
      groupTable("Per kategori", "Kategori", report.categories, true),
      groupTable("Per kasir", "Kasir", report.cashiers),
      groupTable("Per shift", "Shift", report.shifts),
      groupTable("Metode pembayaran", "Metode", report.paymentMethods),
      groupTable("Tipe pesanan", "Tipe", report.orderTypes),
      { title: "Diskon", columns: discountColumns, rows: discountRows, totals: discountRows.length ? sumRows(discountRows, discountColumns, { key: "date", text: "TOTAL" }) : undefined },
      { title: "Pembatalan & refund", columns: cancelColumns, rows: cancelRows, totals: cancelRows.length ? sumRows(cancelRows, cancelColumns, { key: "date", text: "TOTAL" }) : undefined },
      { title: "Detail transaksi", columns: txColumns, rows: txRows, totals: txRows.length ? sumRows(txRows, txColumns, { key: "date", text: "TOTAL" }) : undefined },
    ],
    notes: [
      "Hanya order berstatus lunas dalam periode (tanggal order, WIB). Omzet = total dibayar termasuk ongkir.",
      "Penjualan bersih = penjualan menu − diskon (tanpa ongkir). Pajak & service 0%.",
      "Metode bayar per kasir/shift = penerima pembayaran. Order split bayar tampil sebagai gabungan metode.",
      "Refund dicatat pada tanggal refund; order yang di-refund sebagian tetap terhitung dengan total setelah refund.",
    ],
  };
}
