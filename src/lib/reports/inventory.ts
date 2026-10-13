// Laporan Inventory (stok bahan baku) dari ledger WMS — satu-satunya buku stok
// fisik. Stok awal = jumlah mutasi sebelum periode; stok akhir = stok awal +
// mutasi periode (sama dengan stok gudang saat ini bila periode s/d hari ini).
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { wmsCategory, wmsOpnameLine, wmsProduct, wmsStockMovement, wmsStockOpname, wmsWarehouse } from "@/db/schema";
import { formatRupiah, periodLabelFor, sumRows, type ReportColumn, type ReportDoc, type ReportRow } from "@/lib/report-engine";
import {
  areaLabel,
  areaMatchesDivision,
  DIVISION_LABEL,
  rangeBounds,
  round4,
  wibKey,
  wibTime,
  type ReportDivision,
  type ReportRange,
} from "@/lib/reports/common";

/** Golongan mutasi untuk kolom laporan stok. */
export type MovementBucket = "purchase" | "productionIn" | "productionUse" | "sale" | "transfer" | "waste" | "adjustment" | "other";

export const BUCKET_LABEL: Record<MovementBucket, string> = {
  purchase: "Pembelian",
  productionIn: "Hasil produksi",
  productionUse: "Pemakaian produksi",
  sale: "Penjualan (resep)",
  transfer: "Mutasi antar ruang",
  waste: "Waste",
  adjustment: "Opname / penyesuaian",
  other: "Lainnya",
};

/** Klasifikasi satu baris ledger WMS (pola refDoc dari wms-service & garage-service). */
export function classifyMovement(type: string, refDoc: string, qty: number): MovementBucket {
  const ref = refDoc.trim();
  if (ref.startsWith("PRD-")) return qty > 0 ? "productionIn" : "productionUse";
  if (ref.startsWith("RCV-") || ref.startsWith("BATAL RCV-")) return "purchase";
  if (ref.startsWith("SALE ")) return "sale";
  if (/^(Tolak|Batal|Refund) .*stok dikembalikan/.test(ref)) return "sale";
  if (type === "transfer" || type === "internal_out" || ref.startsWith("TRF-") || ref.startsWith("IO-")) return "transfer";
  if (type === "waste") return "waste";
  if (type === "adjustment") return "adjustment";
  return "other";
}

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  minStock: number;
  hpp: number;
  area: string | null;
  archivedAt: Date | null;
};

export async function buildInventoryReport(input: {
  range: ReportRange;
  division: ReportDivision;
  outletName?: string | null;
}): Promise<ReportDoc> {
  const db = getDb();
  const { start, end } = rangeBounds(input.range);

  const products: ProductRow[] = (
    await db
      .select({
        id: wmsProduct.id,
        sku: wmsProduct.sku,
        name: wmsProduct.name,
        category: wmsProduct.category,
        unit: wmsProduct.unit,
        minStock: wmsProduct.minStock,
        hpp: wmsProduct.hpp,
        area: wmsCategory.area,
        archivedAt: wmsProduct.archivedAt,
      })
      .from(wmsProduct)
      .leftJoin(wmsCategory, sql`lower(trim(${wmsCategory.name})) = lower(trim(${wmsProduct.category}))`)
  )
    .filter((p) => areaMatchesDivision(p.area, input.division))
    .map((p) => ({ ...p, minStock: Number(p.minStock), hpp: Number(p.hpp) }));
  const productIds = new Set(products.map((p) => p.id));

  const openingRows = await db
    .select({ productId: wmsStockMovement.productId, qty: sql<number>`coalesce(sum(${wmsStockMovement.qty}), 0)` })
    .from(wmsStockMovement)
    .where(lt(wmsStockMovement.createdAt, start))
    .groupBy(wmsStockMovement.productId);
  const opening = new Map(openingRows.map((r) => [r.productId, Number(r.qty)]));

  const moves = await db
    .select({
      productId: wmsStockMovement.productId,
      type: wmsStockMovement.type,
      qty: wmsStockMovement.qty,
      valueHpp: wmsStockMovement.valueHpp,
      refDoc: wmsStockMovement.refDoc,
      createdAt: wmsStockMovement.createdAt,
      warehouse: wmsWarehouse.name,
    })
    .from(wmsStockMovement)
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockMovement.warehouseId))
    .where(and(gte(wmsStockMovement.createdAt, start), lt(wmsStockMovement.createdAt, end)))
    .orderBy(wmsStockMovement.createdAt);

  type Agg = Record<MovementBucket, number> & { valueIn: number; valueOut: number };
  const blank = (): Agg => ({
    purchase: 0,
    productionIn: 0,
    productionUse: 0,
    sale: 0,
    transfer: 0,
    waste: 0,
    adjustment: 0,
    other: 0,
    valueIn: 0,
    valueOut: 0,
  });
  const agg = new Map<string, Agg>();
  const productById = new Map(products.map((p) => [p.id, p]));
  const detailRows: ReportRow[] = [];
  for (const move of moves) {
    if (!move.productId || !productIds.has(move.productId)) continue;
    const qty = Number(move.qty);
    const bucket = classifyMovement(move.type, move.refDoc, qty);
    const a = agg.get(move.productId) ?? blank();
    a[bucket] += qty;
    if (qty > 0) a.valueIn += Number(move.valueHpp);
    else a.valueOut += Number(move.valueHpp);
    agg.set(move.productId, a);
    const product = productById.get(move.productId)!;
    detailRows.push({
      date: wibKey(move.createdAt),
      time: wibTime(move.createdAt),
      sku: product.sku,
      name: product.name,
      warehouse: move.warehouse ?? "-",
      bucket: BUCKET_LABEL[bucket],
      ref: move.refDoc || "-",
      qtyIn: qty > 0 ? round4(qty) : null,
      qtyOut: qty < 0 ? round4(-qty) : null,
      unit: product.unit,
      value: Math.round(Number(move.valueHpp)),
    });
  }

  const stockColumns: ReportColumn[] = [
    { key: "sku", label: "SKU", type: "text", weight: 0.9 },
    { key: "name", label: "Nama bahan", type: "text", weight: 1.9 },
    { key: "division", label: "Divisi", type: "text", weight: 0.7 },
    { key: "unit", label: "Satuan", type: "text", weight: 0.6 },
    { key: "opening", label: "Stok awal", type: "qty", noSum: true },
    { key: "stockIn", label: "Masuk", type: "qty", noSum: true },
    { key: "stockOut", label: "Keluar (jual/waste)", type: "qty", noSum: true },
    { key: "productionUse", label: "Pakai produksi", type: "qty", noSum: true },
    { key: "transfer", label: "Mutasi", type: "qty", noSum: true },
    { key: "adjustment", label: "Opname/penyesuaian", type: "qty", noSum: true },
    { key: "closing", label: "Stok akhir", type: "qty", noSum: true },
    { key: "hpp", label: "HPP/satuan", type: "price" },
    { key: "value", label: "Nilai persediaan", type: "money", weight: 1.1 },
  ];
  const stockRows: ReportRow[] = [];
  const critical: ReportRow[] = [];
  let totalValue = 0;
  for (const product of products.sort((a, b) => a.sku.localeCompare(b.sku))) {
    const a = agg.get(product.id) ?? blank();
    const open = opening.get(product.id) ?? 0;
    const closing = round4(open + a.purchase + a.productionIn + a.productionUse + a.sale + a.transfer + a.waste + a.adjustment + a.other);
    const moved = Object.values(a).some((v) => v !== 0);
    // Bahan diarsipkan tanpa stok & tanpa mutasi tidak relevan untuk laporan.
    if (product.archivedAt && !moved && closing === 0) continue;
    const value = Math.max(0, closing) * product.hpp;
    totalValue += value;
    stockRows.push({
      sku: product.sku,
      name: product.name,
      division: areaLabel(product.area),
      unit: product.unit,
      opening: round4(open),
      stockIn: round4(a.purchase + a.productionIn + a.other),
      stockOut: round4(-(a.sale + a.waste)),
      productionUse: round4(-a.productionUse),
      transfer: round4(a.transfer),
      adjustment: round4(a.adjustment),
      closing,
      hpp: product.hpp,
      value: Math.round(value),
    });
    if (closing <= product.minStock) {
      critical.push({
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        closing,
        min: product.minStock,
        shortfall: round4(Math.max(0, product.minStock - closing)),
        status: closing <= 0 ? "Habis" : "Kritis",
      });
    }
  }

  // Opname yang difinalisasi dalam periode: selisih fisik vs sistem.
  const opnameRows = await db
    .select({
      doc: wmsStockOpname.doc,
      createdAt: wmsStockOpname.createdAt,
      status: wmsStockOpname.status,
      warehouse: wmsWarehouse.name,
      productId: wmsOpnameLine.productId,
      systemQty: wmsOpnameLine.systemQty,
      physicalQty: wmsOpnameLine.physicalQty,
      countedAt: wmsOpnameLine.countedAt,
    })
    .from(wmsOpnameLine)
    .innerJoin(wmsStockOpname, eq(wmsStockOpname.id, wmsOpnameLine.opnameId))
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockOpname.warehouseId))
    .where(and(gte(wmsStockOpname.createdAt, start), lt(wmsStockOpname.createdAt, end)));
  const opnameTable: ReportRow[] = [];
  for (const row of opnameRows) {
    if (!row.productId || !productIds.has(row.productId)) continue;
    const product = productById.get(row.productId)!;
    const variance = round4(Number(row.physicalQty) - Number(row.systemQty));
    if (variance === 0 && !row.countedAt) continue;
    opnameTable.push({
      date: wibKey(row.createdAt),
      doc: row.doc,
      status: row.status === "completed" ? "Final" : "Draft",
      warehouse: row.warehouse ?? "-",
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      system: round4(Number(row.systemQty)),
      physical: round4(Number(row.physicalQty)),
      variance,
      varianceValue: Math.round(variance * product.hpp),
    });
  }

  const sumBucket = (key: keyof Agg) => [...agg.values()].reduce((s, a) => s + a[key], 0);
  const opnameColumns: ReportColumn[] = [
    { key: "date", label: "Tanggal", type: "date" },
    { key: "doc", label: "Dokumen", type: "text", weight: 1.4 },
    { key: "status", label: "Status", type: "text", weight: 0.7 },
    { key: "warehouse", label: "Ruang", type: "text" },
    { key: "sku", label: "SKU", type: "text", weight: 0.9 },
    { key: "name", label: "Nama bahan", type: "text", weight: 1.7 },
    { key: "unit", label: "Satuan", type: "text", weight: 0.6 },
    { key: "system", label: "Sistem", type: "qty", noSum: true },
    { key: "physical", label: "Fisik", type: "qty", noSum: true },
    { key: "variance", label: "Selisih", type: "qty", noSum: true },
    { key: "varianceValue", label: "Nilai selisih", type: "money" },
  ];
  const criticalColumns: ReportColumn[] = [
    { key: "sku", label: "SKU", type: "text" },
    { key: "name", label: "Nama bahan", type: "text", weight: 2 },
    { key: "unit", label: "Satuan", type: "text", weight: 0.7 },
    { key: "closing", label: "Stok akhir", type: "qty", noSum: true },
    { key: "min", label: "Minimum", type: "qty", noSum: true },
    { key: "shortfall", label: "Kurang", type: "qty", noSum: true },
    { key: "status", label: "Status", type: "text", weight: 0.7 },
  ];
  const detailColumns: ReportColumn[] = [
    { key: "date", label: "Tanggal", type: "date" },
    { key: "time", label: "Jam", type: "text", weight: 0.6 },
    { key: "sku", label: "SKU", type: "text", weight: 0.9 },
    { key: "name", label: "Nama bahan", type: "text", weight: 1.7 },
    { key: "warehouse", label: "Ruang", type: "text" },
    { key: "bucket", label: "Jenis", type: "text", weight: 1.2 },
    { key: "ref", label: "Referensi", type: "text", weight: 1.6 },
    { key: "qtyIn", label: "Masuk", type: "qty", noSum: true },
    { key: "qtyOut", label: "Keluar", type: "qty", noSum: true },
    { key: "unit", label: "Satuan", type: "text", weight: 0.6 },
    { key: "value", label: "Nilai HPP", type: "money" },
  ];

  const varianceValue = opnameTable.reduce((s, r) => s + Number(r.varianceValue), 0);
  return {
    title: "Laporan Stok Bahan Baku",
    division: input.division === "semua" ? null : DIVISION_LABEL[input.division],
    periodLabel: periodLabelFor(input.range.from, input.range.to),
    outletName: input.outletName ?? null,
    generatedAt: new Date().toISOString(),
    summary: [
      { label: "Nilai persediaan akhir", value: formatRupiah(totalValue) },
      { label: "Jumlah bahan", value: String(stockRows.length) },
      { label: "Stok kritis / habis", value: String(critical.length) },
      { label: "Nilai masuk (HPP)", value: formatRupiah(sumBucket("valueIn")) },
      { label: "Nilai keluar (HPP)", value: formatRupiah(sumBucket("valueOut")) },
      { label: "Nilai selisih opname", value: formatRupiah(varianceValue) },
    ],
    tables: [
      { title: "Posisi stok", columns: stockColumns, rows: stockRows, totals: sumRows(stockRows, stockColumns, { key: "sku", text: "TOTAL" }) },
      { title: "Stok kritis", columns: criticalColumns, rows: critical },
      {
        title: "Opname & selisih",
        columns: opnameColumns,
        rows: opnameTable,
        totals: opnameTable.length ? sumRows(opnameTable, opnameColumns, { key: "date", text: "TOTAL" }) : undefined,
      },
      { title: "Mutasi stok", columns: detailColumns, rows: detailRows },
    ],
    notes: [
      "Sumber: ledger gudang WMS (semua ruang). Stok awal = saldo mutasi sebelum periode.",
      "Masuk = pembelian + hasil produksi + lainnya (pembatalan penerimaan mengurangi Masuk). Keluar = pemakaian resep penjualan (neto retur void/refund) + waste.",
      "Mutasi antar ruang bernilai nol bila dilihat untuk seluruh gudang.",
      "Nilai persediaan = stok akhir × HPP rata-rata saat ini (stok minus dinilai nol). Stok kritis = stok akhir ≤ minimum.",
    ],
  };
}
