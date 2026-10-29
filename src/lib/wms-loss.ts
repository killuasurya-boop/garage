// Metrik kerugian stok (manajerial, read-only). TIDAK membuat expense / jurnal baru:
// mode keuangan purchase sudah membebankan pembelian; susut/opname hanya informasi kontrol.
//
// Definisi (semua nilai Rupiah, dari nilai yang benar-benar diposting ledger saat finalisasi):
//   grossShortage   = Σ |nilai| baris opname dengan fisik < sistem
//   grossSurplus    = Σ nilai baris opname dengan fisik > sistem
//   recordedWaste   = Σ nilai waste berstatus "recorded" (sudah memotong stok sebelum opname)
//   unexplained     = grossShortage — kekurangan yang TIDAK tercatat sebagai waste.
//                     Surplus bahan lain tidak dipakai untuk "menutupi" kekurangan (tidak di-net).
//   net             = grossSurplus − grossShortage
//   totalLoss       = recordedWaste + unexplained
//   accuracy (%)    = baris terhitung yang sesuai/dalam toleransi ÷ baris terhitung
//   valueAccuracy % = 1 − Σ|nilai selisih| ÷ Σ nilai sistem baris terhitung
//   coverage (%)    = pasangan (bahan, ruang) aktif yang dihitung di periode ÷ semua pasangan aktif
// Selisih adalah sinyal untuk dicek, BUKAN bukti kesalahan/pencurian seseorang.

import { and, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { wmsOpnameLine, wmsProduct, wmsStockMovement, wmsStockOpname, wmsWarehouse, wmsWarehouseStock, wmsWaste } from "@/db/schema";

export type LossLine = {
  productId: string;
  warehouseId: string;
  systemQty: number;
  physicalQty: number;
  /** Nilai selisih bertanda (− kurang, + lebih). */
  value: number;
  /** Nilai stok sistem baris (qty × rate) untuk akurasi nilai. */
  systemValue: number;
  classification: string | null;
};

export type LossSummary = {
  grossShortage: number;
  grossSurplus: number;
  recordedWaste: number;
  unexplained: number;
  net: number;
  totalLoss: number;
  countedLines: number;
  accurateLines: number;
  accuracyPct: number | null;
  valueAccuracyPct: number | null;
  coveredPairs: number;
  activePairs: number;
  coveragePct: number | null;
};

const ACCURATE = new Set(["match", "minor"]);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** Hitung ringkasan murni (tanpa DB) — dipakai laporan & tes. */
export function summarizeLoss(input: {
  lines: LossLine[];
  wasteValues: number[];
  activePairs: number;
}): LossSummary {
  let grossShortage = 0;
  let grossSurplus = 0;
  let absValue = 0;
  let systemValue = 0;
  let accurateLines = 0;
  const pairs = new Set<string>();
  for (const l of input.lines) {
    if (l.value < 0) grossShortage += -l.value;
    else grossSurplus += l.value;
    absValue += Math.abs(l.value);
    systemValue += Math.max(0, l.systemValue);
    const cls = l.classification ?? (Math.abs(l.physicalQty - l.systemQty) < 1e-9 ? "match" : null);
    if (cls && ACCURATE.has(cls)) accurateLines += 1;
    pairs.add(`${l.productId}:${l.warehouseId}`);
  }
  const recordedWaste = input.wasteValues.reduce((s, v) => s + Math.max(0, v), 0);
  const r = (n: number) => Math.round(n);
  const unexplained = r(grossShortage);
  // Bahan yang dihitung tapi sudah tidak aktif tidak menaikkan cakupan di atas 100%.
  const coveredPairs = Math.min(pairs.size, input.activePairs);
  return {
    grossShortage: r(grossShortage),
    grossSurplus: r(grossSurplus),
    recordedWaste: r(recordedWaste),
    unexplained,
    net: r(grossSurplus - grossShortage),
    totalLoss: r(recordedWaste) + unexplained,
    countedLines: input.lines.length,
    accurateLines,
    accuracyPct: pct(accurateLines, input.lines.length),
    valueAccuracyPct: systemValue > 0 ? Math.max(0, Math.round((1 - absValue / systemValue) * 1000) / 10) : null,
    coveredPairs,
    activePairs: input.activePairs,
    coveragePct: pct(coveredPairs, input.activePairs),
  };
}

export type LossReportRow = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  shortageQty: number;
  surplusQty: number;
  shortageValue: number;
  surplusValue: number;
  wasteValue: number;
  events: number;
};

/**
 * Laporan kerugian periode [from, to) dari opname berstatus completed (approvedAt) dan waste recorded.
 * Nilai baris lama (sebelum Phase 3, tanpa posted_value) diambil dari ledger adjustment `<doc> · opname`.
 */
export async function getWmsLossReport(opts: { from: Date; to: Date; warehouseIds?: string[] | null }) {
  const db = getDb();
  const whFilter = opts.warehouseIds ? (opts.warehouseIds.length ? inArray(wmsStockOpname.warehouseId, opts.warehouseIds) : isNull(wmsStockOpname.id)) : undefined;
  const ops = await db
    .select({ id: wmsStockOpname.id, doc: wmsStockOpname.doc, warehouseId: wmsStockOpname.warehouseId, approvedAt: wmsStockOpname.approvedAt })
    .from(wmsStockOpname)
    .where(and(eq(wmsStockOpname.status, "completed"), gte(wmsStockOpname.approvedAt, opts.from), lt(wmsStockOpname.approvedAt, opts.to), whFilter));

  const opIds = ops.map((o) => o.id);
  const rawLines = opIds.length
    ? await db
        .select()
        .from(wmsOpnameLine)
        .where(and(inArray(wmsOpnameLine.opnameId, opIds), isNotNull(wmsOpnameLine.countedAt)))
    : [];

  // Fallback ledger untuk baris lama tanpa posted_value.
  const legacyDocs = ops.filter((o) => rawLines.some((l) => l.opnameId === o.id && l.postedValue === null)).map((o) => `${o.doc} · opname`);
  const legacyMoves = legacyDocs.length
    ? await db
        .select({ refDoc: wmsStockMovement.refDoc, productId: wmsStockMovement.productId, qty: wmsStockMovement.qty, value: wmsStockMovement.valueHpp })
        .from(wmsStockMovement)
        .where(and(eq(wmsStockMovement.type, "adjustment"), inArray(wmsStockMovement.refDoc, legacyDocs)))
    : [];
  const legacyValue = new Map<string, number>();
  for (const m of legacyMoves) {
    const k = `${m.refDoc}|${m.productId}`;
    legacyValue.set(k, (legacyValue.get(k) ?? 0) + Math.sign(Number(m.qty)) * Math.abs(Number(m.value)));
  }

  const productIds = [...new Set(rawLines.map((l) => l.productId).filter((v): v is string => !!v))];
  const products = productIds.length ? await db.select().from(wmsProduct).where(inArray(wmsProduct.id, productIds)) : [];
  const prodById = new Map(products.map((p) => [p.id, p]));
  const opById = new Map(ops.map((o) => [o.id, o]));

  const lines: LossLine[] = [];
  for (const l of rawLines) {
    const op = opById.get(l.opnameId);
    if (!l.productId || !op?.warehouseId) continue;
    const variance = Number(l.physicalQty) - Number(l.systemQty);
    const value =
      l.postedValue !== null
        ? Number(l.postedValue)
        : Math.abs(variance) < 1e-9
          ? 0
          : legacyValue.get(`${op.doc} · opname|${l.productId}`) ?? Math.round(variance * Number(prodById.get(l.productId)?.hpp ?? 0));
    const rate = l.postedRate !== null && Number(l.postedRate) > 0 ? Number(l.postedRate) : Number(prodById.get(l.productId)?.hpp ?? 0);
    lines.push({
      productId: l.productId,
      warehouseId: op.warehouseId,
      systemQty: Number(l.systemQty),
      physicalQty: Number(l.physicalQty),
      value,
      systemValue: Math.max(0, Number(l.systemQty)) * rate,
      classification: l.classification,
    });
  }

  const wasteWh = opts.warehouseIds ? (opts.warehouseIds.length ? inArray(wmsWaste.warehouseId, opts.warehouseIds) : isNull(wmsWaste.id)) : undefined;
  const waste = await db
    .select({ productId: wmsWaste.productId, warehouseId: wmsWaste.warehouseId, value: wmsWaste.value, reason: wmsWaste.reason })
    .from(wmsWaste)
    .where(and(eq(wmsWaste.status, "recorded"), gte(wmsWaste.createdAt, opts.from), lt(wmsWaste.createdAt, opts.to), wasteWh));

  const stockWh = opts.warehouseIds ? (opts.warehouseIds.length ? inArray(wmsWarehouseStock.warehouseId, opts.warehouseIds) : isNull(wmsWarehouseStock.id)) : undefined;
  const active = await db
    .select({ productId: wmsWarehouseStock.productId, warehouseId: wmsWarehouseStock.warehouseId })
    .from(wmsWarehouseStock)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsWarehouseStock.productId))
    .where(and(isNull(wmsProduct.archivedAt), stockWh));

  const summary = summarizeLoss({ lines, wasteValues: waste.map((w) => Number(w.value)), activePairs: active.length });

  // Rincian per (bahan, ruang) + top 10 kerugian.
  const whIds = [...new Set([...lines.map((l) => l.warehouseId), ...waste.map((w) => w.warehouseId).filter((v): v is string => !!v)])];
  const whs = whIds.length ? await db.select().from(wmsWarehouse).where(inArray(wmsWarehouse.id, whIds)) : [];
  const whById = new Map(whs.map((w) => [w.id, w]));
  const wasteProductIds = waste.map((w) => w.productId).filter((v): v is string => !!v && !prodById.has(v));
  if (wasteProductIds.length) {
    for (const p of await db.select().from(wmsProduct).where(inArray(wmsProduct.id, [...new Set(wasteProductIds)]))) prodById.set(p.id, p);
  }
  const rows = new Map<string, LossReportRow>();
  const row = (productId: string, warehouseId: string) => {
    const k = `${productId}:${warehouseId}`;
    let r = rows.get(k);
    if (!r) {
      const p = prodById.get(productId);
      r = {
        productId,
        sku: p?.sku ?? "",
        name: p?.name ?? "(bahan dihapus)",
        category: p?.category ?? "",
        unit: p?.unit ?? "",
        warehouseId,
        warehouseName: whById.get(warehouseId)?.name ?? "",
        shortageQty: 0,
        surplusQty: 0,
        shortageValue: 0,
        surplusValue: 0,
        wasteValue: 0,
        events: 0,
      };
      rows.set(k, r);
    }
    return r;
  };
  for (const l of lines) {
    const v = l.physicalQty - l.systemQty;
    if (Math.abs(v) < 1e-9) continue;
    const r = row(l.productId, l.warehouseId);
    r.events += 1;
    if (v < 0) {
      r.shortageQty += -v;
      r.shortageValue += Math.abs(l.value);
    } else {
      r.surplusQty += v;
      r.surplusValue += Math.abs(l.value);
    }
  }
  for (const w of waste) {
    if (!w.productId || !w.warehouseId) continue;
    row(w.productId, w.warehouseId).wasteValue += Math.max(0, Number(w.value));
  }
  const all = [...rows.values()].map((r) => ({
    ...r,
    shortageQty: Math.round(r.shortageQty * 10_000) / 10_000,
    surplusQty: Math.round(r.surplusQty * 10_000) / 10_000,
    shortageValue: Math.round(r.shortageValue),
    surplusValue: Math.round(r.surplusValue),
    wasteValue: Math.round(r.wasteValue),
  }));
  const top10 = [...all].sort((a, b) => b.shortageValue + b.wasteValue - (a.shortageValue + a.wasteValue)).filter((r) => r.shortageValue + r.wasteValue > 0).slice(0, 10);
  const wasteByReason: Record<string, number> = {};
  for (const w of waste) wasteByReason[w.reason] = Math.round((wasteByReason[w.reason] ?? 0) + Math.max(0, Number(w.value)));

  return {
    period: { from: opts.from.toISOString(), to: opts.to.toISOString() },
    opnameCount: ops.length,
    summary,
    wasteByReason,
    rows: all.sort((a, b) => b.shortageValue - a.shortageValue),
    top10,
    disclaimer: "Selisih stok adalah sinyal untuk diperiksa, bukan bukti kesalahan atau pencurian oleh orang tertentu.",
  };
}
