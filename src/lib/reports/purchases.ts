// Laporan Pembelian Bahan Baku per divisi (Bar / Kitchen).
// Sumber: penerimaan gudang WMS yang selesai (satu pintu belanja bahan) +
// Barang Masuk Supplier lama untuk bahan non-gudang. Divisi diambil per baris
// dari area kategori bahan — aturan yang sama dengan pencatatan belanja kas
// (`recordCashPurchases`), sehingga total laporan = "Belanja Bar/Dapur" di
// Keuangan (dicek ulang di ringkasan: "Tercatat di Keuangan").
import { businessDateKey } from "@/lib/business-date";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { and, eq, gte, like, lt, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenses,
  inventoryItems,
  supplierReceivingItems,
  supplierReceivings,
  suppliers,
  wmsCategory,
  wmsProduct,
  wmsReceiving,
  wmsReceivingItem,
} from "@/db/schema";
import { PURCHASE_CATEGORY, purchaseAreaOf } from "@/lib/finance-purchases";
import { formatRupiah, periodLabelFor, sumRows, type ReportColumn, type ReportDoc, type ReportRow } from "@/lib/report-engine";
import {
  areaLabel,
  areaMatchesDivision,
  DIVISION_LABEL,
  rangeBounds,
  round4,
  type ReportDivision,
  type ReportRange,
} from "@/lib/reports/common";

export type PurchaseLine = {
  date: string;
  doc: string;
  supplier: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  extraCost: number;
  total: number;
  area: "bar" | "dapur" | "umum";
  paymentStatus: string;
};

/** Baris pembelian (sudah dibagi biaya tambahan proporsional seperti saat posting). */
export async function listPurchaseLines(range: ReportRange): Promise<PurchaseLine[]> {
  const db = getDb();
  const businessDay = await loadBusinessDayPolicy();
  const { start, end } = rangeBounds(range, businessDay);
  const receivedKey = sql<string>`coalesce(${wmsReceiving.receivedDate}, (${wmsReceiving.completedAt} at time zone 'Asia/Jakarta')::date)`;

  const wmsRows = await db
    .select({
      receivingId: wmsReceiving.id,
      doc: wmsReceiving.doc,
      poNumber: wmsReceiving.poNumber,
      supplier: wmsReceiving.supplier,
      additionalCost: wmsReceiving.additionalCost,
      paymentMethod: wmsReceiving.paymentMethod,
      receivedDate: sql<string>`to_char(${receivedKey}, 'YYYY-MM-DD')`,
      sku: wmsProduct.sku,
      name: wmsProduct.name,
      unit: wmsProduct.unit,
      area: wmsCategory.area,
      receivedQty: wmsReceivingItem.receivedQty,
      hpp: wmsReceivingItem.hpp,
      buyQty: wmsReceivingItem.buyQty,
      packSize: wmsReceivingItem.packSize,
      buyUnit: wmsReceivingItem.buyUnit,
      qc: wmsReceivingItem.qc,
      productId: wmsReceivingItem.productId,
    })
    .from(wmsReceivingItem)
    .innerJoin(wmsReceiving, eq(wmsReceiving.id, wmsReceivingItem.receivingId))
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsReceivingItem.productId))
    .leftJoin(wmsCategory, sql`lower(trim(${wmsCategory.name})) = lower(trim(${wmsProduct.category}))`)
    .where(
      and(
        eq(wmsReceiving.status, "completed"),
        sql`${receivedKey} >= ${range.from}::date`,
        sql`${receivedKey} <= ${range.to}::date`,
      ),
    );

  // Baris yang diterima = sama dengan completeReceiving (bukan reject, qty > 0).
  const accepted = wmsRows.filter((row) => row.productId && row.qc !== "reject" && Number(row.receivedQty) > 0);
  const valueByReceiving = new Map<string, number>();
  for (const row of accepted) {
    valueByReceiving.set(row.receivingId, (valueByReceiving.get(row.receivingId) ?? 0) + Number(row.receivedQty) * Number(row.hpp));
  }

  const lines: PurchaseLine[] = [];
  for (const row of accepted) {
    const qty = Number(row.receivedQty);
    const value = qty * Number(row.hpp);
    const receivingValue = valueByReceiving.get(row.receivingId) ?? 0;
    const additional = Number(row.additionalCost ?? 0);
    const share = additional > 0 && receivingValue > 0 ? (additional * value) / receivingValue : 0;
    // Tampilkan dalam satuan beli (mis. 2 pak @ Rp95.000) bila diisi saat penerimaan.
    const buyQty = Number(row.buyQty ?? 0);
    const packSize = Number(row.packSize ?? 0);
    const useBuyUnit = buyQty > 0 && packSize > 0 && Boolean(row.buyUnit?.trim());
    lines.push({
      date: row.receivedDate,
      doc: row.poNumber?.trim() ? `${row.doc} / ${row.poNumber.trim()}` : row.doc,
      supplier: row.supplier?.trim() || "Tanpa supplier",
      sku: row.sku ?? "-",
      name: row.name ?? "(bahan dihapus)",
      unit: useBuyUnit ? `${row.buyUnit!.trim()} (${round4(packSize)} ${row.unit ?? ""})`.trim() : (row.unit ?? ""),
      qty: useBuyUnit ? round4(buyQty) : round4(qty),
      unitPrice: useBuyUnit ? Number(row.hpp) * packSize : Number(row.hpp),
      extraCost: share,
      total: value + share,
      area: purchaseAreaOf(row.area),
      paymentStatus: `Lunas · ${row.paymentMethod || "Cash"}`,
    });
  }
  // Biaya tambahan tanpa nilai barang → dicatat ke Belanja Umum (sama dengan posting).
  const seen = new Set<string>();
  for (const row of wmsRows) {
    if (seen.has(row.receivingId)) continue;
    seen.add(row.receivingId);
    const additional = Number(row.additionalCost ?? 0);
    if (additional > 0 && (valueByReceiving.get(row.receivingId) ?? 0) <= 0) {
      lines.push({
        date: row.receivedDate,
        doc: row.doc,
        supplier: row.supplier?.trim() || "Tanpa supplier",
        sku: "-",
        name: "Biaya tambahan (ongkir/lainnya)",
        unit: "",
        qty: 1,
        unitPrice: additional,
        extraCost: 0,
        total: additional,
        area: "umum",
        paymentStatus: `Lunas · ${row.paymentMethod || "Cash"}`,
      });
    }
  }

  const osRows = await db
    .select({
      code: supplierReceivings.code,
      invoiceNo: supplierReceivings.invoiceNo,
      receivedAt: supplierReceivings.receivedAt,
      supplier: suppliers.name,
      sku: supplierReceivingItems.itemSku,
      name: supplierReceivingItems.itemName,
      unit: supplierReceivingItems.unit,
      qty: supplierReceivingItems.qty,
      unitCost: supplierReceivingItems.unitCost,
      lineTotal: supplierReceivingItems.lineTotal,
      usageArea: inventoryItems.usageArea,
    })
    .from(supplierReceivingItems)
    .innerJoin(supplierReceivings, eq(supplierReceivings.id, supplierReceivingItems.receivingId))
    .leftJoin(suppliers, eq(suppliers.id, supplierReceivings.supplierId))
    .leftJoin(inventoryItems, eq(inventoryItems.sku, supplierReceivingItems.itemSku))
    .where(
      and(
        eq(supplierReceivings.status, "posted"),
        gte(supplierReceivings.receivedAt, start),
        lt(supplierReceivings.receivedAt, end),
      ),
    );
  for (const row of osRows) {
    lines.push({
      date: businessDateKey(row.receivedAt, businessDay),
      doc: row.invoiceNo ? `${row.code} / ${row.invoiceNo}` : row.code,
      supplier: row.supplier?.trim() || "Tanpa supplier",
      sku: row.sku ?? "-",
      name: row.name,
      unit: row.unit,
      qty: round4(Number(row.qty)),
      unitPrice: Number(row.unitCost),
      extraCost: 0,
      total: Number(row.lineTotal),
      area: purchaseAreaOf(row.usageArea),
      paymentStatus: "Lunas · Cash",
    });
  }

  return lines.sort((a, b) => a.date.localeCompare(b.date) || a.doc.localeCompare(b.doc) || a.name.localeCompare(b.name));
}

/** Total belanja bahan per area yang tercatat di Keuangan (expense ber-sourceDoc). */
async function recordedPurchaseByArea(range: ReportRange) {
  const db = getDb();
  const businessDay = await loadBusinessDayPolicy();
  const { start, end } = rangeBounds(range, businessDay);
  const rows = await db
    .select({ category: expenses.category, amount: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      and(
        or(like(expenses.sourceDoc, "WMS:%"), like(expenses.sourceDoc, "OS:%")),
        ne(expenses.status, "void"),
        ne(expenses.status, "cancelled"),
        gte(expenses.expenseDate, start),
        lt(expenses.expenseDate, end),
      ),
    )
    .groupBy(expenses.category);
  const byArea = { bar: 0, dapur: 0, umum: 0 };
  for (const row of rows) {
    for (const [area, name] of Object.entries(PURCHASE_CATEGORY) as Array<[keyof typeof byArea, string]>) {
      if (name === row.category) byArea[area] += Number(row.amount);
    }
  }
  return byArea;
}

export async function buildPurchaseReport(input: {
  range: ReportRange;
  division: ReportDivision;
  outletName?: string | null;
}): Promise<ReportDoc> {
  const all = await listPurchaseLines(input.range);
  const lines = all.filter((line) => areaMatchesDivision(line.area, input.division));
  const withDivision = input.division === "semua";

  const detailColumns: ReportColumn[] = [
    { key: "date", label: "Tanggal", type: "date", weight: 1.1 },
    { key: "supplier", label: "Supplier", type: "text", weight: 1.4 },
    { key: "doc", label: "Dokumen", type: "text", weight: 1.5 },
    ...(withDivision ? [{ key: "division", label: "Divisi", type: "text" as const, weight: 0.8 }] : []),
    { key: "sku", label: "SKU", type: "text", weight: 0.9 },
    { key: "name", label: "Nama bahan", type: "text", weight: 1.8 },
    { key: "unit", label: "Satuan", type: "text", weight: 0.9 },
    { key: "qty", label: "Qty", type: "qty", weight: 0.7, noSum: true },
    { key: "unitPrice", label: "Harga satuan", type: "price", weight: 1 },
    { key: "extraCost", label: "Biaya tambahan", type: "money", weight: 1 },
    { key: "total", label: "Total", type: "money", weight: 1.1 },
    { key: "paymentStatus", label: "Status bayar", type: "text", weight: 1.1 },
  ];
  const detailRows: ReportRow[] = lines.map((line) => ({
    date: line.date,
    supplier: line.supplier,
    doc: line.doc,
    division: areaLabel(line.area),
    sku: line.sku,
    name: line.name,
    unit: line.unit,
    qty: line.qty,
    unitPrice: line.unitPrice,
    extraCost: Math.round(line.extraCost),
    total: Math.round(line.total),
    paymentStatus: line.paymentStatus,
  }));

  const bySupplier = new Map<string, { supplier: string; docs: Set<string>; lines: number; total: number }>();
  const byDate = new Map<string, { date: string; docs: Set<string>; lines: number; total: number }>();
  for (const line of lines) {
    const s = bySupplier.get(line.supplier) ?? { supplier: line.supplier, docs: new Set<string>(), lines: 0, total: 0 };
    s.docs.add(line.doc);
    s.lines += 1;
    s.total += line.total;
    bySupplier.set(line.supplier, s);
    const d = byDate.get(line.date) ?? { date: line.date, docs: new Set<string>(), lines: 0, total: 0 };
    d.docs.add(line.doc);
    d.lines += 1;
    d.total += line.total;
    byDate.set(line.date, d);
  }
  const recapColumns = (first: ReportColumn): ReportColumn[] => [
    first,
    { key: "docs", label: "Dokumen", type: "int" },
    { key: "lines", label: "Baris bahan", type: "int" },
    { key: "total", label: "Total belanja", type: "money" },
  ];
  const supplierColumns = recapColumns({ key: "supplier", label: "Supplier", type: "text", weight: 2 });
  const supplierRows = [...bySupplier.values()]
    .sort((a, b) => b.total - a.total)
    .map((s) => ({ supplier: s.supplier, docs: s.docs.size, lines: s.lines, total: Math.round(s.total) }));
  const dateColumns = recapColumns({ key: "date", label: "Tanggal", type: "date" });
  const dateRows = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, docs: d.docs.size, lines: d.lines, total: Math.round(d.total) }));

  const grand = detailRows.reduce((sum, row) => sum + Number(row.total), 0);
  const extra = detailRows.reduce((sum, row) => sum + Number(row.extraCost), 0);
  const recorded = await recordedPurchaseByArea(input.range);
  const recordedForDivision =
    input.division === "bar" ? recorded.bar : input.division === "kitchen" ? recorded.dapur : recorded.bar + recorded.dapur + recorded.umum;

  const summary: ReportDoc["summary"] = [
    { label: "Total pembelian", value: formatRupiah(grand) },
    { label: "Dokumen penerimaan", value: String(new Set(lines.map((l) => l.doc)).size) },
    { label: "Supplier", value: String(bySupplier.size) },
    { label: "Baris bahan", value: String(lines.length) },
    { label: "Biaya tambahan (ongkir)", value: formatRupiah(extra) },
    { label: "Tercatat di Keuangan", value: formatRupiah(recordedForDivision) },
  ];
  if (withDivision) {
    const per = (area: PurchaseLine["area"]) => lines.filter((l) => l.area === area).reduce((s, l) => s + Math.round(l.total), 0);
    summary.splice(1, 0, { label: "Bar", value: formatRupiah(per("bar")) }, { label: "Kitchen", value: formatRupiah(per("dapur")) }, { label: "Umum", value: formatRupiah(per("umum")) });
  }

  const notes = [
    "Sumber: penerimaan gudang (status selesai) per tanggal barang diterima + Barang Masuk Supplier untuk bahan non-gudang.",
    "Divisi per baris mengikuti area kategori bahan (Bar / Dapur = Kitchen / Umum).",
    "Harga satuan dalam satuan beli bila diisi saat penerimaan; biaya tambahan dibagi proporsional nilai barang.",
    "Semua belanja bahan dibayar langsung (tidak ada hutang supplier).",
  ];
  if (Math.abs(recordedForDivision - grand) > detailRows.length + 1) {
    notes.push(
      `Perhatian: total laporan (${formatRupiah(grand)}) berbeda dengan belanja tercatat di Keuangan (${formatRupiah(recordedForDivision)}). Periksa penerimaan yang dibatalkan atau tanggal terima.`,
    );
  }

  return {
    title: "Laporan Pembelian Bahan Baku",
    division: input.division === "semua" ? null : DIVISION_LABEL[input.division],
    periodLabel: periodLabelFor(input.range.from, input.range.to),
    outletName: input.outletName ?? null,
    generatedAt: new Date().toISOString(),
    summary,
    tables: [
      {
        title: "Rincian pembelian",
        columns: detailColumns,
        rows: detailRows,
        totals: sumRows(detailRows, detailColumns, { key: "date", text: "TOTAL" }),
      },
      { title: "Rekap per supplier", columns: supplierColumns, rows: supplierRows, totals: sumRows(supplierRows, supplierColumns, { key: "supplier", text: "TOTAL" }) },
      { title: "Rekap per tanggal", columns: dateColumns, rows: dateRows, totals: sumRows(dateRows, dateColumns, { key: "date", text: "TOTAL" }) },
    ],
    notes,
  };
}
