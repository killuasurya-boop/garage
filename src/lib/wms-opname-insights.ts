// Insight & rekomendasi opname: aturan DETERMINISTIK (bukan tebakan AI). Setiap temuan wajib
// membawa bukti (angka & dokumen), tingkat keyakinan, batasan, dan peran penanggung jawab.
// Bahasa sengaja netral: selisih = sinyal proses, bukan tuduhan kepada karyawan.

import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { wmsBatch, wmsOpnameAction, wmsOpnameLine, wmsProduct, wmsStockOpname, wmsWarehouse, wmsWarehouseStock, wmsWaste } from "@/db/schema";
import { DEFAULT_TOLERANCE } from "@/lib/wms-opname-rules";

export type InsightRule = "repeat_shortage" | "high_value_shortage" | "stale_count" | "near_expiry" | "waste_spike" | "negative_stock";

export type Insight = {
  dedupKey: string;
  rule: InsightRule;
  productId: string | null;
  warehouseId: string | null;
  finding: string;
  evidence: Record<string, unknown>;
  confidence: "low" | "medium" | "high";
  limitation: string;
  impactValue: number;
  recommendation: string;
  ownerRole: "Owner" | "Manajer";
};

export type InsightInput = {
  now: Date;
  products: Array<{ productId: string; warehouseId: string; sku: string; name: string; unit: string; qty: number; hpp: number }>;
  /** Baris opname completed 90 hari (selisih ≠ 0). */
  shortages: Array<{ productId: string; warehouseId: string; doc: string; at: Date; variance: number; value: number }>;
  lastCounted: Map<string, Date>;
  expiring: Array<{ productId: string; warehouseId: string; batchNo: string; qty: number; expiredAt: Date }>;
  /** Nilai waste recorded per ruang: 7 hari terakhir & 28 hari sebelumnya. */
  waste: Array<{ warehouseId: string; last7: number; prior28: number }>;
  warehouseNames: Map<string, string>;
  ownerValue?: number;
  repeatEvents?: number;
};

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const DAY = 86_400_000;
const month = (d: Date) => d.toISOString().slice(0, 7);
const week = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / DAY + 1) / 7)).padStart(2, "0")}`;
};

/** Aturan murni → daftar insight (tanpa DB). */
export function deriveInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const ownerValue = input.ownerValue ?? DEFAULT_TOLERANCE.ownerValue;
  const repeat = input.repeatEvents ?? DEFAULT_TOLERANCE.repeatEvents;
  const prod = new Map(input.products.map((p) => [`${p.productId}:${p.warehouseId}`, p]));
  const label = (productId: string, warehouseId: string) => {
    const p = prod.get(`${productId}:${warehouseId}`);
    return `${p?.name ?? "Bahan"} (${input.warehouseNames.get(warehouseId) ?? "ruang"})`;
  };

  // 1) Kekurangan berulang: ≥ N kejadian kurang dalam 90 hari.
  const byPair = new Map<string, InsightInput["shortages"]>();
  for (const s of input.shortages) {
    if (s.variance >= 0) continue;
    const k = `${s.productId}:${s.warehouseId}`;
    byPair.set(k, [...(byPair.get(k) ?? []), s]);
  }
  for (const [k, list] of byPair) {
    if (list.length < repeat) continue;
    const [productId, warehouseId] = k.split(":");
    const total = list.reduce((sum, s) => sum + Math.abs(s.value), 0);
    out.push({
      dedupKey: `repeat_shortage:${k}:${month(input.now)}`,
      rule: "repeat_shortage",
      productId,
      warehouseId,
      finding: `${label(productId, warehouseId)} kurang ${list.length}× dalam 90 hari, total ${rp(total)}.`,
      evidence: { events: list.map((s) => ({ doc: s.doc, at: s.at.toISOString(), variance: s.variance, value: s.value })), totalValue: Math.round(total) },
      confidence: list.length >= repeat + 1 ? "high" : "medium",
      limitation: "Pola dari hasil opname saja; bisa berasal dari resep/takaran, penerimaan atau waste yang tidak dicatat, maupun salah hitung.",
      impactValue: Math.round(total),
      recommendation: "Cek kesesuaian resep & takaran, pencatatan waste, dan penerimaan barang; jadwalkan cycle count mingguan untuk bahan ini.",
      ownerRole: "Manajer",
    });
  }

  // 2) Kekurangan bernilai besar dalam satu opname.
  for (const s of input.shortages) {
    if (s.variance >= 0 || Math.abs(s.value) < ownerValue) continue;
    out.push({
      dedupKey: `high_value_shortage:${s.productId}:${s.warehouseId}:${s.doc}`,
      rule: "high_value_shortage",
      productId: s.productId,
      warehouseId: s.warehouseId,
      finding: `${label(s.productId, s.warehouseId)} kurang ${rp(Math.abs(s.value))} di ${s.doc}.`,
      evidence: { doc: s.doc, at: s.at.toISOString(), variance: s.variance, value: s.value, threshold: ownerValue },
      confidence: "high",
      limitation: "Satu kejadian; pastikan tidak ada transaksi (transfer/penerimaan/penjualan) yang belum tercatat pada periode itu.",
      impactValue: Math.round(Math.abs(s.value)),
      recommendation: "Telusuri mutasi bahan ini sejak opname sebelumnya (kartu stok) dan konfirmasi dokumen yang belum tercatat.",
      ownerRole: "Owner",
    });
  }

  // 3) Bahan bernilai tinggi lama tidak dihitung (≥ 30 hari / belum pernah).
  const valued = input.products.filter((p) => p.qty > 0 && p.qty * p.hpp > 0).sort((a, b) => b.qty * b.hpp - a.qty * a.hpp);
  const topValue = valued.slice(0, Math.max(5, Math.ceil(valued.length * 0.2)));
  for (const p of topValue) {
    const last = input.lastCounted.get(`${p.productId}:${p.warehouseId}`);
    const days = last ? Math.floor((input.now.getTime() - last.getTime()) / DAY) : null;
    if (days !== null && days < 30) continue;
    out.push({
      dedupKey: `stale_count:${p.productId}:${p.warehouseId}:${week(input.now)}`,
      rule: "stale_count",
      productId: p.productId,
      warehouseId: p.warehouseId,
      finding: `${label(p.productId, p.warehouseId)} bernilai ${rp(p.qty * p.hpp)} ${days === null ? "belum pernah dihitung" : `terakhir dihitung ${days} hari lalu`}.`,
      evidence: { stockValue: Math.round(p.qty * p.hpp), qty: p.qty, unit: p.unit, lastCountedAt: last?.toISOString() ?? null, daysSinceCount: days },
      confidence: "high",
      limitation: "Berdasarkan opname yang sudah disetujui; hitungan draft belum termasuk.",
      impactValue: Math.round(p.qty * p.hpp),
      recommendation: "Masukkan ke cycle count minggu ini.",
      ownerRole: "Manajer",
    });
  }

  // 4) Batch hampir kedaluwarsa (≤ 7 hari) dengan stok tersisa.
  for (const b of input.expiring) {
    const days = Math.floor((b.expiredAt.getTime() - input.now.getTime()) / DAY);
    if (days > 7) continue;
    const p = prod.get(`${b.productId}:${b.warehouseId}`);
    const value = b.qty * (p?.hpp ?? 0);
    out.push({
      dedupKey: `near_expiry:${b.productId}:${b.warehouseId}:${b.batchNo}`,
      rule: "near_expiry",
      productId: b.productId,
      warehouseId: b.warehouseId,
      finding: `${label(b.productId, b.warehouseId)} batch ${b.batchNo}: ${b.qty} ${p?.unit ?? ""} ${days < 0 ? `lewat ${-days} hari` : `kedaluwarsa ${days} hari lagi`}.`,
      evidence: { batchNo: b.batchNo, qty: b.qty, expiredAt: b.expiredAt.toISOString(), daysToExpiry: days, value: Math.round(value) },
      confidence: "high",
      limitation: "Tanggal kedaluwarsa sesuai input penerimaan; kondisi fisik perlu dicek langsung.",
      impactValue: Math.round(value),
      recommendation: days < 0 ? "Pisahkan dan catat sebagai waste (kedaluwarsa) bila memang tidak layak." : "Prioritaskan pemakaian (FEFO) atau rencanakan menu yang memakai bahan ini.",
      ownerRole: "Manajer",
    });
  }

  // 5) Lonjakan waste: 7 hari terakhir > 2× rata-rata mingguan 4 minggu sebelumnya.
  for (const w of input.waste) {
    const avg = w.prior28 / 4;
    if (w.last7 <= 0 || w.last7 <= avg * 2 || w.last7 < 50_000) continue;
    out.push({
      dedupKey: `waste_spike:${w.warehouseId}:${week(input.now)}`,
      rule: "waste_spike",
      productId: null,
      warehouseId: w.warehouseId,
      finding: `Waste ${input.warehouseNames.get(w.warehouseId) ?? "ruang"} 7 hari terakhir ${rp(w.last7)} (rata-rata mingguan sebelumnya ${rp(avg)}).`,
      evidence: { last7: Math.round(w.last7), weeklyAverage: Math.round(avg), prior28: Math.round(w.prior28) },
      confidence: avg > 0 ? "medium" : "low",
      limitation: "Perbandingan nilai saja; menu musiman atau event bisa wajar menaikkan waste.",
      impactValue: Math.round(w.last7 - avg),
      recommendation: "Tinjau alasan waste terbanyak minggu ini (rusak, kedaluwarsa, tumpah, prep) dan sesuaikan jumlah order/prep.",
      ownerRole: "Manajer",
    });
  }

  // 6) Stok minus: biasanya penerimaan/transfer belum dicatat atau resep tidak sesuai.
  for (const p of input.products) {
    if (p.qty >= 0) continue;
    out.push({
      dedupKey: `negative_stock:${p.productId}:${p.warehouseId}:${week(input.now)}`,
      rule: "negative_stock",
      productId: p.productId,
      warehouseId: p.warehouseId,
      finding: `${label(p.productId, p.warehouseId)} stok sistem minus (${p.qty} ${p.unit}).`,
      evidence: { qty: p.qty, unit: p.unit },
      confidence: "high",
      limitation: "Stok minus diizinkan agar penjualan tetap tercatat; penyebab pastinya perlu ditelusuri di kartu stok.",
      impactValue: Math.round(Math.abs(p.qty) * p.hpp),
      recommendation: "Cek penerimaan/transfer yang belum diinput dan kecocokan resep, lalu lakukan opname bahan ini.",
      ownerRole: "Manajer",
    });
  }
  return out.sort((a, b) => b.impactValue - a.impactValue);
}

/** Kumpulkan data, hitung insight, simpan yang baru (dedup). Mengembalikan jumlah baru. */
export async function refreshOpnameInsights(opts: { warehouseIds?: string[] | null; now?: Date } = {}) {
  const db = getDb();
  const now = opts.now ?? new Date();
  const since90 = new Date(now.getTime() - 90 * DAY);
  const whs = await db.select().from(wmsWarehouse).where(opts.warehouseIds ? inArray(wmsWarehouse.id, opts.warehouseIds.length ? opts.warehouseIds : ["00000000-0000-0000-0000-000000000000"]) : undefined);
  const whIds = whs.map((w) => w.id);
  if (!whIds.length) return { created: 0, total: 0 };

  const products = await db
    .select({ productId: wmsProduct.id, warehouseId: wmsWarehouseStock.warehouseId, sku: wmsProduct.sku, name: wmsProduct.name, unit: wmsProduct.unit, qty: wmsWarehouseStock.qty, hpp: wmsProduct.hpp })
    .from(wmsWarehouseStock)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsWarehouseStock.productId))
    .where(and(inArray(wmsWarehouseStock.warehouseId, whIds), isNull(wmsProduct.archivedAt)));

  const lines = await db
    .select({ productId: wmsOpnameLine.productId, warehouseId: wmsStockOpname.warehouseId, doc: wmsStockOpname.doc, countedAt: wmsOpnameLine.countedAt, approvedAt: wmsStockOpname.approvedAt, systemQty: wmsOpnameLine.systemQty, physicalQty: wmsOpnameLine.physicalQty, postedValue: wmsOpnameLine.postedValue })
    .from(wmsOpnameLine)
    .innerJoin(wmsStockOpname, eq(wmsStockOpname.id, wmsOpnameLine.opnameId))
    .where(and(eq(wmsStockOpname.status, "completed"), inArray(wmsStockOpname.warehouseId, whIds), isNotNull(wmsOpnameLine.countedAt)));

  const hpp = new Map(products.map((p) => [p.productId, Number(p.hpp)]));
  const lastCounted = new Map<string, Date>();
  const shortages: InsightInput["shortages"] = [];
  for (const l of lines) {
    if (!l.productId || !l.warehouseId || !l.countedAt) continue;
    const k = `${l.productId}:${l.warehouseId}`;
    const at = new Date(l.countedAt);
    if (!lastCounted.has(k) || lastCounted.get(k)! < at) lastCounted.set(k, at);
    const variance = Number(l.physicalQty) - Number(l.systemQty);
    if (Math.abs(variance) < 1e-9 || at < since90) continue;
    shortages.push({ productId: l.productId, warehouseId: l.warehouseId, doc: l.doc, at, variance, value: l.postedValue !== null ? Number(l.postedValue) : Math.round(variance * (hpp.get(l.productId) ?? 0)) });
  }

  const expiring = await db
    .select({ productId: wmsBatch.productId, warehouseId: wmsBatch.warehouseId, batchNo: wmsBatch.batchNo, qty: wmsBatch.qty, expiredAt: wmsBatch.expiredAt })
    .from(wmsBatch)
    .where(and(inArray(wmsBatch.warehouseId, whIds), gt(wmsBatch.qty, 0), isNotNull(wmsBatch.expiredAt), lt(wmsBatch.expiredAt, new Date(now.getTime() + 8 * DAY))));

  const since35 = new Date(now.getTime() - 35 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const wasteRows = await db
    .select({ warehouseId: wmsWaste.warehouseId, recent: sql<number>`coalesce(sum(case when ${wmsWaste.createdAt} >= ${since7.toISOString()}::timestamptz then ${wmsWaste.value} else 0 end),0)`, prior: sql<number>`coalesce(sum(case when ${wmsWaste.createdAt} < ${since7.toISOString()}::timestamptz then ${wmsWaste.value} else 0 end),0)` })
    .from(wmsWaste)
    .where(and(eq(wmsWaste.status, "recorded"), inArray(wmsWaste.warehouseId, whIds), gte(wmsWaste.createdAt, since35)))
    .groupBy(wmsWaste.warehouseId);

  const insights = deriveInsights({
    now,
    products: products.map((p) => ({ ...p, qty: Number(p.qty), hpp: Number(p.hpp) })),
    shortages,
    lastCounted,
    expiring: expiring.filter((e) => e.productId && e.warehouseId && e.expiredAt).map((e) => ({ productId: e.productId!, warehouseId: e.warehouseId!, batchNo: e.batchNo, qty: Number(e.qty), expiredAt: new Date(e.expiredAt!) })),
    waste: wasteRows.filter((w) => w.warehouseId).map((w) => ({ warehouseId: w.warehouseId!, last7: Number(w.recent), prior28: Number(w.prior) })),
    warehouseNames: new Map(whs.map((w) => [w.id, w.name])),
  });
  if (!insights.length) return { created: 0, total: 0 };
  const inserted = await db
    .insert(wmsOpnameAction)
    .values(insights.map((i) => ({ ...i })))
    .onConflictDoNothing({ target: wmsOpnameAction.dedupKey })
    .returning({ id: wmsOpnameAction.id });
  return { created: inserted.length, total: insights.length };
}

export const ACTION_STATUSES = ["open", "in_progress", "done", "dismissed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export async function listOpnameActions(opts: { warehouseIds?: string[] | null; status?: ActionStatus | "active" | null; limit?: number } = {}) {
  const db = getDb();
  const wh = opts.warehouseIds ? inArray(wmsOpnameAction.warehouseId, opts.warehouseIds.length ? opts.warehouseIds : ["00000000-0000-0000-0000-000000000000"]) : undefined;
  const st = opts.status === "active" ? inArray(wmsOpnameAction.status, ["open", "in_progress"]) : opts.status ? eq(wmsOpnameAction.status, opts.status) : undefined;
  return db
    .select({ action: wmsOpnameAction, productName: wmsProduct.name, sku: wmsProduct.sku, warehouseName: wmsWarehouse.name })
    .from(wmsOpnameAction)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsOpnameAction.productId))
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsOpnameAction.warehouseId))
    .where(and(wh, st))
    .orderBy(desc(wmsOpnameAction.impactValue), desc(wmsOpnameAction.createdAt))
    .limit(opts.limit ?? 100);
}

/** Tindak lanjut manusia (status + catatan). Tidak mengubah stok / keuangan apa pun. */
export async function updateOpnameAction(id: string, input: { status: ActionStatus; note?: string }, userId: string) {
  const [row] = await getDb()
    .update(wmsOpnameAction)
    .set({ status: input.status, ...(input.note !== undefined ? { note: input.note.trim().slice(0, 500) } : {}), updatedBy: userId, updatedAt: new Date() })
    .where(eq(wmsOpnameAction.id, id))
    .returning();
  return row ?? null;
}
