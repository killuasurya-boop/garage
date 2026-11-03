import { and, desc, eq, ilike, inArray, like, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { parseImportFile, parseLocaleNumber, templateCsv, templateXlsx, type ImportColumn, type ImportRowResult } from "@/lib/bulk-import";
import {
  appSettings,
  approvals,
  auditLogs,
  expenses,
  inventoryItems,
  orders,
  outlets,
  wmsBatch,
  wmsClosingReservation,
  wmsBomItem,
  wmsCategory,
  wmsChecklistRun,
  wmsChecklistRunItem,
  wmsColdChainReading,
  wmsSupplier,
  wmsInternalOrder,
  wmsInternalOrderItem,
  wmsOpnameCount,
  wmsOpnameLine,
  wmsProduct,
  wmsProductionBom,
  wmsProductionRecipe,
  wmsMaterialRequest,
  wmsPurchaseOrder,
  wmsPurchaseOrderItem,
  wmsReceiving,
  wmsReceivingItem,
  wmsRecipe,
  wmsSaleAllocation,
  wmsRecipeAuditLog,
  wmsRecipeVersion,
  wmsStockIssue,
  wmsStockMovement,
  wmsStockOpname,
  wmsWarehouse,
  wmsWarehouseStock,
  user,
} from "@/db/schema";
import {
  normalizeReceivedDate,
  purchaseAreaOf,
  purchaseDateFor,
  recordCashPurchases,
  voidCashPurchases,
  type PurchaseArea,
  type PurchasePaymentMethod,
} from "@/lib/finance-purchases";
import { garageUnit, recipeQuantity } from "@/lib/stock-units";
import { syncRecipeBaseCosts } from "@/lib/menu-recipe-cost";
import { WMS_CHECKLIST_TEMPLATES, type ChecklistType } from "@/lib/wms-checklist-templates";
import {
  autoBatchNo,
  needsDiscrepancyApproval,
  validateReceivingLines,
} from "@/lib/wms-receiving-utils";
import {
  WMS_DEFAULT_WAREHOUSES,
  stockStatus,
  type MoveType,
  type WmsDashboard,
  type WmsProductRow,
  type WmsWarehouse,
} from "@/lib/wms-types";
import {
  STANDARD_WMS_CATEGORIES,
  WmsMasterError,
  assertArchiveAllowed,
  assertBarcodeFree,
  assertCategoryUsable,
  assertSkuFree,
  assertSupplierUsable,
  assertUnitChangeAllowed,
  diffMaster,
  generateWmsSku,
  normalizeWhatsapp,
  writeMasterAudit,
  type MasterActor,
} from "@/lib/wms-master-data";
import { loadBusinessDayPolicy } from "@/lib/business-date-policy";
import { jakartaDateKey } from "@/lib/finance-control-core";
import { DEFAULT_TOLERANCE, classifyVariance, worstClass, type OpnameClass, type ToleranceConfig } from "@/lib/wms-opname-rules";
import { notifyOpnameSubmitted, resolveOpnameReview } from "@/lib/wms-notify";

// =============================================================================
// GARAGE WMS — service layer. Aturan inti: SEMUA mutasi stok lewat
// recordStockMovement() (tulis ledger + update wms_warehouse_stock). HPP/nilai
// dihitung saat query, bukan disimpan turunannya.
// =============================================================================

type Db = ReturnType<typeof getDb>;
// Transaksi Drizzle memakai API query yang sama dengan koneksi utama; kita cukup
// menerima keduanya lewat tipe Db supaya fungsi mutasi bisa dijalankan atomik.
type Tx = Db;

/** Jalankan fn dalam transaksi (atomic). Semua mutasi stok wajib lewat sini. */
export function runInTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (getDb() as Db).transaction(fn as never) as Promise<T>;
}

/**
 * HPP bahan WMS berubah (receiving / produksi) → teruskan ke katalog OS
 * (inventory_items.unit_cost) yang dipakai resep & laporan keuangan, lalu hitung
 * ulang HPP menu yang memakai bahan tsb. Tanpa ini, sinkron OS→WMS berikutnya
 * menimpa HPP rata-rata WMS dengan harga lama.
 */
async function propagateHppToOs(tx: Tx, productId: string, hpp: number, lastUnitPrice?: number) {
  if (!Number.isFinite(hpp) || hpp < 0) return;
  const [prod] = await tx.select({ sku: wmsProduct.sku }).from(wmsProduct).where(eq(wmsProduct.id, productId)).limit(1);
  if (!prod) return;
  // Receiving: harga beli per kemasan terakhir = harga/satuan dari supplier × isi kemasan.
  const priceUpdate =
    lastUnitPrice !== undefined && Number.isFinite(lastUnitPrice) && lastUnitPrice > 0
      ? {
          purchasePrice: sql<number>`case when ${inventoryItems.packageQty} > 0 then round((${lastUnitPrice} * ${inventoryItems.packageQty})::numeric, 4) else ${inventoryItems.purchasePrice} end`,
        }
      : {};
  const updated = await tx
    .update(inventoryItems)
    .set({ unitCost: Math.round(hpp * 10_000) / 10_000, ...priceUpdate, updatedAt: new Date() })
    .where(eq(inventoryItems.sku, prod.sku))
    .returning({ sku: inventoryItems.sku });
  if (updated.length) await syncRecipeBaseCosts(tx, { skus: [prod.sku] });
}

/** sale = layak dulu, kedaluwarsa terakhir · usable = tolak kedaluwarsa · expired_first = buang yang basi dulu (waste). */
type BatchPick = "sale" | "usable" | "expired_first";

export type ConsumedBatch = { batchId: string; qty: number; batchNo: string; expiredAt: Date | null; hpp: number };

/**
 * Konsumsi qty dari batch FEFO → biaya aktual + batch yang dipakai. Batch yang masih
 * layak (expired terdekat dulu) dipakai lebih dulu; batch kedaluwarsa paling akhir
 * (penjualan) atau ditolak sama sekali (`excludeExpired`: transfer/produksi/internal).
 */
async function consumeBatchesFefo(
  tx: Tx,
  productId: string,
  warehouseId: string,
  qty: number,
  fallbackHpp: number,
  batchId?: string,
  pick: BatchPick = "sale",
): Promise<{ cost: number; used: ConsumedBatch[] }> {
  const excludeExpired = pick === "usable";
  const batches = await tx
    .select()
    .from(wmsBatch)
    .where(
      and(
        eq(wmsBatch.productId, productId),
        eq(wmsBatch.warehouseId, warehouseId),
        sql`${wmsBatch.qty} > 0`,
        batchId ? eq(wmsBatch.id, batchId) : undefined,
      ),
    )
    .orderBy(
      pick === "expired_first"
        ? sql`case when ${wmsBatch.expiredAt} < now() then 0 else 1 end`
        : sql`case when ${wmsBatch.expiredAt} < now() then 1 else 0 end`,
      sql`${wmsBatch.expiredAt} ASC NULLS LAST`,
      wmsBatch.receivedAt,
    )
    .for("update");

  if (excludeExpired && !batchId) {
    const now = Date.now();
    const expiredQty = batches
      .filter((b) => b.expiredAt && b.expiredAt.getTime() < now)
      .reduce((sum, b) => sum + Number(b.qty), 0);
    if (expiredQty > 0) {
      const usable = (await warehouseOnHand(tx, productId, warehouseId)) - expiredQty;
      if (qty > usable + 0.00005) {
        throw new Error(
          `Stok layak pakai tidak cukup (layak ${Number(Math.max(0, usable).toFixed(4))}, diminta ${qty}; ${Number(expiredQty.toFixed(4))} kedaluwarsa — catat lewat Waste).`,
        );
      }
    }
  }

  let remaining = qty;
  let cost = 0;
  const used: ConsumedBatch[] = [];
  for (const b of batches) {
    if (remaining <= 0) break;
    if (excludeExpired && !batchId && b.expiredAt && b.expiredAt.getTime() < Date.now()) continue;
    const take = Math.min(Number(b.qty), remaining);
    if (take <= 0) continue;
    cost += take * Number(b.hpp);
    remaining = Number((remaining - take).toFixed(4));
    used.push({ batchId: b.id, qty: take, batchNo: b.batchNo, expiredAt: b.expiredAt, hpp: Number(b.hpp) });
    await tx
      .update(wmsBatch)
      .set({ qty: Number((Number(b.qty) - take).toFixed(4)) })
      .where(eq(wmsBatch.id, b.id));
  }
  // Batch kurang dari permintaan (mis. stok awal tanpa batch) → sisanya pakai HPP produk.
  if (remaining > 0 && batchId) throw new Error("Jumlah batch sumber tidak cukup.");
  if (remaining > 0) cost += remaining * fallbackHpp;
  return { cost, used };
}

/**
 * Mutasi stok terpusat (WAJIB dijalankan di dalam runInTx). Menegakkan invariant:
 * - ledger + wms_warehouse_stock + wms_batch selalu konsisten;
 * - TIDAK ada clamp diam-diam: keluar melebihi stok → lempar error (rollback);
 * - masuk (+) membuat batch, keluar (−) mengonsumsi batch FEFO.
 * Mengembalikan biaya aktual (untuk keluar = biaya FEFO; untuk masuk = qty×hpp).
 */
export async function recordStockMovement(
  tx: Tx,
  input: {
    type: MoveType;
    productId: string;
    warehouseId: string;
    deltaQty: number; // + masuk, - keluar
    hpp: number;
    refDoc?: string;
    userId?: string | null;
    batchNo?: string;
    /** Exact batch allocation for traceable internal shipment/reversal. */
    batchId?: string;
    /** Internal allocation may spend its own reservation, never another request. */
    reservationId?: string;
    expiredAt?: Date | null;
    location?: string;
    /**
     * Khusus konsumsi penjualan: boleh minus supaya bahan yang terjual melebihi
     * stok tercatat tetap terpotong (selisih terlihat & dikoreksi saat opname),
     * bukan hilang diam-diam.
     */
    allowNegative?: boolean;
    /** Transfer/produksi/internal: "usable" (tolak kedaluwarsa); waste: "expired_first". */
    pick?: BatchPick;
    /** Masuk (retur penjualan): tambahkan ke batch asal ini, bukan batch baru. */
    restoreToBatchId?: string;
    /** Keluar: nilai per unit eksplisit (batal penerimaan membalik nilai belinya sendiri). */
    outflowRate?: number;
  },
): Promise<{ cost: number; batchId?: string; used: ConsumedBatch[] }> {
  const delta = Number(input.deltaQty);

  // Kunci baris stok terkait supaya order/opname paralel tidak oversell.
  const [cur] = await tx
    .select({ qty: wmsWarehouseStock.qty })
    .from(wmsWarehouseStock)
    .where(
      and(
        eq(wmsWarehouseStock.productId, input.productId),
        eq(wmsWarehouseStock.warehouseId, input.warehouseId),
      ),
    )
    .for("update");
  const current = Number(cur?.qty ?? 0);
  // Reservations protect non-sale operations. POS retains its explicit negative-stock policy.
  if (delta < 0 && !input.allowNegative && (["transfer", "internal_out", "adjustment", "waste"].includes(input.type) || input.refDoc?.startsWith("BATAL "))) {
    const [held] = await tx.select({ qty: sql<number>`coalesce(sum(${wmsClosingReservation.qty}),0)` }).from(wmsClosingReservation).where(and(eq(wmsClosingReservation.productId,input.productId),eq(wmsClosingReservation.warehouseId,input.warehouseId),input.reservationId ? ne(wmsClosingReservation.id,input.reservationId) : undefined));
    if (current + delta < Number(held.qty)) throw new Error("Stok tersedia tidak cukup; sebagian stok sudah direservasi permintaan lain.");
  }
  const next = current + delta;
  // Hanya pergerakan KELUAR yang boleh ditolak. Barang masuk (retur void/refund, penerimaan)
  // ke stok yang sedang minus tetap diterima walau hasilnya masih minus — dulu ditolak
  // ("Stok tidak cukup") sehingga void/refund gagal saat penjualan sudah membuat stok minus.
  if (delta < 0 && next < 0 && !input.allowNegative) {
    throw new Error(`Stok tidak cukup (tersedia ${current}, diminta ${-delta}).`);
  }

  let cost: number;
  let createdBatchId: string | undefined;
  let ledgerBatchId: string | undefined = input.batchId;
  let used: ConsumedBatch[] = [];
  // Satu metode biaya (owner, Okt 2026): rata-rata gerak. Batch hanya untuk FEFO,
  // kedaluwarsa & jejak; nilai keluar selalu qty × HPP rata-rata produk saat itu.
  const [valuation] = await tx.select({ hpp: wmsProduct.hpp }).from(wmsProduct).where(eq(wmsProduct.id, input.productId)).limit(1);
  const avgHpp = Number(valuation?.hpp ?? input.hpp);
  if (delta < 0) {
    const consumed = await consumeBatchesFefo(
      tx,
      input.productId,
      input.warehouseId,
      -delta,
      input.hpp,
      input.batchId,
      input.pick,
    );
    cost = -delta * (input.outflowRate ?? avgHpp);
    used = consumed.used;
    ledgerBatchId ??= consumed.used[0]?.batchId;
  } else {
    cost = delta * input.hpp;
    // Stok minus (terjual sebelum barang dicatat masuk) dilunasi dulu: batch hanya
    // menampung bagian di atas nol, supaya Σ batch selalu = saldo ruang.
    const batchQty = Number(Math.min(delta, Math.max(0, next)).toFixed(4));
    const [restoreBatch] =
      batchQty > 0 && input.restoreToBatchId
        ? await tx
            .select({ id: wmsBatch.id, qty: wmsBatch.qty })
            .from(wmsBatch)
            .where(and(eq(wmsBatch.id, input.restoreToBatchId), eq(wmsBatch.productId, input.productId), eq(wmsBatch.warehouseId, input.warehouseId)))
            .for("update")
            .limit(1)
        : [];
    if (restoreBatch) {
      // Retur penjualan: kembali ke batch asal (no. batch & expired tetap).
      await tx.update(wmsBatch).set({ qty: Number((Number(restoreBatch.qty) + batchQty).toFixed(4)) }).where(eq(wmsBatch.id, restoreBatch.id));
      ledgerBatchId = restoreBatch.id;
    } else if (batchQty > 0) {
      const [createdBatch] = await tx.insert(wmsBatch).values({
        productId: input.productId,
        warehouseId: input.warehouseId,
        batchNo: input.batchNo ?? makeWmsDoc("BATCH"),
        expiredAt: input.expiredAt ?? null,
        qty: batchQty,
        hpp: input.hpp,
        location: input.location?.trim() || "",
      }).returning({ id: wmsBatch.id });
      createdBatchId = createdBatch.id;
      ledgerBatchId = createdBatch.id;
    }
  }

  await tx.insert(wmsStockMovement).values({
    type: input.type,
    productId: input.productId,
    warehouseId: input.warehouseId,
    qty: delta,
    valueHpp: cost,
    refDoc: input.refDoc ?? "",
    userId: input.userId ?? null,
    balanceAfter: Number(next.toFixed(4)),
    valuationRate: delta !== 0 ? Math.round((Math.abs(cost) / Math.abs(delta)) * 10_000) / 10_000 : input.hpp,
    batchId: ledgerBatchId ?? null,
  });

  if (cur) {
    await tx
      .update(wmsWarehouseStock)
      .set({ qty: next, updatedAt: new Date() })
      .where(
        and(
          eq(wmsWarehouseStock.productId, input.productId),
          eq(wmsWarehouseStock.warehouseId, input.warehouseId),
        ),
      );
  } else {
    await tx
      .insert(wmsWarehouseStock)
      .values({ productId: input.productId, warehouseId: input.warehouseId, qty: next });
  }
  await mirrorWmsStockToOs(tx, input.productId);
  return { cost, batchId: createdBatchId, used };
}

/**
 * Pindah stok antar ruang dengan jejak batch utuh (ala ERPNext Material Transfer):
 * tiap batch sumber jadi batch tujuan dengan no. batch, expired & HPP yang sama.
 * Stok lama tanpa batch masuk sebagai satu batch berbiaya HPP rata-rata.
 */
export async function moveStockBetweenWarehouses(
  tx: Tx,
  input: {
    outType: MoveType;
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    qty: number;
    fallbackHpp: number;
    refDoc: string;
    userId?: string | null;
  },
) {
  const out = await recordStockMovement(tx, {
    type: input.outType,
    productId: input.productId,
    warehouseId: input.fromWarehouseId,
    deltaQty: -input.qty,
    hpp: input.fallbackHpp,
    refDoc: input.refDoc,
    userId: input.userId ?? null,
    pick: "usable",
  });
  // Pindah ruang tidak mengubah nilai: masuk dengan HPP rata-rata yang sama dengan keluarnya.
  const rate = input.qty > 0 ? out.cost / input.qty : input.fallbackHpp;
  for (const batch of out.used) {
    await recordStockMovement(tx, {
      type: "in",
      productId: input.productId,
      warehouseId: input.toWarehouseId,
      deltaQty: batch.qty,
      hpp: rate,
      refDoc: input.refDoc,
      userId: input.userId ?? null,
      batchNo: batch.batchNo,
      expiredAt: batch.expiredAt,
    });
  }
  const unbatched = Number((input.qty - out.used.reduce((sum, b) => sum + b.qty, 0)).toFixed(4));
  if (unbatched > 0) {
    await recordStockMovement(tx, {
      type: "in",
      productId: input.productId,
      warehouseId: input.toWarehouseId,
      deltaQty: unbatched,
      hpp: rate,
      refDoc: input.refDoc,
      userId: input.userId ?? null,
    });
  }
  return { cost: out.cost, used: out.used };
}

/**
 * WMS = satu-satunya catatan stok fisik. Stok katalog OS (inventory_items.onHand)
 * dijadikan cermin TOTAL stok WMS semua ruang, supaya alert stok rendah, nilai
 * stok laporan keuangan, dan auto-habis membaca angka yang sama dengan gudang.
 */
async function mirrorWmsStockToOs(tx: Tx, productId: string) {
  const [prod] = await tx
    .select({ sku: wmsProduct.sku })
    .from(wmsProduct)
    .where(eq(wmsProduct.id, productId))
    .limit(1);
  if (!prod) return;
  // Catatan: jangan pakai subquery berkorelasi di select satu-tabel — Drizzle
  // menulis kolom tanpa nama tabel sehingga "id" tertukar dengan id baris stok.
  const total = await totalOnHand(tx, productId);
  await tx
    .update(inventoryItems)
    .set({
      onHand: total,
      status: sql<string>`case when ${total} <= ${inventoryItems.min} then 'low' when ${total} <= ${inventoryItems.min} * 1.25 then 'watch' else 'safe' end`,
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.sku, prod.sku));
}

type SaleStockInput = {
  sku: string;
  qty: number;
  refDoc: string;
  userId?: string | null;
  /** Satuan qty dari resep/katalog OS; dikonversi ke satuan gudang bila dimensinya sama. */
  unit?: string | null;
  /** Retur: dokumen penjualan asal ("SALE <orderNo>") → kembali ke batch asal. */
  saleRefDoc?: string | null;
};

export type WmsStockIssueKind = "not_in_wms" | "unit_mismatch" | "oversold" | "expired_sold" | "batch_gap";

/**
 * Catat masalah stok (dulu terlewat diam-diam). Satu baris terbuka per (jenis, SKU):
 * kejadian berikutnya menambah qty & memperbarui referensi, tidak membanjiri dashboard.
 */
export async function recordWmsStockIssue(
  tx: Tx,
  input: { kind: WmsStockIssueKind; sku: string; productId?: string | null; refDoc: string; detail: string; qty?: number },
) {
  const qty = Number(input.qty ?? 0);
  const [open] = await tx
    .select({ id: wmsStockIssue.id, qty: wmsStockIssue.qty })
    .from(wmsStockIssue)
    .where(and(eq(wmsStockIssue.kind, input.kind), eq(wmsStockIssue.sku, input.sku), sql`${wmsStockIssue.resolvedAt} is null`))
    .limit(1);
  if (open) {
    await tx
      .update(wmsStockIssue)
      .set({ qty: Number((Number(open.qty) + qty).toFixed(4)), refDoc: input.refDoc, detail: input.detail })
      .where(eq(wmsStockIssue.id, open.id));
    return;
  }
  await tx.insert(wmsStockIssue).values({
    kind: input.kind,
    sku: input.sku,
    productId: input.productId ?? null,
    refDoc: input.refDoc,
    detail: input.detail,
    qty,
  });
}

/** Produk WMS + area (bar/dapur/umum) untuk SKU katalog; null bila bahan belum ada di WMS. */
async function wmsProductForSku(tx: Tx, sku: string) {
  const [prod] = await tx
    .select({ id: wmsProduct.id, sku: wmsProduct.sku, hpp: wmsProduct.hpp, area: wmsCategory.area, unit: wmsProduct.unit })
    .from(wmsProduct)
    .leftJoin(wmsCategory, eq(wmsCategory.name, wmsProduct.category))
    // Termasuk produk terarsip: stoknya tetap di ledger WMS. Dulu disaring →
    // penjualan dengan bahan terarsip diam-diam hanya tercatat di tabel lama.
    .where(eq(wmsProduct.sku, sku))
    .limit(1);
  if (!prod) return null;
  return { id: prod.id, sku: prod.sku, hpp: Number(prod.hpp), area: (prod.area ?? "umum") as WmsArea, unit: prod.unit };
}

async function wmsProductById(tx: Tx, id: string) {
  const [prod] = await tx
    .select({ id: wmsProduct.id, sku: wmsProduct.sku, hpp: wmsProduct.hpp, area: wmsCategory.area })
    .from(wmsProduct)
    .leftJoin(wmsCategory, eq(wmsCategory.name, wmsProduct.category))
    .where(eq(wmsProduct.id, id))
    .limit(1);
  if (!prod) return null;
  return { id: prod.id, sku: prod.sku, hpp: Number(prod.hpp), area: (prod.area ?? "umum") as WmsArea };
}

/** Urutan ruang pengambilan bahan jual: outlet area → gudang utama area → ruang lain. */
async function saleWarehouseOrder(tx: Tx, area: WmsArea) {
  const whs = await tx.select().from(wmsWarehouse);
  const outletType = area === "dapur" ? "kitchen" : "bar";
  const rank = (w: typeof wmsWarehouse.$inferSelect) => {
    if (area !== "umum" && w.type === outletType) return 0;
    if (area !== "umum" && w.type === "main" && w.area === area) return 1;
    if (area === "umum" && w.type !== "main") return 0;
    if (area === "umum" && w.isPrimary) return 1;
    return 2;
  };
  return whs.sort((a, b) => rank(a) - rank(b));
}

/**
 * Konsumsi bahan untuk penjualan (dipanggil dari potong stok resep order POS/QR).
 * Ambil dari outlet area dulu, lalu gudang utama area, lalu ruang lain; sisa yang
 * tidak ada stoknya dipotong minus di ruang pertama. Mengembalikan false bila
 * SKU belum terdaftar di WMS (pemanggil memakai logika stok lama).
 */
export async function consumeWmsStockForSale(
  tx: Tx,
  input: SaleStockInput,
): Promise<{ handled: boolean; shortage: number; unitMismatch?: boolean }> {
  const prod = await wmsProductForSku(tx, input.sku);
  if (!prod) {
    if (Number(input.qty) > 0) {
      await recordWmsStockIssue(tx, {
        kind: "not_in_wms",
        sku: input.sku,
        refDoc: input.refDoc,
        detail: "Bahan resep belum terdaftar di gudang WMS — stok gudang tidak terpotong.",
        qty: Number(input.qty),
      });
    }
    return { handled: false, shortage: 0 };
  }
  const { qty, mismatch } = saleQtyInWmsUnit(Number(input.qty), input.unit, prod.unit);
  if (mismatch) {
    await recordWmsStockIssue(tx, {
      kind: "unit_mismatch",
      sku: input.sku,
      productId: prod.id,
      refDoc: input.refDoc,
      detail: `Satuan resep "${input.unit}" tidak bisa dikonversi ke satuan gudang "${prod.unit}" — dipotong apa adanya, cek satuan bahan.`,
      qty,
    });
  }
  const shortage = await consumeProductForSale(tx, prod, qty, input.refDoc, input.userId ?? null);
  if (shortage > 0) {
    await recordWmsStockIssue(tx, {
      kind: "oversold",
      sku: input.sku,
      productId: prod.id,
      refDoc: input.refDoc,
      detail: "Terjual melebihi stok gudang tercatat — cek penerimaan/opname.",
      qty: shortage,
    });
  }
  return { handled: true, shortage, unitMismatch: mismatch || undefined };
}

/**
 * Qty penjualan (satuan resep OS) → satuan gudang. Dimensi sama (gr↔kg, ml↔liter)
 * dikonversi; satuan kosong/sama dipakai apa adanya; dimensi beda = mismatch.
 */
export function saleQtyInWmsUnit(qty: number, fromUnit: string | null | undefined, wmsUnit: string) {
  const from = (fromUnit ?? "").trim();
  if (!from || !wmsUnit.trim() || garageUnit(from) === garageUnit(wmsUnit)) return { qty, mismatch: false };
  const converted = recipeQuantity(qty, from, wmsUnit);
  if (converted === null) return { qty, mismatch: true };
  return { qty: Number(converted.toFixed(4)), mismatch: false };
}

/** Konsumsi 1 produk WMS untuk penjualan; kembalikan jumlah yang terpotong minus (kekurangan). */
async function consumeProductForSale(
  tx: Tx,
  prod: { id: string; sku: string; hpp: number; area: WmsArea },
  qty: number,
  refDoc: string,
  userId: string | null,
): Promise<number> {
  if (!(qty > 0)) return 0;
  const input = { refDoc, userId };
  const order = await saleWarehouseOrder(tx, prod.area);
  let remaining = qty;
  let expiredQty = 0;
  for (const wh of order) {
    if (remaining <= 0) break;
    const avail = await warehouseOnHand(tx, prod.id, wh.id);
    const take = Math.min(avail, remaining);
    if (take <= 0) continue;
    const { used } = await recordStockMovement(tx, {
      type: "out",
      productId: prod.id,
      warehouseId: wh.id,
      deltaQty: -take,
      hpp: prod.hpp,
      refDoc: input.refDoc,
      userId: input.userId ?? null,
    });
    // Batch layak selalu dipakai dulu; yang terambil dari batch kedaluwarsa = stok layak habis.
    const now = Date.now();
    expiredQty += used.filter((b) => b.expiredAt && b.expiredAt.getTime() < now).reduce((sum, b) => sum + b.qty, 0);
    await recordSaleAllocations(tx, { refDoc, productId: prod.id, warehouseId: wh.id, qty: take, used });
    remaining = Number((remaining - take).toFixed(4));
  }
  if (expiredQty > 0) {
    await recordWmsStockIssue(tx, {
      kind: "expired_sold",
      sku: prod.sku,
      productId: prod.id,
      refDoc,
      detail: "Terjual dari batch kedaluwarsa (stok layak habis) — cek bahan fisik, buang yang basi lewat Waste, lalu terima stok baru.",
      qty: Number(expiredQty.toFixed(4)),
    });
  }
  const shortage = remaining > 0 ? remaining : 0;
  if (shortage > 0 && order[0]) {
    await recordStockMovement(tx, {
      type: "out",
      productId: prod.id,
      warehouseId: order[0].id,
      deltaQty: -shortage,
      hpp: prod.hpp,
      refDoc: `${input.refDoc} (melebihi stok tercatat)`,
      userId: input.userId ?? null,
      allowNegative: true,
    });
    await recordSaleAllocations(tx, { refDoc, productId: prod.id, warehouseId: order[0].id, qty: shortage, used: [] });
  }
  return shortage;
}

/** Simpan batch yang dipakai penjualan; sisa tanpa batch (stok lama / minus) = baris batch null. */
async function recordSaleAllocations(
  tx: Tx,
  input: { refDoc: string; productId: string; warehouseId: string; qty: number; used: ConsumedBatch[] },
) {
  const rows: Array<typeof wmsSaleAllocation.$inferInsert> = input.used.map((b) => ({
    refDoc: input.refDoc,
    productId: input.productId,
    warehouseId: input.warehouseId,
    batchId: b.batchId,
    qty: b.qty,
  }));
  const unbatched = Number((input.qty - input.used.reduce((sum, b) => sum + b.qty, 0)).toFixed(4));
  if (unbatched > 0) rows.push({ refDoc: input.refDoc, productId: input.productId, warehouseId: input.warehouseId, batchId: null, qty: unbatched });
  if (rows.length) await tx.insert(wmsSaleAllocation).values(rows);
}

/** Kembalikan bahan penjualan (void/refund) ke ruang pengambilan utama area. */
export async function returnWmsStockForSale(tx: Tx, input: SaleStockInput): Promise<{ handled: boolean }> {
  const prod = await wmsProductForSku(tx, input.sku);
  if (!prod) return { handled: false };
  const { qty } = saleQtyInWmsUnit(Number(input.qty), input.unit, prod.unit);
  if (!(qty > 0)) return { handled: true };
  let remaining = qty;
  // Retur terhadap penjualan asal: kembali ke ruang & batch yang dulu terpotong (terbaru dulu).
  if (input.saleRefDoc) {
    const allocations = await tx
      .select()
      .from(wmsSaleAllocation)
      .where(and(eq(wmsSaleAllocation.refDoc, input.saleRefDoc), eq(wmsSaleAllocation.productId, prod.id)))
      .orderBy(desc(wmsSaleAllocation.seq))
      .for("update");
    for (const a of allocations) {
      if (remaining <= 0) break;
      const open = Number((Number(a.qty) - Number(a.returnedQty)).toFixed(4));
      const back = Math.min(open, remaining);
      if (back <= 0 || !a.warehouseId) continue;
      await recordStockMovement(tx, {
        type: "in",
        productId: prod.id,
        warehouseId: a.warehouseId,
        deltaQty: back,
        hpp: prod.hpp,
        refDoc: input.refDoc,
        userId: input.userId ?? null,
        restoreToBatchId: a.batchId ?? undefined,
        batchNo: `RETUR-${input.refDoc}`.slice(0, 60),
      });
      await tx
        .update(wmsSaleAllocation)
        .set({ returnedQty: Number((Number(a.returnedQty) + back).toFixed(4)) })
        .where(eq(wmsSaleAllocation.id, a.id));
      remaining = Number((remaining - back).toFixed(4));
    }
  }
  if (remaining > 0) {
    // Penjualan lama (sebelum jejak batch) → ruang pengambilan utama area, batch RETUR baru.
    const [target] = await saleWarehouseOrder(tx, prod.area);
    if (!target) return { handled: false };
    await recordStockMovement(tx, {
      type: "in",
      productId: prod.id,
      warehouseId: target.id,
      deltaQty: remaining,
      hpp: prod.hpp,
      refDoc: input.refDoc,
      userId: input.userId ?? null,
      batchNo: `RETUR-${input.refDoc}`.slice(0, 60),
    });
  }
  return { handled: true };
}

export type WmsBatchGap = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  balance: number;
  batchTotal: number;
  /** + = saldo lebih besar dari total batch (stok tanpa batch); − = batch berlebih. */
  gap: number;
};

/**
 * Cek integritas ala ERPNext (Stock Ledger vs Batch): Σ batch per ruang harus =
 * saldo ruang (saldo minus → batch 0). Selisih muncul dari data lama sebelum 0151.
 */
export async function getWmsBatchIntegrity(db: Db = getDb()): Promise<WmsBatchGap[]> {
  const rows = await db
    .select({
      productId: wmsWarehouseStock.productId,
      warehouseId: wmsWarehouseStock.warehouseId,
      balance: wmsWarehouseStock.qty,
      sku: wmsProduct.sku,
      name: wmsProduct.name,
      unit: wmsProduct.unit,
      warehouseName: wmsWarehouse.name,
      batchTotal: sql<number>`coalesce((select sum(b.qty) from wms_batch b where b.product_id = ${wmsWarehouseStock.productId} and b.warehouse_id = ${wmsWarehouseStock.warehouseId} and b.qty > 0), 0)`,
    })
    .from(wmsWarehouseStock)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsWarehouseStock.productId))
    .innerJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsWarehouseStock.warehouseId));
  return rows
    .map((r) => {
      const balance = Number(r.balance);
      const batchTotal = Number(r.batchTotal);
      return { ...r, balance, batchTotal, gap: Number((Math.max(0, balance) - batchTotal).toFixed(4)) };
    })
    .filter((r) => Math.abs(r.gap) >= 0.0001)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/**
 * Samakan batch dengan saldo (saldo = kebenaran ledger, tidak ada mutasi stok baru):
 * kurang batch → batch "SALDO" berbiaya HPP rata-rata; batch berlebih → kurangi batch
 * yang paling akhir kedaluwarsa dulu (FEFO terbalik). Dicatat di audit log.
 */
export async function fixWmsBatchIntegrity(input: { userId?: string | null; actorName?: string }) {
  return runInTx(async (tx) => {
    const gaps = await getWmsBatchIntegrity(tx);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    for (const g of gaps) {
      if (g.gap > 0) {
        const [prod] = await tx.select({ hpp: wmsProduct.hpp }).from(wmsProduct).where(eq(wmsProduct.id, g.productId)).limit(1);
        await tx.insert(wmsBatch).values({
          productId: g.productId,
          warehouseId: g.warehouseId,
          batchNo: `SALDO-${stamp}`,
          qty: g.gap,
          hpp: Number(prod?.hpp ?? 0),
        });
        continue;
      }
      let excess = -g.gap;
      const batches = await tx
        .select({ id: wmsBatch.id, qty: wmsBatch.qty })
        .from(wmsBatch)
        .where(and(eq(wmsBatch.productId, g.productId), eq(wmsBatch.warehouseId, g.warehouseId), sql`${wmsBatch.qty} > 0`))
        .orderBy(sql`${wmsBatch.expiredAt} DESC NULLS FIRST`, desc(wmsBatch.receivedAt))
        .for("update");
      for (const b of batches) {
        if (excess <= 0) break;
        const take = Math.min(Number(b.qty), excess);
        excess = Number((excess - take).toFixed(4));
        await tx.update(wmsBatch).set({ qty: Number((Number(b.qty) - take).toFixed(4)) }).where(eq(wmsBatch.id, b.id));
      }
    }
    if (gaps.length) {
      await tx.insert(auditLogs).values({
        time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
        actor: input.actorName ?? "Gudang",
        action: "Batch gudang disamakan dengan saldo",
        object: `${gaps.length} bahan/ruang`,
        device: "WMS",
        status: "warning",
        metadata: {
          gaps: gaps.map((g) => ({ sku: g.sku, warehouse: g.warehouseName, balance: g.balance, batchTotal: g.batchTotal, gap: g.gap })),
        },
      });
    }
    return { fixed: gaps.length, gaps };
  });
}

export type WmsStockIssueRow = typeof wmsStockIssue.$inferSelect & { productName: string | null };

/** Masalah stok yang belum ditandai beres (terbaru dulu). */
export async function listOpenWmsStockIssues(limit = 100): Promise<WmsStockIssueRow[]> {
  const rows = await getDb()
    .select({ issue: wmsStockIssue, productName: wmsProduct.name })
    .from(wmsStockIssue)
    .leftJoin(wmsProduct, eq(wmsProduct.sku, wmsStockIssue.sku))
    .where(sql`${wmsStockIssue.resolvedAt} is null`)
    .orderBy(desc(wmsStockIssue.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.issue, qty: Number(r.issue.qty), productName: r.productName }));
}

export async function resolveWmsStockIssue(id: string, userId: string | null) {
  const [row] = await getDb()
    .update(wmsStockIssue)
    .set({ resolvedAt: new Date(), resolvedBy: userId })
    .where(and(eq(wmsStockIssue.id, id), sql`${wmsStockIssue.resolvedAt} is null`))
    .returning();
  return row ?? null;
}

/** True bila SKU dikelola WMS (stok fisiknya dicatat di WMS). */
export async function isWmsManagedSku(tx: Tx, sku: string): Promise<boolean> {
  return (await wmsProductForSku(tx, sku)) !== null;
}

// Single-flight: seed hanya dijalankan sekali per proses (cegah query berulang di
// tiap request & race double-seed saat request pertama bersamaan).
let wmsSeedPromise: Promise<void> | null = null;

/** Self-healing seed: warehouse default + contoh produk + stok awal. */
export function ensureWmsSeeded(): Promise<void> {
  if (!wmsSeedPromise) {
    wmsSeedPromise = doEnsureWmsSeeded().catch((err) => {
      // Gagal → reset supaya percobaan berikutnya bisa mengulang.
      wmsSeedPromise = null;
      throw err;
    });
  }
  return wmsSeedPromise;
}

async function seedWmsWarehousesAndCategories() {
  const db = getDb();
  await db
    .insert(wmsWarehouse)
    .values(WMS_DEFAULT_WAREHOUSES)
    .onConflictDoUpdate({
      target: wmsWarehouse.code,
      set: { name: sql`excluded.name`, area: sql`excluded.area`, type: sql`excluded.type` },
    });

  await db
    .insert(wmsCategory)
    .values([
      { name: "Bahan Bar", area: "bar" },
      { name: "Bahan Dapur", area: "dapur" },
      { name: "Kemasan", area: "umum" },
      { name: "Umum / Lainnya", area: "umum" },
    ])
    .onConflictDoNothing();
}

async function seedWmsSampleProducts() {
  const db = getDb();
  const allowSampleData =
    process.env.NODE_ENV !== "production" || process.env.GARAGE_SEED_DEMO === "true";
  if (!allowSampleData) return;

  const mainRooms = await db.select().from(wmsWarehouse).where(eq(wmsWarehouse.type, "main"));
  const roomByArea = new Map(mainRooms.map((w) => [w.area, w.id]));
  const primaryRoom = mainRooms.find((w) => w.isPrimary)?.id ?? mainRooms[0]?.id;
  if (!primaryRoom) return;
  const roomFor = (area: string) => roomByArea.get(area) ?? primaryRoom;

  const samples: Array<[string, string, string, string, number, number, number, string]> = [
    ["BEAN-ARB", "Kopi Arabika", "Bahan Bar", "gram", 2000, 0.12, 8000, "bar"],
    ["MILK-FC", "Susu Full Cream", "Bahan Bar", "ml", 5000, 0.018, 12000, "bar"],
    ["SUGAR-PALM", "Gula Aren Cair", "Bahan Bar", "ml", 1000, 0.05, 1500, "bar"],
    ["CUP-16", "Gelas Plastik 16oz", "Kemasan", "pcs", 300, 650, 240, "bar"],
    ["RICE", "Beras", "Bahan Dapur", "gram", 10000, 0.013, 25000, "dapur"],
    ["CHICK", "Ayam Fillet", "Bahan Dapur", "gram", 3000, 0.045, 1200, "dapur"],
    ["OIL", "Minyak Goreng", "Bahan Dapur", "ml", 2000, 0.02, 6000, "dapur"],
    ["SYR-CARAMEL", "Sirup Caramel", "Bahan Bar", "ml", 500, 0.09, 300, "bar"],
  ];

  for (const [sku, name, category, unit, minStock, hpp, initial, area] of samples) {
    const [prod] = await db
      .insert(wmsProduct)
      .values({ sku, name, category, unit, minStock, hpp })
      .returning();
    if (initial > 0) {
      await runInTx((tx) =>
        recordStockMovement(tx, {
          type: "in",
          productId: prod.id,
          warehouseId: roomFor(area),
          deltaQty: initial,
          hpp,
          refDoc: "SEED",
          batchNo: `SEED-${sku}`,
        }),
      );
    }
  }
}

async function doEnsureWmsSeeded() {
  await seedWmsWarehousesAndCategories();

  const db = getDb();
  const [{ invN }] = await db.select({ invN: sql<number>`count(*)::int` }).from(inventoryItems);
  if (Number(invN) > 0) {
    const { syncOsToWms } = await import("@/lib/wms-bridge");
    await syncOsToWms({ bootstrapStock: true });
    return;
  }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(wmsProduct);
  if (Number(n) > 0) return;

  await seedWmsSampleProducts();
}

/** Tipe ruang gudang (main/bar/kitchen) untuk cek scope peran; null bila tak ada. */
export async function getWmsWarehouseType(id: string): Promise<WmsWarehouse["type"] | null> {
  const db = getDb();
  const [row] = await db.select({ type: wmsWarehouse.type }).from(wmsWarehouse).where(eq(wmsWarehouse.id, id)).limit(1);
  return (row?.type as WmsWarehouse["type"] | undefined) ?? null;
}

export async function getWmsWarehouseName(id: string): Promise<string | null> {
  const [row] = await getDb().select({ name: wmsWarehouse.name }).from(wmsWarehouse).where(eq(wmsWarehouse.id, id)).limit(1);
  return row?.name ?? null;
}

export async function listWmsWarehouses(opts?: {
  allowedTypes?: WmsWarehouse["type"][] | "all";
}): Promise<WmsWarehouse[]> {
  await ensureWmsSeeded();
  const rows = await getDb().select().from(wmsWarehouse).orderBy(desc(wmsWarehouse.isPrimary), wmsWarehouse.code);
  const allowed = opts?.allowedTypes;
  return rows
    .filter((r) => ["main", "bar", "kitchen"].includes(r.type) && (!allowed || allowed === "all" || allowed.includes(r.type as WmsWarehouse["type"])))
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type as WmsWarehouse["type"],
      area: r.area as WmsWarehouse["area"],
      isPrimary: r.isPrimary,
    }));
}

async function primaryWarehouseId(db: Db): Promise<string | null> {
  const [w] = await db
    .select({ id: wmsWarehouse.id })
    .from(wmsWarehouse)
    .where(eq(wmsWarehouse.isPrimary, true))
    .limit(1);
  return w?.id ?? null;
}

/** Ruang gudang utama (type=main) untuk sebuah area; fallback ke primary. */
async function mainWarehouseForArea(db: Db, area: string): Promise<string | null> {
  const [w] = await db
    .select({ id: wmsWarehouse.id })
    .from(wmsWarehouse)
    .where(and(eq(wmsWarehouse.type, "main"), eq(wmsWarehouse.area, area)))
    .limit(1);
  return w?.id ?? (await primaryWarehouseId(db));
}

export async function getWmsProducts(params?: {
  search?: string;
  category?: string;
  warehouseId?: string;
  archived?: "active" | "archived";
  supplierId?: string;
  area?: "bar" | "dapur" | "umum";
}): Promise<WmsProductRow[]> {
  await ensureWmsSeeded();
  const db = getDb();
  // "all" = agregat semua ruang/gudang (total stok gabungan).
  const allRooms = params?.warehouseId === "all";
  const whId = allRooms ? null : (params?.warehouseId ?? (await primaryWarehouseId(db)));

  // Default hanya produk aktif; "archived" menampilkan yang terarsip (untuk restore).
  const filters = [
    params?.archived === "archived"
      ? sql`${wmsProduct.archivedAt} is not null`
      : sql`${wmsProduct.archivedAt} is null`,
  ];
  if (params?.category && params.category !== "all") {
    filters.push(eq(wmsProduct.category, params.category));
  }
  if (params?.supplierId) filters.push(eq(wmsProduct.defaultSupplierId, params.supplierId));
  if (params?.area) filters.push(sql`coalesce(${wmsCategory.area}, 'umum') = ${params.area}`);
  if (params?.search) {
    const s = `%${params.search.trim()}%`;
    filters.push(
      or(
        ilike(wmsProduct.sku, s),
        ilike(wmsProduct.name, s),
        ilike(wmsProduct.category, s),
        ilike(wmsProduct.barcode, s),
        ilike(wmsProduct.brand, s),
        ilike(wmsProduct.subcategory, s),
      )!,
    );
  }

  const rows = await db
    .select({
      id: wmsProduct.id,
      sku: wmsProduct.sku,
      name: wmsProduct.name,
      category: wmsProduct.category,
      subcategory: wmsProduct.subcategory,
      brand: wmsProduct.brand,
      area: wmsCategory.area,
      defaultSupplierId: wmsProduct.defaultSupplierId,
      supplierName: wmsSupplier.name,
      unit: wmsProduct.unit,
      minStock: wmsProduct.minStock,
      hpp: wmsProduct.hpp,
      packPrice: inventoryItems.purchasePrice,
      packQty: inventoryItems.packageQty,
      packageLabel: inventoryItems.packageSize,
      imageUrl: wmsProduct.imageUrl,
      barcode: wmsProduct.barcode,
      createdAt: wmsProduct.createdAt,
      onHand: allRooms
        ? sql<number>`coalesce((select sum(${wmsWarehouseStock.qty}) from ${wmsWarehouseStock} where ${wmsWarehouseStock.productId} = ${wmsProduct.id}), 0)`
        : sql<number>`coalesce(${wmsWarehouseStock.qty}, 0)`,
    })
    .from(wmsProduct)
    // Harga beli & isi kemasan tinggal di katalog bahan (inventory_items) — sumber
    // HPP resep & laporan keuangan.
    .leftJoin(inventoryItems, eq(inventoryItems.sku, wmsProduct.sku))
    .leftJoin(wmsCategory, eq(wmsCategory.name, wmsProduct.category))
    .leftJoin(wmsSupplier, eq(wmsSupplier.id, wmsProduct.defaultSupplierId))
    .leftJoin(
      wmsWarehouseStock,
      and(
        eq(wmsWarehouseStock.productId, wmsProduct.id),
        !allRooms && whId ? eq(wmsWarehouseStock.warehouseId, whId) : sql`false`,
      ),
    )
    .where(and(...filters))
    .orderBy(wmsProduct.category, wmsProduct.name);

  const { loadProductUoms } = await import("@/lib/wms-uom");
  const uomsById = await loadProductUoms(rows.map((r) => r.id), db);
  return rows.map((r) => ({
    uoms: uomsById.get(r.id) ?? [],
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory,
    brand: r.brand,
    area: (r.area ?? "umum") as "bar" | "dapur" | "umum",
    defaultSupplierId: r.defaultSupplierId ?? null,
    supplierName: r.supplierName ?? null,
    unit: r.unit,
    minStock: Number(r.minStock),
    hpp: Number(r.hpp),
    packPrice: Number(r.packPrice ?? 0),
    packQty: Number(r.packQty ?? 0),
    packageLabel: r.packageLabel ?? null,
    onHand: Number(r.onHand),
    status: stockStatus(Number(r.onHand), Number(r.minStock)),
    imageUrl: r.imageUrl ?? null,
    barcode: r.barcode ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Stok sebuah produk di gudang/ruang yang RELEVAN untuk panel Kelola Stok.
 * Hanya tampilkan ruang yang sesuai area produk (bahan Bar → ruang Bar saja,
 * bahan Dapur → ruang Dapur saja). Produk "umum" tampil di semua ruang.
 * Ruang yang masih menyimpan stok tetap ditampilkan meski beda area, supaya
 * tidak ada stok yang tersembunyi (mis. sisa pindahan / kategori berubah).
 */
export async function getWmsProductStock(productId: string) {
  const db = getDb();
  const warehouses = await db
    .select()
    .from(wmsWarehouse)
    .orderBy(desc(wmsWarehouse.type), desc(wmsWarehouse.isPrimary), wmsWarehouse.code);
  const stocks = await db
    .select({ warehouseId: wmsWarehouseStock.warehouseId, qty: wmsWarehouseStock.qty })
    .from(wmsWarehouseStock)
    .where(eq(wmsWarehouseStock.productId, productId));
  const byWh = new Map(stocks.map((s) => [s.warehouseId, Number(s.qty)]));

  // Area produk dari kategorinya (fallback "umum" bila kategori tak dipetakan).
  const [prod] = await db
    .select({ category: wmsProduct.category })
    .from(wmsProduct)
    .where(eq(wmsProduct.id, productId))
    .limit(1);
  const [cat] = prod
    ? await db
        .select({ area: wmsCategory.area })
        .from(wmsCategory)
        .where(eq(wmsCategory.name, prod.category))
        .limit(1)
    : [];
  const productArea = (cat?.area ?? "umum") as WmsWarehouse["area"];

  return warehouses
    .filter((w) => {
      if (productArea === "umum") return true;
      const onHand = byWh.get(w.id) ?? 0;
      return w.area === productArea || onHand !== 0;
    })
    .map((w) => ({
      warehouseId: w.id,
      code: w.code,
      name: w.name,
      type: w.type as WmsWarehouse["type"],
      area: w.area as WmsWarehouse["area"],
      onHand: byWh.get(w.id) ?? 0,
    }));
}

/**
 * Ringkasan stok per gudang/ruang untuk pemilih gudang di header:
 * jumlah item berstok + jumlah item low (0 < qty ≤ min). Dipakai untuk badge
 * status supaya owner cepat lihat ruang mana yang perlu restock.
 */
export async function getWmsWarehouseSummary(): Promise<
  { warehouseId: string; items: number; low: number; empty: number }[]
> {
  await ensureWmsSeeded();
  const db = getDb();
  const rows = await db
    .select({
      warehouseId: wmsWarehouseStock.warehouseId,
      items: sql<number>`count(*) filter (where ${wmsWarehouseStock.qty} > 0)`,
      low: sql<number>`count(*) filter (where ${wmsWarehouseStock.qty} > 0 and ${wmsWarehouseStock.qty} <= ${wmsProduct.minStock})`,
      empty: sql<number>`count(*) filter (where ${wmsWarehouseStock.qty} <= 0)`,
    })
    .from(wmsWarehouseStock)
    .innerJoin(
      wmsProduct,
      and(eq(wmsProduct.id, wmsWarehouseStock.productId), sql`${wmsProduct.archivedAt} is null`),
    )
    .groupBy(wmsWarehouseStock.warehouseId);
  return rows.map((r) => ({
    warehouseId: r.warehouseId,
    items: Number(r.items),
    low: Number(r.low),
    empty: Number(r.empty),
  }));
}

/** Harga beli per kemasan & isi kemasan (dalam satuan stok) dari form Inventory. */
export type WmsPackInput = { packPrice?: number; packQty?: number; packName?: string };

/** HPP per satuan = harga beli per kemasan ÷ isi kemasan (4 desimal). */
function unitCostFromPack(pack: WmsPackInput): number | null {
  const price = Number(pack.packPrice);
  const qty = Number(pack.packQty);
  if (!Number.isFinite(price) || !Number.isFinite(qty) || price < 0 || qty <= 0) return null;
  return Math.round((price / qty) * 10_000) / 10_000;
}

function osUsageArea(area: string | null | undefined): "bar" | "dapur" | "general" {
  return area === "bar" ? "bar" : area === "dapur" ? "dapur" : "general";
}

/**
 * Simpan master bahan WMS ke katalog OS (inventory_items) — sumber HPP resep &
 * laporan keuangan sekaligus sumber sinkron OS→WMS. Tanpa ini edit di WMS
 * tertimpa balik saat sinkron dan bahan buatan WMS tidak bisa dipakai di resep.
 * HPP menu yang memakai bahan ini dihitung ulang bila HPP-nya berubah.
 */
async function mirrorWmsProductToOs(db: Db, prod: typeof wmsProduct.$inferSelect, pack: WmsPackInput) {
  const [cat] = await db
    .select({ area: wmsCategory.area })
    .from(wmsCategory)
    .where(eq(wmsCategory.name, prod.category))
    .limit(1);
  const [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, prod.sku)).limit(1);

  const packQty = pack.packQty !== undefined ? Number(pack.packQty) : Number(existing?.packageQty ?? 0);
  const packPrice = pack.packPrice !== undefined ? Number(pack.packPrice) : Number(existing?.purchasePrice ?? 0);
  const packName = pack.packName?.trim();
  const labelChanged =
    pack.packQty !== undefined &&
    packQty > 0 &&
    (!existing || Number(existing.packageQty) !== packQty || (packName && !existing.packageSize.startsWith(packName)));
  const packageSize = labelChanged
    ? `${packName || "kemasan"} ${packQty} ${prod.unit}`
    : (existing?.packageSize ?? `1 ${prod.unit}`);
  const minStock = Number(prod.minStock);
  const values = {
    name: prod.name,
    category: prod.category,
    usageArea: osUsageArea(cat?.area),
    unit: prod.unit,
    min: minStock,
    unitCost: Number(prod.hpp),
    purchasePrice: packPrice,
    packageQty: packQty,
    packageSize,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(inventoryItems).set(values).where(eq(inventoryItems.sku, prod.sku));
  } else {
    await db.insert(inventoryItems).values({
      sku: prod.sku,
      alternativeName: "-",
      onHand: 0,
      status: minStock > 0 ? "low" : "safe",
      movement: "",
      ...values,
    });
  }
  if (!existing || Number(existing.unitCost) !== Number(prod.hpp)) {
    await syncRecipeBaseCosts(db, { skus: [prod.sku] });
  }
}

export type WmsProductPatch = {
  name?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  defaultSupplierId?: string | null;
  unit?: string;
  minStock?: number;
  hpp?: number;
  imageUrl?: string | null;
  barcode?: string | null;
  archivedAt?: Date | null; // set null = restore dari arsip
} & WmsPackInput;

const PRODUCT_AUDIT_KEYS = ["name", "category", "subcategory", "brand", "defaultSupplierId", "unit", "minStock", "hpp", "barcode", "imageUrl"] as const;

/**
 * Update master bahan (tanpa menyentuh stok). Satu transaksi: master WMS + katalog OS +
 * HPP resep + audit log. Satuan dasar terkunci bila bahan sudah punya stok/ledger/resep.
 */
export async function updateWmsProduct(id: string, patch: WmsProductPatch, dbOverride?: Db, actor?: MasterActor) {
  const run = async (db: Tx) => {
    const [before] = await db.select().from(wmsProduct).where(eq(wmsProduct.id, id)).limit(1);
    if (!before) return null;

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.category !== undefined && patch.category.trim() !== before.category) {
      set.category = (await assertCategoryUsable(db, patch.category, actor?.strict ?? false)).name;
    }
    if (patch.subcategory !== undefined) set.subcategory = patch.subcategory.trim();
    if (patch.brand !== undefined) set.brand = patch.brand.trim();
    if (patch.defaultSupplierId !== undefined) {
      await assertSupplierUsable(db, patch.defaultSupplierId);
      set.defaultSupplierId = patch.defaultSupplierId || null;
    }
    if (patch.unit !== undefined) {
      await assertUnitChangeAllowed(db, before, patch.unit);
      set.unit = patch.unit.trim();
    }
    if (patch.minStock !== undefined) set.minStock = patch.minStock;
    if (patch.hpp !== undefined) set.hpp = patch.hpp;
    // Harga beli per kemasan + isi → HPP per satuan dihitung otomatis (menang atas hpp manual).
    const packUnitCost = unitCostFromPack(patch);
    if (packUnitCost !== null) set.hpp = packUnitCost;
    if (patch.imageUrl !== undefined) set.imageUrl = patch.imageUrl;
    if (patch.barcode !== undefined) {
      await assertBarcodeFree(db, patch.barcode, id);
      set.barcode = patch.barcode ? patch.barcode.trim() : null;
    }
    if (patch.archivedAt !== undefined) set.archivedAt = patch.archivedAt;
    const [row] = await db.update(wmsProduct).set(set).where(eq(wmsProduct.id, id)).returning();
    if (!row) return null;

    const masterChanged = ["name", "category", "unit", "minStock", "hpp", "packPrice", "packQty", "packName"].some(
      (key) => patch[key as keyof typeof patch] !== undefined,
    );
    if (masterChanged) {
      await mirrorWmsProductToOs(db, row, { packPrice: patch.packPrice, packQty: patch.packQty, packName: patch.packName });
    }

    const changes = diffMaster(before as Record<string, unknown>, row as Record<string, unknown>, [...PRODUCT_AUDIT_KEYS]);
    if (patch.packPrice !== undefined) changes.packPrice = { before: null, after: patch.packPrice };
    if (patch.packQty !== undefined) changes.packQty = { before: null, after: patch.packQty };
    const restored = before.archivedAt && patch.archivedAt === null;
    if (Object.keys(changes).length || restored) {
      await writeMasterAudit(db, {
        actor,
        action: restored ? "Pulihkan bahan dari arsip" : "Ubah master bahan",
        object: row.sku,
        metadata: { productId: row.id, changes },
      });
    }
    return row;
  };
  return dbOverride ? run(dbOverride) : runInTx(run);
}

/**
 * Soft-delete (arsip): produk hilang dari daftar tapi riwayat ledger tetap ada.
 * Ditolak bila masih dipakai resep aktif atau masih ada stok (WmsMasterError).
 */
export async function archiveWmsProduct(id: string, actor?: MasterActor) {
  return runInTx(async (tx) => {
    const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, id)).limit(1);
    if (!prod) return null;
    if (prod.archivedAt) return prod;
    await assertArchiveAllowed(tx, prod);
    const [row] = await tx
      .update(wmsProduct)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(wmsProduct.id, id))
      .returning();
    await writeMasterAudit(tx, { actor, action: "Arsipkan bahan", object: prod.sku, metadata: { productId: id } });
    return row ?? null;
  });
}

export async function createWmsProduct(
  input: {
    /** Kosong = SKU otomatis dari prefix kategori (dikunci di server, anti ganda). */
    sku?: string | null;
    name: string;
    category: string;
    subcategory?: string;
    brand?: string;
    defaultSupplierId?: string | null;
    unit: string;
    minStock?: number;
    hpp?: number;
    barcode?: string | null;
    initialStock?: number; // stok awal (opsional) → masuk ruang sesuai area kategori
    initialWarehouseId?: string | null;
  } & WmsPackInput,
  userId?: string | null,
  dbOverride?: Db,
  actor?: MasterActor,
) {
  // dbOverride = transaksi pemanggil (mis. impor massal: semua baris atomik).
  const run = async (db: Tx) => {
    const cat = await assertCategoryUsable(db, input.category, actor?.strict ?? false);
    const sku = input.sku?.trim() || (await generateWmsSku(db, cat.name));
    await assertSkuFree(db, sku);
    await assertBarcodeFree(db, input.barcode);
    await assertSupplierUsable(db, input.defaultSupplierId);
    const hpp = unitCostFromPack(input) ?? input.hpp ?? 0;
    const [prod] = await db
      .insert(wmsProduct)
      .values({
        sku,
        name: input.name.trim(),
        category: cat.name,
        subcategory: input.subcategory?.trim() ?? "",
        brand: input.brand?.trim() ?? "",
        defaultSupplierId: input.defaultSupplierId || null,
        unit: input.unit.trim(),
        minStock: input.minStock ?? 0,
        hpp,
        barcode: input.barcode?.trim() || null,
        createdBy: userId ?? null,
      })
      .returning();
    // Bahan baru dari WMS langsung masuk katalog OS → bisa dipakai di resep menu.
    await mirrorWmsProductToOs(db, prod, { packPrice: input.packPrice, packQty: input.packQty, packName: input.packName });

    // Stok awal: catat masuk ke ruang gudang utama sesuai area kategori (atau dipilih).
    const initial = Number(input.initialStock ?? 0);
    if (initial > 0) {
      const target = input.initialWarehouseId ?? (await mainWarehouseForArea(db, cat.area));
      if (target) {
        await recordStockMovement(db, {
          type: "in",
          productId: prod.id,
          warehouseId: target,
          deltaQty: initial,
          hpp,
          refDoc: "STOK-AWAL",
          userId: userId ?? null,
          batchNo: `INIT-${prod.sku}`,
        });
      }
    }
    await writeMasterAudit(db, {
      actor: actor ?? { userId },
      action: "Tambah bahan baku",
      object: prod.sku,
      metadata: { productId: prod.id, name: prod.name, category: prod.category, unit: prod.unit, hpp, initialStock: initial },
    });
    return prod;
  };
  return dbOverride ? run(dbOverride) : runInTx(run);
}

/**
 * Stok awal (saldo pembukaan) bahan yang sudah ada — dari form produk/resep. Masuk ke
 * gudang utama area kategorinya (atau ruang dipilih) dengan HPP rata-rata saat ini,
 * jadi rata-rata tidak berubah & tidak tercatat sebagai belanja (beli = Receiving).
 */
export async function recordOpeningStock(
  input: { sku: string; qty: number; warehouseId?: string | null; expiredAt?: Date | null; onlyIfEmpty?: boolean },
  userId?: string | null,
) {
  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error("Jumlah stok awal harus lebih dari 0.");
  await ensureWmsSeeded();
  return runInTx(async (tx) => {
    const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.sku, input.sku.trim())).limit(1);
    if (!prod || prod.archivedAt) throw new Error("Bahan tidak ditemukan di gudang.");
    if (input.onlyIfEmpty) {
      // Master Data: stok awal hanya sekali — bahan yang sudah punya riwayat stok dikoreksi lewat Opname.
      const [moved] = await tx.select({ id: wmsStockMovement.id }).from(wmsStockMovement).where(eq(wmsStockMovement.productId, prod.id)).limit(1);
      if (moved) throw new Error(`${prod.sku} sudah punya riwayat stok. Untuk koreksi gunakan Stock Opname, bukan stok awal.`);
    }
    let target = input.warehouseId ?? null;
    if (!target) {
      const [cat] = await tx.select({ area: wmsCategory.area }).from(wmsCategory).where(eq(wmsCategory.name, prod.category)).limit(1);
      target = await mainWarehouseForArea(tx, cat?.area ?? "umum");
    }
    if (!target) throw new Error("Gudang utama untuk bahan ini belum ada.");
    await recordStockMovement(tx, {
      type: "in",
      productId: prod.id,
      warehouseId: target,
      deltaQty: qty,
      hpp: Number(prod.hpp),
      refDoc: "STOK-AWAL",
      userId: userId ?? null,
      batchNo: `INIT-${prod.sku}`,
      expiredAt: input.expiredAt ?? null,
    });
    return { sku: prod.sku, qty, warehouseId: target };
  });
}

// =============================================================================
// Master data: Kategori (ber-area bar/dapur/umum) + Supplier. Owner bebas tambah.
// =============================================================================

export type WmsArea = "bar" | "dapur" | "umum";

const WMS_AREAS: readonly WmsArea[] = ["bar", "dapur", "umum"];

type CategoryRow = typeof wmsCategory.$inferSelect;
const categoryOut = (r: CategoryRow, productCount = 0) => ({
  id: r.id,
  name: r.name,
  area: r.area as WmsArea,
  archived: Boolean(r.archivedAt),
  productCount,
});

/** Default hanya kategori aktif (untuk dropdown). includeArchived = halaman Master. */
export async function listWmsCategories(opts?: { includeArchived?: boolean }) {
  await ensureWmsSeeded();
  const db = getDb();
  const rows = await db
    .select()
    .from(wmsCategory)
    .where(opts?.includeArchived ? sql`true` : sql`${wmsCategory.archivedAt} is null`)
    .orderBy(wmsCategory.area, wmsCategory.name);
  const counts = await db
    .select({ category: wmsProduct.category, n: sql<number>`count(*)::int` })
    .from(wmsProduct)
    .where(sql`${wmsProduct.archivedAt} is null`)
    .groupBy(wmsProduct.category);
  const byName = new Map(counts.map((c) => [c.category, Number(c.n)]));
  return rows.map((r) => categoryOut(r, byName.get(r.name) ?? 0));
}

export async function createWmsCategory(input: { name: string; area?: WmsArea }, actor?: MasterActor) {
  const name = input.name.trim();
  if (!name) throw new WmsMasterError("CATEGORY_NAME_REQUIRED", "Nama kategori wajib.", 400);
  const area = input.area && WMS_AREAS.includes(input.area) ? input.area : "umum";
  return runInTx(async (tx) => {
    // Nama sama (beda huruf besar/kecil) = kategori yang sama → perbarui area & pulihkan.
    const [existing] = await tx.select().from(wmsCategory).where(sql`lower(${wmsCategory.name}) = lower(${name})`).limit(1);
    const [row] = existing
      ? await tx.update(wmsCategory).set({ area, archivedAt: null }).where(eq(wmsCategory.id, existing.id)).returning()
      : await tx.insert(wmsCategory).values({ name, area }).returning();
    await writeMasterAudit(tx, {
      actor,
      action: existing ? "Perbarui kategori bahan" : "Tambah kategori bahan",
      object: row.name,
      metadata: { categoryId: row.id, area, restored: Boolean(existing?.archivedAt) },
    });
    return categoryOut(row);
  });
}

/** Pasang kategori contoh Garage (Bar/Dapur/Umum). Yang sudah ada / diarsipkan tidak disentuh. */
export async function installStandardWmsCategories(actor?: MasterActor) {
  return runInTx(async (tx) => {
    const added = await tx.insert(wmsCategory).values([...STANDARD_WMS_CATEGORIES]).onConflictDoNothing().returning();
    if (added.length) {
      await writeMasterAudit(tx, {
        actor,
        action: "Pasang kategori standar",
        object: "Kategori bahan",
        metadata: { added: added.map((a) => a.name) },
      });
    }
    return { added: added.length, names: added.map((a) => a.name) };
  });
}

/**
 * Ubah nama/area kategori. Bahan menyimpan nama kategori sebagai teks, jadi rename
 * diteruskan ke wms_product & katalog OS dalam transaksi yang sama (area bahan tetap benar).
 */
export async function updateWmsCategory(id: string, patch: { name?: string; area?: WmsArea; archived?: boolean }, actor?: MasterActor) {
  return runInTx(async (tx) => {
    const [cat] = await tx.select().from(wmsCategory).where(eq(wmsCategory.id, id)).limit(1);
    if (!cat) return null;
    const set: Partial<CategoryRow> = {};
    const nextName = patch.name?.trim();
    if (nextName && nextName !== cat.name) {
      const [dup] = await tx
        .select({ id: wmsCategory.id })
        .from(wmsCategory)
        .where(and(sql`lower(${wmsCategory.name}) = lower(${nextName})`, ne(wmsCategory.id, id)))
        .limit(1);
      if (dup) throw new WmsMasterError("CATEGORY_DUPLICATE", `Kategori "${nextName}" sudah ada.`);
      set.name = nextName;
    }
    if (patch.area !== undefined && WMS_AREAS.includes(patch.area) && patch.area !== cat.area) set.area = patch.area;
    if (patch.archived === false && cat.archivedAt) set.archivedAt = null;
    if (Object.keys(set).length === 0) return categoryOut(cat);

    const [row] = await tx.update(wmsCategory).set(set).where(eq(wmsCategory.id, id)).returning();
    let renamedProducts = 0;
    if (set.name) {
      const moved = await tx
        .update(wmsProduct)
        .set({ category: set.name, updatedAt: new Date() })
        .where(eq(wmsProduct.category, cat.name))
        .returning({ id: wmsProduct.id });
      renamedProducts = moved.length;
      await tx.update(inventoryItems).set({ category: set.name, updatedAt: new Date() }).where(eq(inventoryItems.category, cat.name));
    }
    if (set.area) {
      // Katalog OS menyimpan area pemakaian sendiri → samakan.
      await tx
        .update(inventoryItems)
        .set({ usageArea: osUsageArea(set.area), updatedAt: new Date() })
        .where(eq(inventoryItems.category, row.name));
    }
    await writeMasterAudit(tx, {
      actor,
      action: set.archivedAt === null ? "Pulihkan kategori bahan" : "Ubah kategori bahan",
      object: row.name,
      metadata: { categoryId: id, changes: diffMaster(cat as Record<string, unknown>, row as Record<string, unknown>, ["name", "area"]), renamedProducts },
    });
    return categoryOut(row);
  });
}

/** Arsipkan kategori (tidak dihapus). Ditolak bila masih dipakai bahan aktif. */
export async function archiveWmsCategory(id: string, actor?: MasterActor) {
  return runInTx(async (tx) => {
    const [cat] = await tx.select().from(wmsCategory).where(eq(wmsCategory.id, id)).limit(1);
    if (!cat) return { ok: false as const, reason: "not_found" as const };
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(wmsProduct)
      .where(and(eq(wmsProduct.category, cat.name), sql`${wmsProduct.archivedAt} is null`));
    if (Number(n) > 0) return { ok: false as const, reason: "in_use" as const, count: Number(n) };
    if (!cat.archivedAt) {
      await tx.update(wmsCategory).set({ archivedAt: new Date() }).where(eq(wmsCategory.id, id));
      await writeMasterAudit(tx, { actor, action: "Arsipkan kategori bahan", object: cat.name, metadata: { categoryId: id } });
    }
    return { ok: true as const };
  });
}

/** @deprecated Kategori tidak lagi dihapus permanen — dipertahankan untuk pemanggil lama. */
export const deleteWmsCategory = archiveWmsCategory;

type SupplierRow = typeof wmsSupplier.$inferSelect;
const supplierOut = (r: SupplierRow, productCount = 0) => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  address: r.address,
  note: r.note,
  picName: r.picName,
  areas: r.areas ?? [],
  productCategories: r.productCategories,
  paymentMethod: r.paymentMethod,
  paymentTermDays: r.paymentTermDays,
  bankName: r.bankName,
  bankAccountNumber: r.bankAccountNumber,
  bankAccountName: r.bankAccountName,
  archived: Boolean(r.archivedAt),
  productCount,
});

/** Rekening supplier hanya untuk Owner/Manajer — peran lain menerima data tanpa rekening. */
export function redactSupplierBank<T extends Record<string, unknown>>(row: T): Omit<T, "bankName" | "bankAccountNumber" | "bankAccountName"> {
  const { bankName: _n, bankAccountNumber: _a, bankAccountName: _h, ...rest } = row as T & { bankName?: unknown; bankAccountNumber?: unknown; bankAccountName?: unknown };
  void _n;
  void _a;
  void _h;
  return rest;
}

/** "1234567890" → "••••7890" untuk audit log (nomor rekening tidak disimpan utuh di log). */
const maskAccount = (v: string) => (v ? `••••${v.slice(-4)}` : "");

export async function listWmsSuppliers(opts?: { includeArchived?: boolean }) {
  const db = getDb();
  const rows = await db
    .select()
    .from(wmsSupplier)
    .where(opts?.includeArchived ? sql`true` : sql`${wmsSupplier.archivedAt} is null`)
    .orderBy(wmsSupplier.name);
  const counts = await db
    .select({ supplierId: wmsProduct.defaultSupplierId, n: sql<number>`count(*)::int` })
    .from(wmsProduct)
    .where(sql`${wmsProduct.archivedAt} is null and ${wmsProduct.defaultSupplierId} is not null`)
    .groupBy(wmsProduct.defaultSupplierId);
  const byId = new Map(counts.map((c) => [c.supplierId, Number(c.n)]));
  return rows.map((r) => supplierOut(r, byId.get(r.id) ?? 0));
}

export type WmsSupplierInput = {
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  picName?: string;
  areas?: string[];
  productCategories?: string;
  paymentMethod?: string;
  paymentTermDays?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
};

/** Field Phase 2 (opsional) → kolom supplier; hanya yang dikirim yang diubah. */
function supplierExtras(input: Partial<WmsSupplierInput>) {
  const set: Partial<SupplierRow> = {};
  if (input.picName !== undefined) set.picName = input.picName.trim();
  if (input.areas !== undefined) set.areas = [...new Set(input.areas.filter((a) => ["bar", "dapur", "umum", "teknik"].includes(a)))];
  if (input.productCategories !== undefined) set.productCategories = input.productCategories.trim();
  if (input.paymentMethod !== undefined) set.paymentMethod = ["cash", "transfer", "tempo"].includes(input.paymentMethod) ? input.paymentMethod : "";
  if (input.paymentTermDays !== undefined) set.paymentTermDays = Math.max(0, Math.min(365, Math.round(input.paymentTermDays)));
  if (input.bankName !== undefined) set.bankName = input.bankName.trim();
  if (input.bankAccountName !== undefined) set.bankAccountName = input.bankAccountName.trim();
  if (input.bankAccountNumber !== undefined) {
    const digits = input.bankAccountNumber.replace(/[\s.-]/g, "");
    if (digits && !/^\d{5,30}$/.test(digits)) throw new WmsMasterError("BANK_ACCOUNT_INVALID", "No. rekening hanya angka (5–30 digit).", 400);
    set.bankAccountNumber = digits;
  }
  return set;
}

export async function createWmsSupplier(input: WmsSupplierInput, actor?: MasterActor) {
  const name = input.name.trim();
  if (!name) throw new WmsMasterError("SUPPLIER_NAME_REQUIRED", "Nama supplier wajib.", 400);
  const phone = normalizeWhatsapp(input.phone);
  return runInTx(async (tx) => {
    const [existing] = await tx.select().from(wmsSupplier).where(sql`lower(${wmsSupplier.name}) = lower(${name})`).limit(1);
    const values = {
      ...supplierExtras(input),
      phone: input.phone !== undefined ? phone : (existing?.phone ?? ""),
      address: input.address !== undefined ? input.address.trim() : (existing?.address ?? ""),
      note: input.note !== undefined ? input.note.trim() : (existing?.note ?? ""),
    };
    const [row] = existing
      ? await tx.update(wmsSupplier).set({ ...values, archivedAt: null }).where(eq(wmsSupplier.id, existing.id)).returning()
      : await tx.insert(wmsSupplier).values({ name, ...values }).returning();
    await writeMasterAudit(tx, {
      actor,
      action: existing ? "Perbarui supplier" : "Tambah supplier",
      object: row.name,
      metadata: { supplierId: row.id, restored: Boolean(existing?.archivedAt) },
    });
    return supplierOut(row);
  });
}

export async function updateWmsSupplier(id: string, patch: Partial<WmsSupplierInput> & { archived?: boolean }, actor?: MasterActor) {
  return runInTx(async (tx) => {
    const [before] = await tx.select().from(wmsSupplier).where(eq(wmsSupplier.id, id)).limit(1);
    if (!before) return null;
    const set: Partial<SupplierRow> = {};
    const nextName = patch.name?.trim();
    if (nextName && nextName !== before.name) {
      const [dup] = await tx
        .select({ id: wmsSupplier.id })
        .from(wmsSupplier)
        .where(and(sql`lower(${wmsSupplier.name}) = lower(${nextName})`, ne(wmsSupplier.id, id)))
        .limit(1);
      if (dup) throw new WmsMasterError("SUPPLIER_DUPLICATE", `Supplier "${nextName}" sudah ada.`);
      set.name = nextName;
    }
    if (patch.phone !== undefined) set.phone = normalizeWhatsapp(patch.phone);
    if (patch.address !== undefined) set.address = patch.address.trim();
    if (patch.note !== undefined) set.note = patch.note.trim();
    Object.assign(set, supplierExtras(patch));
    if (patch.archived === false) set.archivedAt = null;
    if (Object.keys(set).length === 0) return supplierOut(before);
    const [row] = await tx.update(wmsSupplier).set(set).where(eq(wmsSupplier.id, id)).returning();
    await writeMasterAudit(tx, {
      actor,
      action: patch.archived === false && before.archivedAt ? "Pulihkan supplier" : "Ubah supplier",
      object: row.name,
      metadata: {
        supplierId: id,
        changes: {
          ...diffMaster(before as Record<string, unknown>, row as Record<string, unknown>, [
            "name", "phone", "address", "note", "picName", "productCategories", "paymentMethod", "paymentTermDays", "bankName", "bankAccountName",
          ]),
          ...(before.bankAccountNumber !== row.bankAccountNumber
            ? { bankAccountNumber: { before: maskAccount(before.bankAccountNumber), after: maskAccount(row.bankAccountNumber) } }
            : {}),
        },
      },
    });
    return supplierOut(row);
  });
}

/** Arsip supplier: riwayat receiving/PO & harga tetap utuh; bahan tetap menunjuk supplier ini. */
export async function archiveWmsSupplier(id: string, actor?: MasterActor) {
  return runInTx(async (tx) => {
    const [row] = await tx.update(wmsSupplier).set({ archivedAt: new Date() }).where(eq(wmsSupplier.id, id)).returning();
    if (!row) return { ok: false as const };
    await writeMasterAudit(tx, { actor, action: "Arsipkan supplier", object: row.name, metadata: { supplierId: id } });
    return { ok: true as const };
  });
}

// =============================================================================
// Export / Import Excel (ExcelJS di-import dinamis agar tak membebani bundle lain).
// Kolom template = round-trip (export bisa langsung diedit lalu di-import balik).
// Import TIDAK mengubah stok (stok hanya lewat Receiving/Adjustment) — hanya master.
// =============================================================================

const WMS_EXPORT_COLUMNS = [
  { header: "SKU", key: "sku", width: 16 },
  { header: "Nama", key: "name", width: 30 },
  { header: "Kategori", key: "category", width: 18 },
  { header: "Satuan", key: "unit", width: 10 },
  { header: "Min Stok", key: "minStock", width: 12 },
  { header: "HPP", key: "hpp", width: 12 },
  { header: "Stok", key: "onHand", width: 12 },
  { header: "Barcode", key: "barcode", width: 20 },
  // Kolom tambahan Master Data (ditaruh di belakang supaya validasi kolom C/D tetap).
  { header: "Subkategori", key: "subcategory", width: 16 },
  { header: "Brand", key: "brand", width: 16 },
  { header: "Supplier", key: "supplier", width: 22 },
  { header: "Satuan Beli", key: "packName", width: 12 },
  { header: "Isi Kemasan", key: "packQty", width: 12 },
  { header: "Harga Beli Kemasan", key: "packPrice", width: 18 },
] as const;

export async function exportWmsProductsWorkbook(opts?: { template?: boolean }): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produk");
  ws.columns = WMS_EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };

  if (opts?.template) {
    ws.addRow({ sku: "BAR-001", name: "Contoh: Kopi Arabika", category: "Bahan Bar", unit: "gram", minStock: 2000, hpp: 0.12, onHand: 0, barcode: "", packName: "pack", packQty: 1000, packPrice: 120000 });
  } else {
    for (const p of await getWmsProducts()) {
      ws.addRow({
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        minStock: p.minStock,
        hpp: p.hpp,
        onHand: p.onHand,
        barcode: p.barcode ?? "",
        subcategory: p.subcategory ?? "",
        brand: p.brand ?? "",
        supplier: p.supplierName ?? "",
        packName: p.packQty > 0 ? packNameOf(p.packageLabel) : "",
        packQty: p.packQty > 0 ? p.packQty : "",
        packPrice: p.packQty > 0 ? p.packPrice : "",
      });
    }
  }

  // Dropdown validasi (ikut master): sheet tersembunyi "Master" berisi daftar
  // kategori & satuan → kolom Kategori (C) & Satuan (D) memilih dari daftar ini.
  const units = ["gram", "kg", "ml", "liter", "pcs", "pack", "sachet", "botol"];
  const cats = await listWmsCategories();
  const master = wb.addWorksheet("Master");
  master.state = "hidden";
  master.getCell("A1").value = "Kategori";
  master.getCell("B1").value = "Satuan";
  cats.forEach((c, i) => { master.getCell(`A${i + 2}`).value = c.name; });
  units.forEach((u, i) => { master.getCell(`B${i + 2}`).value = u; });
  const lastCat = Math.max(2, cats.length + 1);
  const lastUnit = units.length + 1;
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`Master!$A$2:$A$${lastCat}`] };
    ws.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`Master!$B$2:$B$${lastUnit}`] };
  }

  // Catatan: kolom "Stok" hanya informasi — diabaikan saat import (stok lewat Receiving/Adjustment).
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type { ImportRowAction, ImportRowResult } from "@/lib/bulk-import";

export type WmsImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  /** Jumlah baris error (dilewati). */
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  rows: ImportRowResult[];
  mapping: Record<string, string>;
  ignored: string[];
  dryRun: boolean;
};

const WMS_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "sku", label: "SKU", aliases: ["kode", "kode bahan", "sku bahan"], required: true },
  { key: "name", label: "Nama", aliases: ["nama bahan", "name", "nama produk"] },
  { key: "category", label: "Kategori", aliases: ["category"] },
  { key: "unit", label: "Satuan", aliases: ["unit", "satuan simpan"] },
  { key: "minStock", label: "Min Stok", aliases: ["min", "minimum", "min stock", "stok minimum"] },
  { key: "hpp", label: "HPP", aliases: ["hpp per satuan", "harga modal", "modal", "unit cost"] },
  { key: "barcode", label: "Barcode", aliases: ["ean", "kode barcode"] },
  { key: "onHand", label: "Stok", aliases: ["stock", "on hand"] },
  { key: "subcategory", label: "Subkategori", aliases: ["sub kategori", "subcategory"] },
  { key: "brand", label: "Brand", aliases: ["merek", "merk"] },
  { key: "supplier", label: "Supplier", aliases: ["supplier utama", "pemasok"] },
  { key: "packName", label: "Satuan Beli", aliases: ["satuan pembelian", "kemasan"] },
  { key: "packQty", label: "Isi Kemasan", aliases: ["isi per kemasan", "isi"] },
  { key: "packPrice", label: "Harga Beli Kemasan", aliases: ["harga beli", "harga per kemasan", "harga kemasan"] },
];

/** "botol 760 ml" → "botol" (label kemasan katalog OS). */
function packNameOf(label: string | null | undefined): string {
  const m = (label ?? "").trim().match(/^([^d]+?)s+[d.,]+/);
  return m ? m[1].trim() : "";
}

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/**
 * Impor bahan baku (CSV/XLSX) → buat baru / perbarui berdasar SKU.
 * - dryRun: pratinjau per baris (buat / ubah + daftar perubahan / tetap / error).
 * - commit: hanya baris valid, SEMUA dalam satu transaksi + audit log.
 * - Sel kosong = tidak diubah (barcode/HPP lama tidak terhapus).
 * - SKU ganda dalam file, kategori tak dikenal, angka tidak valid → error per baris.
 * - Kolom Stok diabaikan (stok hanya lewat Penerimaan/Penyesuaian).
 */
export async function importWmsProductsFromBuffer(
  buffer: Buffer,
  opts: { dryRun: boolean; filename?: string; actorName?: string },
  userId?: string | null,
): Promise<WmsImportResult> {
  const sheet = await parseImportFile(buffer, opts.filename ?? "import.xlsx", WMS_IMPORT_COLUMNS);
  if (sheet.missingRequired.length) {
    throw new Error(`Kolom wajib tidak ditemukan: ${sheet.missingRequired.join(", ")}. Gunakan template impor.`);
  }

  const db = getDb();
  const products = await db.select().from(wmsProduct);
  const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
  const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [String(p.barcode).trim(), p]));
  const categories = await listWmsCategories();
  const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.name]));
  const suppliers = await listWmsSuppliers();
  const supplierByName = new Map(suppliers.map((x) => [x.name.trim().toLowerCase(), x]));
  const packs = await db
    .select({ sku: inventoryItems.sku, packageQty: inventoryItems.packageQty, purchasePrice: inventoryItems.purchasePrice })
    .from(inventoryItems);
  const packBySku = new Map(packs.map((x) => [x.sku.trim().toLowerCase(), x]));

  const result: WmsImportResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    rows: [],
    mapping: sheet.mapping,
    ignored: sheet.ignored,
    dryRun: opts.dryRun,
  };
  type Plan =
    | { kind: "create"; input: Parameters<typeof createWmsProduct>[0] }
    | { kind: "update"; id: string; patch: Parameters<typeof updateWmsProduct>[1] };
  const plans: Plan[] = [];
  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();

  for (const { rowNo, values } of sheet.rows) {
    const sku = values.sku ?? "";
    const fail = (message: string) => {
      result.rows.push({ row: rowNo, key: sku || "-", name: values.name ?? "", action: "error", message });
      result.errors.push({ row: rowNo, message: sku ? `SKU ${sku}: ${message}` : message });
      result.skipped += 1;
    };
    if (!sku) {
      fail("SKU wajib diisi.");
      continue;
    }
    if (!SKU_PATTERN.test(sku)) {
      fail("SKU hanya boleh huruf, angka, titik, strip, garis bawah (maks. 40 karakter).");
      continue;
    }
    const skuKey = sku.toLowerCase();
    if (seenSku.has(skuKey)) {
      fail(`SKU ganda dalam file (sudah ada di baris ${seenSku.get(skuKey)}).`);
      continue;
    }
    seenSku.set(skuKey, rowNo);

    const name = (values.name ?? "").trim();
    const categoryRaw = (values.category ?? "").trim();
    const unit = (values.unit ?? "").trim();
    const barcode = (values.barcode ?? "").trim();
    const minStock = parseLocaleNumber(values.minStock ?? "");
    const hpp = parseLocaleNumber(values.hpp ?? "");
    if (name.length > 120) {
      fail("Nama maksimal 120 karakter.");
      continue;
    }
    if (unit.length > 20) {
      fail("Satuan maksimal 20 karakter.");
      continue;
    }
    if (minStock !== null && (Number.isNaN(minStock) || minStock < 0)) {
      fail(`Min Stok "${values.minStock}" harus angka ≥ 0.`);
      continue;
    }
    if (hpp !== null && (Number.isNaN(hpp) || hpp < 0)) {
      fail(`HPP "${values.hpp}" harus angka ≥ 0.`);
      continue;
    }
    const subcategory = (values.subcategory ?? "").trim();
    const brand = (values.brand ?? "").trim();
    const supplierRaw = (values.supplier ?? "").trim();
    const packName = (values.packName ?? "").trim();
    const packQty = parseLocaleNumber(values.packQty ?? "");
    const packPrice = parseLocaleNumber(values.packPrice ?? "");
    if (subcategory.length > 80 || brand.length > 80) {
      fail("Subkategori/Brand maksimal 80 karakter.");
      continue;
    }
    if (packQty !== null && (Number.isNaN(packQty) || packQty <= 0)) {
      fail(`Isi Kemasan "${values.packQty}" harus angka > 0 (dalam satuan dasar, mis. 1000 untuk 1 pack = 1.000 gram).`);
      continue;
    }
    if (packPrice !== null && (Number.isNaN(packPrice) || packPrice < 0)) {
      fail(`Harga Beli Kemasan "${values.packPrice}" harus angka ≥ 0.`);
      continue;
    }
    let supplierId: string | null = null;
    if (supplierRaw) {
      supplierId = supplierByName.get(supplierRaw.toLowerCase())?.id ?? null;
      if (!supplierId) {
        fail(`Supplier "${supplierRaw}" belum ada di master. Tambahkan dulu di Master Data → Supplier.`);
        continue;
      }
    }
    let category: string | null = null;
    if (categoryRaw) {
      category = categoryByName.get(categoryRaw.toLowerCase()) ?? null;
      if (!category) {
        fail(`Kategori "${categoryRaw}" belum ada di master. Tambahkan dulu di Gudang → Kategori.`);
        continue;
      }
    }
    if (barcode) {
      if (seenBarcode.has(barcode)) {
        fail(`Barcode ganda dalam file (baris ${seenBarcode.get(barcode)}).`);
        continue;
      }
      const owner = byBarcode.get(barcode);
      if (owner && owner.sku.trim().toLowerCase() !== skuKey) {
        fail(`Barcode ${barcode} sudah dipakai bahan ${owner.sku}.`);
        continue;
      }
      seenBarcode.set(barcode, rowNo);
    }

    const existing = bySku.get(skuKey);
    if (!existing) {
      if (!name || !category) {
        fail("Bahan baru wajib punya Nama dan Kategori.");
        continue;
      }
      if ((packQty === null) !== (packPrice === null)) {
        fail("Isi Kemasan dan Harga Beli Kemasan harus diisi berdua supaya HPP per satuan bisa dihitung.");
        continue;
      }
      plans.push({
        kind: "create",
        input: {
          sku,
          name,
          category,
          unit: unit || "pcs",
          minStock: minStock ?? 0,
          hpp: hpp ?? 0,
          barcode: barcode || null,
          subcategory,
          brand,
          defaultSupplierId: supplierId,
          ...(packQty !== null && packPrice !== null ? { packQty, packPrice, packName: packName || undefined } : {}),
        },
      });
      result.rows.push({ row: rowNo, key: sku, name, action: "create" });
      result.created += 1;
      continue;
    }

    // Perbarui hanya kolom yang diisi & benar-benar berbeda.
    const patch: Parameters<typeof updateWmsProduct>[1] = {};
    const changes: string[] = [];
    if (name && name !== existing.name) {
      patch.name = name;
      changes.push(`Nama: ${existing.name} → ${name}`);
    }
    if (category && category !== existing.category) {
      patch.category = category;
      changes.push(`Kategori: ${existing.category} → ${category}`);
    }
    if (unit && unit !== existing.unit) {
      // Satuan dasar terkunci bila bahan sudah punya stok/ledger/resep → error per baris
      // di pratinjau, bukan gagal di tengah transaksi impor.
      try {
        await assertUnitChangeAllowed(db, existing, unit);
      } catch (e) {
        fail(e instanceof Error ? e.message : "Satuan dasar tidak bisa diganti.");
        continue;
      }
      patch.unit = unit;
      changes.push(`Satuan: ${existing.unit} → ${unit}`);
    }
    if (minStock !== null && Math.abs(minStock - Number(existing.minStock)) > 1e-4) {
      patch.minStock = minStock;
      changes.push(`Min stok: ${Number(existing.minStock)} → ${minStock}`);
    }
    if (hpp !== null && Math.abs(hpp - Number(existing.hpp)) > 1e-4) {
      patch.hpp = hpp;
      changes.push(`HPP: ${Number(existing.hpp)} → ${hpp}`);
    }
    if (barcode && barcode !== (existing.barcode ?? "")) {
      patch.barcode = barcode;
      changes.push(`Barcode: ${existing.barcode || "-"} → ${barcode}`);
    }
    if (subcategory && subcategory !== existing.subcategory) {
      patch.subcategory = subcategory;
      changes.push(`Subkategori: ${existing.subcategory || "-"} → ${subcategory}`);
    }
    if (brand && brand !== existing.brand) {
      patch.brand = brand;
      changes.push(`Brand: ${existing.brand || "-"} → ${brand}`);
    }
    if (supplierId && supplierId !== existing.defaultSupplierId) {
      patch.defaultSupplierId = supplierId;
      changes.push(`Supplier: → ${supplierRaw}`);
    }
    if (packQty !== null || packPrice !== null) {
      // Satu kolom diisi → lengkapi dari katalog lama supaya HPP per satuan tetap bisa dihitung.
      const cur = packBySku.get(skuKey);
      const nextQty = packQty ?? Number(cur?.packageQty ?? 0);
      const nextPrice = packPrice ?? Number(cur?.purchasePrice ?? 0);
      const sameQty = Math.abs(nextQty - Number(cur?.packageQty ?? 0)) < 1e-6;
      const samePrice = Math.abs(nextPrice - Number(cur?.purchasePrice ?? 0)) < 1e-6;
      if (!(nextQty > 0)) {
        fail("Isi Kemasan belum ada — isi kolom Isi Kemasan (> 0).");
        continue;
      }
      if (!sameQty || !samePrice) {
        Object.assign(patch, { packQty: nextQty, packPrice: nextPrice, packName: packName || undefined });
        changes.push(`Kemasan: ${Number(cur?.packageQty ?? 0)} @ Rp${Number(cur?.purchasePrice ?? 0)} → ${nextQty} @ Rp${nextPrice} (HPP/satuan dihitung ulang)`);
      }
    }
    if (existing.archivedAt) {
      patch.archivedAt = null;
      changes.push("Dipulihkan dari arsip");
    }
    if (!changes.length) {
      result.rows.push({ row: rowNo, key: sku, name: existing.name, action: "unchanged" });
      result.unchanged += 1;
      continue;
    }
    plans.push({ kind: "update", id: existing.id, patch });
    result.rows.push({ row: rowNo, key: sku, name: name || existing.name, action: "update", changes });
    result.updated += 1;
  }

  if (opts.dryRun || plans.length === 0) return result;

  await runInTx(async (tx) => {
    for (const plan of plans) {
      const actor = { userId: userId ?? null, name: opts.actorName ?? null };
      if (plan.kind === "create") await createWmsProduct(plan.input, userId, tx, actor);
      else await updateWmsProduct(plan.id, plan.patch, tx, actor);
    }
    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: opts.actorName ?? "Gudang",
      action: "Impor massal bahan baku",
      object: opts.filename ?? "file impor",
      device: "Garage OS",
      status: "recorded",
      metadata: { created: result.created, updated: result.updated, unchanged: result.unchanged, errors: result.skipped },
    });
  });
  return result;
}

/** Template impor bahan baku (XLSX dengan daftar kategori / CSV). */
export async function wmsImportTemplate(format: "xlsx" | "csv") {
  // Urutan = WMS_IMPORT_COLUMNS. Susu: 1 karton = 12.000 ml @ Rp222.000 → HPP Rp18,5/ml.
  const examples = [["BAR-901", "Contoh: Susu UHT 1L", "", "ml", "2000", "", "", "", "UHT", "Diamond", "", "karton", "12000", "222000"]];
  if (format === "csv") return Buffer.from(templateCsv(WMS_IMPORT_COLUMNS, examples), "utf8");
  const categories = await listWmsCategories();
  return templateXlsx({
    sheetName: "Bahan",
    columns: WMS_IMPORT_COLUMNS,
    examples,
    lists: { category: categories.map((c) => c.name), unit: ["gr", "kg", "ml", "liter", "pcs", "pack", "sachet", "botol"] },
    notes: [
      "1 baris = 1 bahan. Cocok berdasarkan SKU: SKU baru → dibuat, SKU yang sudah ada → diperbarui.",
      "Bahan baru wajib Nama & Kategori (pilih dari daftar kategori gudang).",
      "Sel kosong = tidak diubah. HPP = harga per satuan simpan (boleh desimal, mis. 18,5 per ml).",
      "Isi Kemasan + Harga Beli Kemasan → HPP per satuan dihitung otomatis (menang atas kolom HPP). Isi dalam satuan dasar: 1 pack kopi = 1000 (gram).",
      "Satuan dasar bahan yang sudah punya stok/resep tidak bisa diganti lewat impor.",
      "Kolom Stok diabaikan — stok hanya berubah lewat Penerimaan / Penyesuaian.",
      "Hapus baris contoh sebelum mengunggah. Maks. 2.000 baris, 5 MB.",
    ],
  });
}

export async function getWmsDashboard(params?: { warehouseId?: string }): Promise<WmsDashboard> {
  await ensureWmsSeeded();
  const db = getDb();
  const whId = params?.warehouseId ?? (await primaryWarehouseId(db));

  const products = await getWmsProducts({ warehouseId: whId ?? undefined });
  const lowStock = products.filter((p) => p.status === "low").length;
  const outOfStock = products.filter((p) => p.status === "out").length;
  const stockValue = Math.round(products.reduce((s, p) => s + p.onHand * p.hpp, 0));

  // Pergerakan hari ini (kalender Asia/Jakarta, bukan sekadar 24 jam terakhir).
  const [{ today }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(wmsStockMovement)
    .where(
      sql`(${wmsStockMovement.createdAt} AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date`,
    );

  // Tren 7 hari (masuk vs keluar) dari ledger.
  const trendRows = await db
    .select({
      day: sql<string>`to_char(${wmsStockMovement.createdAt} AT TIME ZONE 'Asia/Jakarta', 'DD/MM')`,
      masuk: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} > 0 then ${wmsStockMovement.qty} else 0 end), 0)`,
      keluar: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then -${wmsStockMovement.qty} else 0 end), 0)`,
    })
    .from(wmsStockMovement)
    .where(sql`${wmsStockMovement.createdAt} >= now() - interval '7 days'`)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const recent = await db
    .select({
      id: wmsStockMovement.id,
      type: wmsStockMovement.type,
      qty: wmsStockMovement.qty,
      refDoc: wmsStockMovement.refDoc,
      createdAt: wmsStockMovement.createdAt,
      productName: wmsProduct.name,
    })
    .from(wmsStockMovement)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsStockMovement.productId))
    .orderBy(desc(wmsStockMovement.createdAt))
    .limit(8);

  const alerts = products
    .filter((p) => p.status !== "in")
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      level: p.status,
      text:
        p.status === "out"
          ? `${p.name} habis — segera restock`
          : `${p.name} menipis (${p.onHand} ${p.unit}, min ${p.minStock})`,
    }));

  return {
    kpis: {
      totalProducts: products.length,
      lowStock,
      outOfStock,
      stockValue,
      movementsToday: Number(today),
    },
    trend: trendRows.map((r) => ({ label: r.day, masuk: Number(r.masuk), keluar: Number(r.keluar) })),
    alerts,
    recentMovements: recent.map((r) => ({
      id: r.id,
      type: r.type as MoveType,
      productName: r.productName ?? "-",
      qty: Number(r.qty),
      refDoc: r.refDoc,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// =============================================================================
// FASE 2 — Receiving (penerimaan barang). Saat complete: +stok + buat batch +
// update HPP rata-rata produk (weighted average) + catat ledger.
// =============================================================================

export function makeWmsDoc(prefix: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

async function totalOnHand(db: Db, productId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${wmsWarehouseStock.qty}), 0)` })
    .from(wmsWarehouseStock)
    .where(eq(wmsWarehouseStock.productId, productId));
  return Number(row?.total ?? 0);
}

export type ReceivingItemInput = {
  productId: string;
  orderedQty: number;
  receivedQty: number;
  hpp: number;
  qc?: "pass" | "discrepancy" | "reject";
  batchNo?: string;
  expiredAt?: string | null;
  buyQty?: number | null; // qty kemasan beli (mis. 5 dus)
  packSize?: number | null; // isi per kemasan (mis. 24 pcs/dus)
  buyUnit?: string | null; // satuan beli (dus/karton)
  discrepancyNote?: string;
  putAwayLocation?: string;
};

/** Nama supplier (teks) → id master supplier; null bila belum terdaftar. */
export async function supplierIdForName(db: Db, name: string): Promise<string | null> {
  if (!name.trim()) return null;
  const [row] = await db
    .select({ id: wmsSupplier.id })
    .from(wmsSupplier)
    .where(sql`lower(trim(${wmsSupplier.name})) = ${name.trim().toLowerCase()}`)
    .limit(1);
  return row?.id ?? null;
}

export async function createReceiving(
  input: {
    supplier?: string;
    poNumber?: string;
    additionalCost?: number;
    warehouseId?: string;
    paymentMethod?: PurchasePaymentMethod;
    receivedDate?: string | null;
    purchaseOrderId?: string | null;
    items: ReceivingItemInput[];
  },
  userId?: string | null,
) {
  const db = getDb();
  const whId = input.warehouseId ?? (await primaryWarehouseId(db));
  const receivedDate = normalizeReceivedDate(input.receivedDate);
  const supplierName = input.supplier?.trim() ?? "";
  const [rec] = await db
    .insert(wmsReceiving)
    .values({
      doc: makeWmsDoc("RCV"),
      supplier: supplierName,
      supplierId: await supplierIdForName(db, supplierName),
      purchaseOrderId: input.purchaseOrderId ?? null,
      poNumber: input.poNumber?.trim() ?? "",
      additionalCost: input.additionalCost ?? 0,
      warehouseId: whId,
      paymentMethod: input.paymentMethod ?? "Cash",
      receivedDate,
      status: "draft",
      createdBy: userId ?? null,
    })
    .returning();

  if (input.items.length) {
    await db.insert(wmsReceivingItem).values(
      input.items.map((it) => {
        // Konversi satuan beli→simpan: bila buyQty & packSize diisi → receivedQty otomatis.
        const buyQty = it.buyQty && it.buyQty > 0 ? it.buyQty : null;
        const packSize = it.packSize && it.packSize > 0 ? it.packSize : null;
        const received = buyQty && packSize ? buyQty * packSize : it.receivedQty;
        return {
          receivingId: rec.id,
          productId: it.productId,
          orderedQty: it.orderedQty,
          receivedQty: received,
          hpp: it.hpp,
          buyQty,
          packSize,
          buyUnit: it.buyUnit?.trim() || null,
          discrepancyNote: it.discrepancyNote?.trim() ?? "",
          putAwayLocation: it.putAwayLocation?.trim() ?? "",
          qc: it.qc ?? "pass",
          batchNo: it.batchNo ?? null,
          expiredAt: it.expiredAt ? new Date(it.expiredAt) : null,
        };
      }),
    );
  }
  return rec;
}

export async function listReceivings() {
  const db = getDb();
  const rows = await db
    .select({
      id: wmsReceiving.id,
      doc: wmsReceiving.doc,
      supplier: wmsReceiving.supplier,
      status: wmsReceiving.status,
      paymentMethod: wmsReceiving.paymentMethod,
      receivedDate: wmsReceiving.receivedDate,
      createdAt: wmsReceiving.createdAt,
      items: sql<number>`count(${wmsReceivingItem.id})::int`,
      totalValue: sql<number>`coalesce(sum(${wmsReceivingItem.receivedQty} * ${wmsReceivingItem.hpp}), 0)`,
    })
    .from(wmsReceiving)
    .leftJoin(wmsReceivingItem, eq(wmsReceivingItem.receivingId, wmsReceiving.id))
    .groupBy(wmsReceiving.id)
    .orderBy(desc(wmsReceiving.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    doc: r.doc,
    supplier: r.supplier,
    status: r.status,
    paymentMethod: r.paymentMethod,
    receivedDate: r.receivedDate ? String(r.receivedDate) : null,
    items: Number(r.items),
    totalValue: Math.round(Number(r.totalValue)),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getReceiving(id: string) {
  const db = getDb();
  const [rec] = await db.select().from(wmsReceiving).where(eq(wmsReceiving.id, id)).limit(1);
  if (!rec) return null;
  const items = await db
    .select({
      id: wmsReceivingItem.id,
      productId: wmsReceivingItem.productId,
      productName: wmsProduct.name,
      category: wmsProduct.category,
      sku: wmsProduct.sku,
      unit: wmsProduct.unit,
      orderedQty: wmsReceivingItem.orderedQty,
      receivedQty: wmsReceivingItem.receivedQty,
      buyQty: wmsReceivingItem.buyQty,
      packSize: wmsReceivingItem.packSize,
      buyUnit: wmsReceivingItem.buyUnit,
      hpp: wmsReceivingItem.hpp,
      qc: wmsReceivingItem.qc,
      batchNo: wmsReceivingItem.batchNo,
      expiredAt: wmsReceivingItem.expiredAt,
      discrepancyNote: wmsReceivingItem.discrepancyNote,
      putAwayLocation: wmsReceivingItem.putAwayLocation,
    })
    .from(wmsReceivingItem)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsReceivingItem.productId))
    .where(eq(wmsReceivingItem.receivingId, id));
  return {
    id: rec.id,
    doc: rec.doc,
    supplier: rec.supplier,
    poNumber: rec.poNumber,
    additionalCost: Number(rec.additionalCost ?? 0),
    warehouseId: rec.warehouseId,
    status: rec.status,
    paymentMethod: rec.paymentMethod,
    receivedDate: rec.receivedDate ? String(rec.receivedDate) : null,
    completedAt: rec.completedAt ? rec.completedAt.toISOString() : null,
    cancelledAt: rec.cancelledAt ? rec.cancelledAt.toISOString() : null,
    cancelReason: rec.cancelReason ?? null,
    createdAt: rec.createdAt.toISOString(),
    items: items.map((it) => ({
      ...it,
      expiredAt: it.expiredAt ? it.expiredAt.toISOString() : null,
    })),
  };
}

/** Update draft receiving (hanya status draft / pending_approval). */
export async function updateReceiving(
  id: string,
  input: {
    supplier?: string;
    poNumber?: string;
    additionalCost?: number;
    warehouseId?: string;
    paymentMethod?: PurchasePaymentMethod;
    receivedDate?: string | null;
    items: ReceivingItemInput[];
  },
) {
  const db = getDb();
  const [rec] = await db.select().from(wmsReceiving).where(eq(wmsReceiving.id, id)).limit(1);
  if (!rec) return null;
  if (rec.status !== "draft" && rec.status !== "pending_approval") {
    throw new Error("Hanya draft yang bisa diedit.");
  }
  await db
    .update(wmsReceiving)
    .set({
      supplier: input.supplier?.trim() ?? rec.supplier,
      supplierId: input.supplier !== undefined ? await supplierIdForName(db, input.supplier.trim()) : rec.supplierId,
      poNumber: input.poNumber?.trim() ?? rec.poNumber,
      additionalCost: input.additionalCost ?? rec.additionalCost,
      warehouseId: input.warehouseId ?? rec.warehouseId,
      paymentMethod: input.paymentMethod ?? rec.paymentMethod,
      receivedDate: input.receivedDate !== undefined ? normalizeReceivedDate(input.receivedDate) : rec.receivedDate,
      status: "draft",
    })
    .where(eq(wmsReceiving.id, id));
  await db.delete(wmsReceivingItem).where(eq(wmsReceivingItem.receivingId, id));
  if (input.items.length) {
    await db.insert(wmsReceivingItem).values(
      input.items.map((it) => {
        const buyQty = it.buyQty && it.buyQty > 0 ? it.buyQty : null;
        const packSize = it.packSize && it.packSize > 0 ? it.packSize : null;
        const received = buyQty && packSize ? buyQty * packSize : it.receivedQty;
        return {
          receivingId: id,
          productId: it.productId,
          orderedQty: it.orderedQty,
          receivedQty: received,
          hpp: it.hpp,
          buyQty,
          packSize,
          buyUnit: it.buyUnit?.trim() || null,
          discrepancyNote: it.discrepancyNote?.trim() ?? "",
          putAwayLocation: it.putAwayLocation?.trim() ?? "",
          qc: it.qc ?? "pass",
          batchNo: it.batchNo ?? null,
          expiredAt: it.expiredAt ? new Date(it.expiredAt) : null,
        };
      }),
    );
  }
  return getReceiving(id);
}

/** Statistik receiving untuk dashboard. */
export async function getWmsReceivingStats() {
  const db = getDb();
  const [{ todayCount }] = await db
    .select({ todayCount: sql<number>`count(*)::int` })
    .from(wmsReceiving)
    .where(
      sql`(${wmsReceiving.createdAt} AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date`,
    );
  const [{ todayValue }] = await db
    .select({
      todayValue: sql<number>`coalesce(sum(${wmsReceivingItem.receivedQty} * ${wmsReceivingItem.hpp}), 0)`,
    })
    .from(wmsReceivingItem)
    .innerJoin(wmsReceiving, eq(wmsReceiving.id, wmsReceivingItem.receivingId))
    .where(
      and(
        eq(wmsReceiving.status, "completed"),
        sql`(${wmsReceiving.createdAt} AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date`,
      ),
    );
  const [{ draftCount }] = await db
    .select({ draftCount: sql<number>`count(*)::int` })
    .from(wmsReceiving)
    .where(or(eq(wmsReceiving.status, "draft"), eq(wmsReceiving.status, "pending_approval")));
  return {
    todayCount: Number(todayCount),
    todayValue: Math.round(Number(todayValue)),
    draftCount: Number(draftCount),
  };
}

/** Generate nomor PO draft dari smart reorder. */
export async function generateWmsPoDraft() {
  const reorder = await getWmsSmartReorder();
  const poNumber = makeWmsDoc("PO");
  return {
    poNumber,
    items: reorder.items
      .filter((i) => i.suggestedQty > 0)
      .map((i) => ({
        productId: i.id,
        sku: i.sku,
        name: i.name,
        unit: i.unit,
        orderedQty: i.suggestedQty,
        hpp: 0,
      })),
  };
}

/** Selesaikan receiving: hanya item QC pass/discrepancy yang diterima → +stok +batch +HPP avg. */
/** Selisih >10% (qty pesan vs terima, atau harga terima vs harga PO) — perlu konfirmasi Owner/Manajer. */
export class ReceivingDiscrepancyError extends Error {
  readonly lines: string[];
  constructor(doc: string, lines: string[]) {
    super(`Selisih >10% pada ${doc}: ${lines.join("; ")}. Konfirmasi selisih untuk menyelesaikan.`);
    this.name = "ReceivingDiscrepancyError";
    this.lines = lines;
  }
}

export async function completeReceiving(
  id: string,
  userId?: string | null,
  opts?: { forceApprove?: boolean; actorName?: string },
) {
  // Cek hari terkunci (Daily Closing) di luar transaksi — query di dalam tx lain
  // akan menunggu koneksi yang sama (deadlock di driver single-connection).
  const [pre] = await getDb()
    .select({ receivedDate: wmsReceiving.receivedDate, status: wmsReceiving.status })
    .from(wmsReceiving)
    .where(eq(wmsReceiving.id, id))
    .limit(1);
  if (pre?.receivedDate && pre.status !== "completed") {
    const { assertFinanceDayOpen } = await import("@/lib/finance-closing");
    await assertFinanceDayOpen(purchaseDateFor(String(pre.receivedDate)));
  }
  return runInTx(async (tx) => {
    const [rec] = await tx
      .select()
      .from(wmsReceiving)
      .where(eq(wmsReceiving.id, id))
      .for("update")
      .limit(1);
    if (!rec) return null;
    if (rec.status === "completed") return rec;
    if (rec.status === "cancelled") throw new Error("Penerimaan sudah dibatalkan.");
    if (rec.status === "pending_approval" && !opts?.forceApprove) {
      throw new Error("Menunggu approval manager untuk selisih >10%.");
    }
    const whId = rec.warehouseId;
    if (!whId) throw new Error("Receiving tanpa warehouse tidak bisa diselesaikan.");

    const items = await tx
      .select({
        row: wmsReceivingItem,
        productName: wmsProduct.name,
        category: wmsProduct.category,
        sku: wmsProduct.sku,
      })
      .from(wmsReceivingItem)
      .leftJoin(wmsProduct, eq(wmsProduct.id, wmsReceivingItem.productId))
      .where(eq(wmsReceivingItem.receivingId, id));

    const validationLines = items
      .filter((x) => x.row.productId && x.row.qc !== "reject" && Number(x.row.receivedQty) > 0)
      .map((x) => ({
        productId: x.row.productId as string,
        productName: x.productName ?? "",
        category: x.category ?? "",
        orderedQty: Number(x.row.orderedQty),
        receivedQty: Number(x.row.receivedQty),
        qc: x.row.qc,
        expiredAt: x.row.expiredAt?.toISOString() ?? null,
        batchNo: x.row.batchNo,
      }));
    const valErrors = validateReceivingLines(validationLines);
    if (valErrors.length) throw new Error(valErrors.join(" "));

    const qtyLines = items
      .filter(
        (x) =>
          x.row.productId &&
          needsDiscrepancyApproval(Number(x.row.orderedQty), Number(x.row.receivedQty), x.row.qc),
      )
      .map((x) => `${x.productName ?? "Bahan"}: pesan ${Number(x.row.orderedQty)}, terima ${Number(x.row.receivedQty)}`);
    // Harga beli menyimpang >10% dari harga PO (per satuan dasar) juga wajib dikonfirmasi —
    // dulu lolos diam-diam dan langsung mengubah HPP rata-rata + biaya belanja.
    const priceLines: string[] = [];
    if (rec.purchaseOrderId) {
      const poItems = await tx
        .select({ productId: wmsPurchaseOrderItem.productId, unitPrice: wmsPurchaseOrderItem.unitPrice })
        .from(wmsPurchaseOrderItem)
        .where(eq(wmsPurchaseOrderItem.purchaseOrderId, rec.purchaseOrderId));
      const poPrice = new Map(poItems.map((p) => [p.productId, Number(p.unitPrice)]));
      for (const x of items) {
        if (!x.row.productId || x.row.qc === "reject" || !(Number(x.row.receivedQty) > 0)) continue;
        const expected = poPrice.get(x.row.productId) ?? 0;
        const actual = Number(x.row.hpp);
        if (expected > 0 && Math.abs(actual - expected) / expected > 0.1) {
          const pct = Math.round(((actual - expected) / expected) * 100);
          priceLines.push(`${x.productName ?? "Bahan"}: harga PO Rp${expected.toLocaleString("id-ID")}, terima Rp${actual.toLocaleString("id-ID")} per satuan (${pct > 0 ? "+" : ""}${pct}%)`);
        }
      }
    }
    if ((qtyLines.length || priceLines.length) && !opts?.forceApprove) {
      // Selisih >10% butuh konfirmasi eksplisit Owner/Manajer (yang menyelesaikan
      // penerimaan). Dulu status+approval ditulis lalu ikut ter-rollback oleh
      // throw sehingga tidak pernah tersimpan; sekarang tidak menulis apa pun.
      throw new ReceivingDiscrepancyError(rec.doc, [...qtyLines, ...priceLines]);
    }
    if (priceLines.length) {
      await writeWmsAudit(tx, {
        userId: userId ?? null,
        action: "Selisih harga penerimaan dikonfirmasi",
        object: rec.doc,
        status: "warning",
        metadata: { lines: priceLines, purchaseOrderId: rec.purchaseOrderId },
      });
    }

    const catRows = await tx.select({ name: wmsCategory.name, area: wmsCategory.area }).from(wmsCategory);
    const areaByCat = new Map(catRows.map((c) => [c.name.trim().toLowerCase(), c.area]));
    const [selectedRoom] = await tx
      .select({ area: wmsWarehouse.area })
      .from(wmsWarehouse)
      .where(eq(wmsWarehouse.id, whId))
      .limit(1);

    const additionalCost = Number(rec.additionalCost ?? 0);
    const accepted = items.filter(
      (x) => x.row.productId && x.row.qc !== "reject" && Number(x.row.receivedQty) > 0,
    );
    const totalValue = accepted.reduce(
      (s, x) => s + Number(x.row.receivedQty) * Number(x.row.hpp),
      0,
    );

    let lineIndex = 0;
    for (const { row: it, productName, category, sku } of items) {
      if (!it.productId) continue;
      if (it.qc === "reject") continue;
      const qty = Number(it.receivedQty);
      if (qty <= 0) continue;

      const batchNo =
        it.batchNo?.trim() || autoBatchNo(rec.doc, sku ?? productName ?? "ITEM", lineIndex++);
      const itemValue = qty * Number(it.hpp);
      const share = additionalCost > 0 && totalValue > 0 ? (additionalCost * itemValue) / totalValue : 0;
      const effHpp = Number(it.hpp) + (qty > 0 ? share / qty : 0);

      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, it.productId)).limit(1);
      if (prod) {
        // Stok minus (penjualan mendahului penerimaan) tidak ikut rata-rata HPP.
        const oldQty = Math.max(0, await totalOnHand(tx, it.productId));
        const oldValue = oldQty * Number(prod.hpp);
        const newQty = oldQty + qty;
        const newHpp = newQty > 0 ? (oldValue + qty * effHpp) / newQty : effHpp;
        await tx
          .update(wmsProduct)
          .set({ hpp: newHpp, updatedAt: new Date() })
          .where(eq(wmsProduct.id, it.productId));
        await propagateHppToOs(tx, it.productId, newHpp, Number(it.hpp));
      }

      const area = areaByCat.get((prod?.category ?? category ?? "").trim().toLowerCase()) ?? "umum";
      // Ruang yang dipilih dipakai bila areanya sama dengan area bahan (mis. terima
      // langsung ke Outlet Bar); selain itu bahan masuk ke gudang utama areanya.
      const target =
        area === "umum" || selectedRoom?.area === area
          ? whId
          : ((await mainWarehouseForArea(tx, area)) ?? whId);

      await recordStockMovement(tx, {
        type: "in",
        productId: it.productId,
        warehouseId: target,
        deltaQty: qty,
        hpp: effHpp,
        refDoc: rec.doc,
        userId: userId ?? null,
        batchNo,
        expiredAt: it.expiredAt ?? null,
        location: it.putAwayLocation ?? "",
      });

      if (!it.batchNo) {
        await tx.update(wmsReceivingItem).set({ batchNo }).where(eq(wmsReceivingItem.id, it.id));
      }
    }

    // Belanja dibayar cash langsung (owner, Okt 2026): tidak ada hutang supplier.
    // Nilai per area (Bar/Dapur/Umum, termasuk porsi biaya tambahan) dicatat
    // sebagai pengeluaran kas lunas = biaya "Belanja bahan" di laba rugi.
    // Idempoten lewat sourceDoc.
    const byArea: Partial<Record<PurchaseArea, number>> = {};
    for (const x of accepted) {
      const qty = Number(x.row.receivedQty);
      const value = qty * Number(x.row.hpp);
      const share = additionalCost > 0 && totalValue > 0 ? (additionalCost * value) / totalValue : 0;
      const area = purchaseAreaOf(areaByCat.get((x.category ?? "").trim().toLowerCase()));
      byArea[area] = (byArea[area] ?? 0) + value + share;
    }
    if (additionalCost > 0 && totalValue <= 0) byArea.umum = (byArea.umum ?? 0) + additionalCost;
    const [outlet] = await tx.select({ id: outlets.id }).from(outlets).orderBy(outlets.code).limit(1);
    // Tanggal biaya = tanggal barang diterima (bukan saat tombol "Selesai" diklik).
    const purchaseDate = rec.receivedDate ? purchaseDateFor(String(rec.receivedDate)) : new Date();
    const tempo = rec.paymentMethod === "Tempo";
    const purchaseTotal = await recordCashPurchases(tx, {
      sourceDoc: `WMS:${rec.doc}`,
      outletId: outlet?.id ?? null,
      paymentMethod: rec.paymentMethod,
      status: tempo ? "recorded" : "paid",
      date: purchaseDate,
      description: `Belanja gudang ${rec.doc}${rec.poNumber?.trim() ? ` / ${rec.poNumber.trim()}` : ""}${rec.supplier ? ` · ${rec.supplier}` : ""}`,
      byArea,
      userId: userId ?? null,
      notes: additionalCost > 0 ? `Termasuk biaya tambahan Rp${Math.round(additionalCost).toLocaleString("id-ID")}` : null,
    });
    // Tempo: sisa hutang dilacak sebagai tagihan supplier (pembayaran nanti TIDAK membuat biaya baru).
    if (tempo && purchaseTotal > 0) {
      const { createBillForReceiving } = await import("@/lib/wms-procurement");
      await createBillForReceiving(tx, rec, purchaseTotal, userId ?? null);
    }

    if (rec.purchaseOrderId) {
      const { applyReceivingToPurchaseOrder } = await import("@/lib/wms-purchase");
      await applyReceivingToPurchaseOrder(tx, rec.purchaseOrderId, accepted.map((x) => ({ productId: x.row.productId as string, qty: Number(x.row.receivedQty) })), 1);
    }

    const [updated] = await tx
      .update(wmsReceiving)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(wmsReceiving.id, id))
      .returning();
    return updated;
  });
}

/**
 * Batalkan penerimaan yang sudah selesai (salah qty/harga/barang). Stok yang
 * masuk dikeluarkan lagi dari ruang yang sama dan belanja kasnya di-void,
 * sehingga stok & laporan keuangan kembali seperti sebelum penerimaan. Bila
 * sebagian stok sudah terpakai → ditolak (koreksi lewat opname). Untuk
 * memperbaiki: batalkan lalu buat penerimaan baru yang benar.
 */
export async function cancelReceiving(
  id: string,
  input: { userId?: string | null; reason: string; actorName?: string },
) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Alasan pembatalan wajib diisi.");
  // Hari biaya yang sudah Daily Closing tidak boleh berubah (cek di luar tx).
  const [pre] = await getDb().select({ doc: wmsReceiving.doc }).from(wmsReceiving).where(eq(wmsReceiving.id, id)).limit(1);
  if (pre) {
    const rows = await getDb()
      .select({ expenseDate: expenses.expenseDate })
      .from(expenses)
      .where(like(expenses.sourceDoc, `WMS:${pre.doc}#%`));
    const { assertFinanceDayOpen } = await import("@/lib/finance-closing");
    for (const row of rows) await assertFinanceDayOpen(new Date(row.expenseDate));
  }
  return runInTx(async (tx) => {
    const [rec] = await tx.select().from(wmsReceiving).where(eq(wmsReceiving.id, id)).for("update").limit(1);
    if (!rec) return null;
    if (rec.status === "cancelled") throw new Error("Penerimaan sudah dibatalkan.");
    if (rec.status !== "completed") throw new Error("Hanya penerimaan yang sudah selesai yang bisa dibatalkan; draft cukup diedit.");
    const whId = rec.warehouseId;
    if (!whId) throw new Error("Penerimaan tanpa gudang tidak bisa dibatalkan.");

    const items = await tx
      .select({ row: wmsReceivingItem, productName: wmsProduct.name, category: wmsProduct.category })
      .from(wmsReceivingItem)
      .leftJoin(wmsProduct, eq(wmsProduct.id, wmsReceivingItem.productId))
      .where(eq(wmsReceivingItem.receivingId, id));
    const catRows = await tx.select({ name: wmsCategory.name, area: wmsCategory.area }).from(wmsCategory);
    const areaByCat = new Map(catRows.map((c) => [c.name.trim().toLowerCase(), c.area]));

    for (const { row: it, productName, category } of items) {
      if (!it.productId || it.qc === "reject") continue;
      const qty = Number(it.receivedQty);
      if (qty <= 0) continue;
      // Keluarkan dari ruang tempat barang ini dulu masuk (ledger), bukan tebakan area.
      const [inMove] = await tx
        .select({ warehouseId: wmsStockMovement.warehouseId })
        .from(wmsStockMovement)
        .where(
          and(
            eq(wmsStockMovement.refDoc, rec.doc),
            eq(wmsStockMovement.productId, it.productId),
            eq(wmsStockMovement.type, "in"),
          ),
        )
        .limit(1);
      const area = areaByCat.get((category ?? "").trim().toLowerCase()) ?? "umum";
      const target =
        inMove?.warehouseId ?? (area === "umum" ? whId : ((await mainWarehouseForArea(tx, area)) ?? whId));
      // Keluarkan batch milik penerimaan ini sendiri (bukan batch FEFO lain) bila masih utuh.
      const [ownBatch] = it.batchNo
        ? await tx
            .select({ id: wmsBatch.id, qty: wmsBatch.qty, hpp: wmsBatch.hpp })
            .from(wmsBatch)
            .where(and(eq(wmsBatch.productId, it.productId), eq(wmsBatch.warehouseId, target), eq(wmsBatch.batchNo, it.batchNo)))
            .orderBy(desc(wmsBatch.receivedAt))
            .limit(1)
        : [];
      const receivedHpp = ownBatch ? Number(ownBatch.hpp) : Number(it.hpp);
      // Rata-rata HPP dikembalikan: keluarkan nilai penerimaan ini dari nilai stok.
      const [prod] = await tx.select({ hpp: wmsProduct.hpp }).from(wmsProduct).where(eq(wmsProduct.id, it.productId)).limit(1);
      if (prod) {
        const oldQty = Math.max(0, await totalOnHand(tx, it.productId));
        const newQty = oldQty - qty;
        if (newQty > 0) {
          const newHpp = Math.max(0, (oldQty * Number(prod.hpp) - qty * receivedHpp) / newQty);
          const rounded = Math.round(newHpp * 10_000) / 10_000;
          await tx.update(wmsProduct).set({ hpp: rounded, updatedAt: new Date() }).where(eq(wmsProduct.id, it.productId));
          await propagateHppToOs(tx, it.productId, rounded);
        }
      }
      try {
        await recordStockMovement(tx, {
          type: "out",
          productId: it.productId,
          warehouseId: target,
          deltaQty: -qty,
          hpp: receivedHpp,
          // Nilai keluar = nilai beli penerimaan ini (bukan rata-rata baru) supaya ledger membalik persis.
          outflowRate: receivedHpp,
          refDoc: `BATAL ${rec.doc}`,
          userId: input.userId ?? null,
          batchId: ownBatch && Number(ownBatch.qty) >= qty ? ownBatch.id : undefined,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${productName ?? "Bahan"}: stok sudah terpakai sebagian (${detail}). Penerimaan tidak bisa dibatalkan — koreksi lewat stok opname.`,
        );
      }
    }

    if (rec.purchaseOrderId) {
      const { applyReceivingToPurchaseOrder } = await import("@/lib/wms-purchase");
      await applyReceivingToPurchaseOrder(
        tx,
        rec.purchaseOrderId,
        items.filter((x) => x.row.productId && x.row.qc !== "reject").map((x) => ({ productId: x.row.productId as string, qty: Number(x.row.receivedQty) })),
        -1,
      );
    }
    // Tagihan tempo ikut batal; ditolak bila sudah ada pembayaran (batalkan pembayaran dulu).
    const { voidBillForReceiving } = await import("@/lib/wms-procurement");
    await voidBillForReceiving(tx, rec.id);
    const voided = await voidCashPurchases(tx, { sourceDoc: `WMS:${rec.doc}`, reason });

    const [updated] = await tx
      .update(wmsReceiving)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: input.userId ?? null, cancelReason: reason })
      .where(eq(wmsReceiving.id, id))
      .returning();
    await tx.insert(auditLogs).values({
      time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
      actor: input.actorName ?? "Gudang",
      action: "Penerimaan gudang dibatalkan",
      object: rec.doc,
      device: "WMS",
      status: "warning",
      metadata: {
        receivingId: rec.id,
        reason,
        voidedPurchase: voided.reduce((sum, row) => sum + row.amount, 0),
      },
    });
    return updated;
  });
}

// =============================================================================
// FASE 3 — Internal Order + FEFO (inti). Gudang Utama "menjual" bahan ke outlet
// (Dapur/Bar). Pengambilan batch FEFO (expired terdekat dulu); potong stok
// sumber + tambah stok outlet + ledger. Biaya (lineHpp) dari batch yang dipakai.
// =============================================================================

/** Stok agregat produk di sebuah warehouse. */
async function warehouseOnHand(db: Db, productId: string, warehouseId: string): Promise<number> {
  const [row] = await db
    .select({ qty: wmsWarehouseStock.qty })
    .from(wmsWarehouseStock)
    .where(
      and(eq(wmsWarehouseStock.productId, productId), eq(wmsWarehouseStock.warehouseId, warehouseId)),
    )
    .limit(1);
  return Number(row?.qty ?? 0);
}

export type InternalOrderItemInput = { productId: string; qty: number };

/** Jejak audit_logs untuk aksi gudang yang mengubah stok (selain ledger WMS). */
export async function writeWmsAudit(
  tx: Tx,
  input: {
    userId?: string | null;
    action: string;
    object: string;
    status?: "recorded" | "warning";
    metadata?: Record<string, unknown>;
  },
) {
  let actor = "Gudang";
  if (input.userId) {
    const [row] = await tx.select({ name: user.name }).from(user).where(eq(user.id, input.userId)).limit(1);
    if (row?.name) actor = row.name;
  }
  await tx.insert(auditLogs).values({
    time: new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date()),
    actor,
    action: input.action,
    object: input.object,
    device: "WMS",
    status: input.status ?? "recorded",
    metadata: { ...(input.metadata ?? {}), userId: input.userId ?? null },
  });
}

export async function createInternalOrder(
  input: {
    outletWarehouseId: string;
    items: InternalOrderItemInput[];
    sourceRef?: string | null;
    sourceWarehouseId?: string | null;
  },
  userId?: string | null,
) {
  return runInTx(async (tx) => {
    // Sumber = ruang gudang utama sesuai AREA outlet tujuan (Outlet Bar←Ruang Bar,
    // Outlet Dapur←Ruang Dapur). Bisa dioverride via sourceWarehouseId.
    let source = input.sourceWarehouseId ?? null;
    const [outlet] = await tx
      .select({ area: wmsWarehouse.area, type: wmsWarehouse.type })
      .from(wmsWarehouse)
      .where(eq(wmsWarehouse.id, input.outletWarehouseId))
      .limit(1);
    // Internal order = permintaan ke ruang outlet (Bar/Dapur). Pindah antar gudang
    // utama lewat Transfer (Owner/Manajer).
    if (!outlet || outlet.type === "main") {
      throw new Error("Tujuan internal order harus ruang outlet (Bar/Dapur). Pindah antar gudang pakai Transfer.");
    }
    if (!source) {
      source = await mainWarehouseForArea(tx, outlet.area ?? "bar");
    }
    if (!source) throw new Error("Gudang utama belum ada.");
    if (input.outletWarehouseId === source) {
      throw new Error("Outlet tujuan tidak boleh sama dengan gudang sumber.");
    }

    // Idempotensi: jika sourceRef sudah pernah diproses, kembalikan order lama.
    if (input.sourceRef) {
      const [dupe] = await tx
        .select()
        .from(wmsInternalOrder)
        .where(eq(wmsInternalOrder.sourceRef, input.sourceRef))
        .limit(1);
      if (dupe) return dupe;
    }

    // Pra-validasi (pesan error ramah). recordStockMovement tetap jadi penjaga
    // akhir di bawah kunci baris — mencegah oversell paralel.
    const lines: Array<{ productId: string; qty: number; fallbackHpp: number }> = [];
    for (const it of input.items) {
      const qty = Number(it.qty);
      if (qty <= 0) continue;
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, it.productId)).limit(1);
      if (!prod) throw new Error("Produk tidak ditemukan.");
      const avail = await warehouseOnHand(tx, it.productId, source);
      if (qty > avail) {
        throw new Error(`Stok ${prod.name} tidak cukup (tersedia ${avail}, diminta ${qty}).`);
      }
      lines.push({ productId: it.productId, qty, fallbackHpp: Number(prod.hpp) });
    }
    if (lines.length === 0) throw new Error("Tidak ada item valid.");

    const [order] = await tx
      .insert(wmsInternalOrder)
      .values({
        doc: makeWmsDoc("IO"),
        outletWarehouseId: input.outletWarehouseId,
        status: "issued",
        totalHpp: 0,
        sourceRef: input.sourceRef ?? null,
        createdBy: userId ?? null,
      })
      .returning();

    let totalHpp = 0;
    for (const ln of lines) {
      // Gudang utama → outlet (FEFO, batch kedaluwarsa ditolak); batch & expired ikut pindah.
      const { cost, used } = await moveStockBetweenWarehouses(tx, {
        outType: "internal_out",
        productId: ln.productId,
        fromWarehouseId: source,
        toWarehouseId: input.outletWarehouseId,
        qty: ln.qty,
        fallbackHpp: ln.fallbackHpp,
        refDoc: order.doc,
        userId: userId ?? null,
      });

      await tx.insert(wmsInternalOrderItem).values({
        orderId: order.id,
        productId: ln.productId,
        batchId: used[0]?.batchId ?? null,
        qty: ln.qty,
        lineHpp: cost,
      });
      totalHpp += cost;
    }

    const [updated] = await tx
      .update(wmsInternalOrder)
      .set({ totalHpp })
      .where(eq(wmsInternalOrder.id, order.id))
      .returning();
    await writeWmsAudit(tx, {
      userId,
      action: "Internal order gudang",
      object: updated?.doc ?? order.id,
      metadata: { internalOrderId: order.id, items: input.items.length, totalHpp: Math.round(totalHpp) },
    });
    return updated;
  });
}

export async function listInternalOrders() {
  const db = getDb();
  const rows = await db
    .select({
      id: wmsInternalOrder.id,
      doc: wmsInternalOrder.doc,
      status: wmsInternalOrder.status,
      totalHpp: wmsInternalOrder.totalHpp,
      createdAt: wmsInternalOrder.createdAt,
      outletCode: wmsWarehouse.code,
      outletName: wmsWarehouse.name,
      items: sql<number>`count(${wmsInternalOrderItem.id})::int`,
    })
    .from(wmsInternalOrder)
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsInternalOrder.outletWarehouseId))
    .leftJoin(wmsInternalOrderItem, eq(wmsInternalOrderItem.orderId, wmsInternalOrder.id))
    .groupBy(wmsInternalOrder.id, wmsWarehouse.code, wmsWarehouse.name)
    .orderBy(desc(wmsInternalOrder.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    doc: r.doc,
    status: r.status,
    totalHpp: Math.round(Number(r.totalHpp)),
    outlet: r.outletName ? `${r.outletCode} · ${r.outletName}` : "-",
    items: Number(r.items),
    createdAt: r.createdAt.toISOString(),
  }));
}

// =============================================================================
// Transfer antar-gudang (bebas: gudang mana pun → gudang mana pun). Potong stok
// sumber FEFO (type transfer) + tambah stok tujuan (type in, HPP = biaya batch).
// =============================================================================

export type TransferItemInput = { productId: string; qty: number };

export async function transferStock(
  input: { fromWarehouseId: string; toWarehouseId: string; items: TransferItemInput[] },
  userId?: string | null,
) {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new Error("Gudang asal & tujuan tidak boleh sama.");
  }
  return runInTx(async (tx) => {
    // Pra-validasi stok (pesan ramah); recordStockMovement tetap penjaga akhir.
    const lines: Array<{ productId: string; qty: number; fallbackHpp: number }> = [];
    for (const it of input.items) {
      const qty = Number(it.qty);
      if (qty <= 0) continue;
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, it.productId)).limit(1);
      if (!prod) throw new Error("Produk tidak ditemukan.");
      const avail = await warehouseOnHand(tx, it.productId, input.fromWarehouseId);
      if (qty > avail) {
        throw new Error(`Stok ${prod.name} tidak cukup (tersedia ${avail}, diminta ${qty}).`);
      }
      lines.push({ productId: it.productId, qty, fallbackHpp: Number(prod.hpp) });
    }
    if (lines.length === 0) throw new Error("Tidak ada item valid.");

    const doc = makeWmsDoc("TRF");
    let total = 0;
    for (const ln of lines) {
      const { cost } = await moveStockBetweenWarehouses(tx, {
        outType: "transfer",
        productId: ln.productId,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        qty: ln.qty,
        fallbackHpp: ln.fallbackHpp,
        refDoc: doc,
        userId: userId ?? null,
      });
      total += cost;
    }
    await writeWmsAudit(tx, {
      userId,
      action: "Transfer stok gudang",
      object: doc,
      metadata: { from: input.fromWarehouseId, to: input.toWarehouseId, items: lines.length, totalHpp: Math.round(total) },
    });
    return { doc, count: lines.length, totalHpp: Math.round(total) };
  });
}

/** Riwayat transfer (dikelompokkan per dokumen TRF dari ledger). */
export async function listWmsTransfers() {
  const db = getDb();
  const rows = await db
    .select({
      doc: wmsStockMovement.refDoc,
      createdAt: sql<string>`min(${wmsStockMovement.createdAt})`,
      qtyOut: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then -${wmsStockMovement.qty} else 0 end), 0)`,
      valueHpp: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then ${wmsStockMovement.valueHpp} else 0 end), 0)`,
      items: sql<number>`count(distinct ${wmsStockMovement.productId})`,
    })
    .from(wmsStockMovement)
    .where(sql`${wmsStockMovement.refDoc} like 'TRF-%'`)
    .groupBy(wmsStockMovement.refDoc)
    .orderBy(sql`min(${wmsStockMovement.createdAt}) desc`)
    .limit(100);
  return rows.map((r) => ({
    doc: r.doc,
    createdAt: new Date(r.createdAt).toISOString(),
    qtyOut: Math.round(Number(r.qtyOut)),
    valueHpp: Math.round(Number(r.valueHpp)),
    items: Number(r.items),
  }));
}

// =============================================================================
// Production — olah bahan mentah → produk jadi. Konsumsi input FEFO (type out) +
// hasil output (type in, HPP = biaya input / hasil). HPP output di-weighted-average.
// =============================================================================

export type ProductionRecipeInput = {
  name: string;
  outputProductId: string;
  outputQty: number;
  /** Umur simpan hasil produksi (jam); kosong = ikut expired bahan input. */
  shelfLifeHours?: number | null;
  bom: Array<{ inputProductId: string; qty: number }>;
};

export async function createProductionRecipe(input: ProductionRecipeInput, userId?: string | null) {
  const db = getDb();
  const [rec] = await db
    .insert(wmsProductionRecipe)
    .values({
      name: input.name.trim(),
      outputProductId: input.outputProductId,
      outputQty: input.outputQty > 0 ? input.outputQty : 1,
      shelfLifeHours: input.shelfLifeHours && input.shelfLifeHours > 0 ? Math.round(input.shelfLifeHours) : null,
      createdBy: userId ?? null,
    })
    .returning();
  if (input.bom.length) {
    await db.insert(wmsProductionBom).values(
      input.bom.filter((b) => b.qty > 0).map((b) => ({ recipeId: rec.id, inputProductId: b.inputProductId, qty: b.qty })),
    );
  }
  return rec;
}

export async function deleteProductionRecipe(id: string) {
  const db = getDb();
  const [row] = await db.delete(wmsProductionRecipe).where(eq(wmsProductionRecipe.id, id)).returning();
  return row ?? null;
}

export async function listProductionRecipes() {
  const db = getDb();
  const recipes = await db
    .select({
      id: wmsProductionRecipe.id,
      name: wmsProductionRecipe.name,
      outputQty: wmsProductionRecipe.outputQty,
      outputProductId: wmsProductionRecipe.outputProductId,
      outputName: wmsProduct.name,
      outputUnit: wmsProduct.unit,
    })
    .from(wmsProductionRecipe)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsProductionRecipe.outputProductId))
    .orderBy(desc(wmsProductionRecipe.createdAt));
  const bomRows = await db
    .select({ recipeId: wmsProductionBom.recipeId, n: sql<number>`count(*)::int` })
    .from(wmsProductionBom)
    .groupBy(wmsProductionBom.recipeId);
  const bomBy = new Map(bomRows.map((r) => [r.recipeId, Number(r.n)]));
  return recipes.map((r) => ({
    id: r.id,
    name: r.name,
    outputQty: Number(r.outputQty),
    outputProductId: r.outputProductId,
    outputName: r.outputName ?? "-",
    outputUnit: r.outputUnit ?? "",
    inputs: bomBy.get(r.id) ?? 0,
  }));
}

export async function getProductionRecipe(id: string) {
  const db = getDb();
  const [rec] = await db.select().from(wmsProductionRecipe).where(eq(wmsProductionRecipe.id, id)).limit(1);
  if (!rec) return null;
  const bom = await db
    .select({
      id: wmsProductionBom.id,
      inputProductId: wmsProductionBom.inputProductId,
      name: wmsProduct.name,
      unit: wmsProduct.unit,
      hpp: wmsProduct.hpp,
      qty: wmsProductionBom.qty,
    })
    .from(wmsProductionBom)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsProductionBom.inputProductId))
    .where(eq(wmsProductionBom.recipeId, id));
  return {
    id: rec.id,
    name: rec.name,
    outputProductId: rec.outputProductId,
    outputQty: Number(rec.outputQty),
    bom: bom.map((b) => ({
      id: b.id,
      inputProductId: b.inputProductId,
      name: b.name ?? "-",
      unit: b.unit ?? "",
      qty: Number(b.qty),
      hpp: Number(b.hpp ?? 0),
    })),
  };
}

/** Jalankan produksi: konsumsi input (FEFO) × batch + hasilkan output (in). */
export async function runProduction(
  input: { recipeId: string; batches: number; warehouseId: string },
  userId?: string | null,
) {
  const batches = Number(input.batches);
  if (!(batches > 0)) throw new Error("Jumlah batch harus lebih dari 0.");
  return runInTx(async (tx) => {
    const [rec] = await tx.select().from(wmsProductionRecipe).where(eq(wmsProductionRecipe.id, input.recipeId)).limit(1);
    if (!rec) throw new Error("Resep produksi tidak ditemukan.");
    if (!rec.outputProductId) throw new Error("Resep tanpa produk output.");
    const bom = await tx.select().from(wmsProductionBom).where(eq(wmsProductionBom.recipeId, rec.id));
    if (bom.length === 0) throw new Error("Resep tanpa bahan input.");

    // Validasi stok input dulu (pesan ramah).
    for (const b of bom) {
      if (!b.inputProductId) continue;
      const need = Number(b.qty) * batches;
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, b.inputProductId)).limit(1);
      const avail = await warehouseOnHand(tx, b.inputProductId, input.warehouseId);
      if (need > avail) throw new Error(`Stok ${prod?.name ?? "bahan"} tidak cukup (tersedia ${avail}, butuh ${need}).`);
    }

    const doc = makeWmsDoc("PRD");
    let totalCost = 0;
    // Hasil produksi tidak boleh lebih awet dari bahan input yang paling cepat kedaluwarsa.
    let earliestInputExpiry: Date | null = null;
    for (const b of bom) {
      if (!b.inputProductId) continue;
      const need = Number(b.qty) * batches;
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, b.inputProductId)).limit(1);
      const { cost, used } = await recordStockMovement(tx, {
        type: "out",
        productId: b.inputProductId,
        warehouseId: input.warehouseId,
        deltaQty: -need,
        hpp: Number(prod?.hpp ?? 0),
        refDoc: doc,
        userId: userId ?? null,
        pick: "usable",
      });
      for (const batch of used) {
        if (batch.expiredAt && (!earliestInputExpiry || batch.expiredAt < earliestInputExpiry)) earliestInputExpiry = batch.expiredAt;
      }
      totalCost += cost;
    }
    const shelfLifeHours = Number(rec.shelfLifeHours ?? 0);
    const shelfExpiry = shelfLifeHours > 0 ? new Date(Date.now() + shelfLifeHours * 3_600_000) : null;
    const outputExpiry =
      earliestInputExpiry && shelfExpiry
        ? new Date(Math.min(earliestInputExpiry.getTime(), shelfExpiry.getTime()))
        : (earliestInputExpiry ?? shelfExpiry);

    const producedQty = Number(rec.outputQty) * batches;
    const unitCost = producedQty > 0 ? totalCost / producedQty : 0;

    // Update HPP rata-rata tertimbang produk output (seperti receiving).
    const [outProd] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, rec.outputProductId)).limit(1);
    if (outProd) {
      const oldQty = Math.max(0, await totalOnHand(tx, rec.outputProductId));
      const oldValue = oldQty * Number(outProd.hpp);
      const newQty = oldQty + producedQty;
      const newHpp = newQty > 0 ? (oldValue + totalCost) / newQty : unitCost;
      await tx.update(wmsProduct).set({ hpp: newHpp, updatedAt: new Date() }).where(eq(wmsProduct.id, rec.outputProductId));
      await propagateHppToOs(tx, rec.outputProductId, newHpp);
    }

    await recordStockMovement(tx, {
      type: "in",
      productId: rec.outputProductId,
      warehouseId: input.warehouseId,
      deltaQty: producedQty,
      hpp: unitCost,
      refDoc: doc,
      userId: userId ?? null,
      batchNo: doc,
      expiredAt: outputExpiry,
    });

    await writeWmsAudit(tx, {
      userId,
      action: "Produksi gudang",
      object: doc,
      metadata: { recipeId: input.recipeId, batches, producedQty, cost: Math.round(totalCost) },
    });
    return { doc, producedQty, cost: Math.round(totalCost) };
  });
}

/** Riwayat produksi (dari ledger, dokumen PRD-*). */
export async function listProductions() {
  const db = getDb();
  const rows = await db
    .select({
      doc: wmsStockMovement.refDoc,
      createdAt: sql<string>`min(${wmsStockMovement.createdAt})`,
      producedQty: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} > 0 then ${wmsStockMovement.qty} else 0 end), 0)`,
      cost: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then ${wmsStockMovement.valueHpp} else 0 end), 0)`,
    })
    .from(wmsStockMovement)
    .where(sql`${wmsStockMovement.refDoc} like 'PRD-%'`)
    .groupBy(wmsStockMovement.refDoc)
    .orderBy(sql`min(${wmsStockMovement.createdAt}) desc`)
    .limit(100);
  return rows.map((r) => ({
    doc: r.doc,
    createdAt: new Date(r.createdAt).toISOString(),
    producedQty: Math.round(Number(r.producedQty)),
    cost: Math.round(Number(r.cost)),
  }));
}

// =============================================================================
// FASE 4 — Recipe/BOM + Keuangan/HPP. COGS/foodCost/margin DIHITUNG saat query
// dari product.hpp → otomatis ikut saat HPP bahan berubah (receiving). Tidak disimpan.
// =============================================================================

function bomActualQty(qty: number, wastePct: number, shrinkagePct: number): number {
  return qty * (1 + wastePct / 100) * (1 + shrinkagePct / 100);
}

export type WmsRecipeSopStep = {
  order: number;
  title: string;
  durationMin: number;
  notes: string;
};

function parseSopSteps(raw: string | null | undefined): WmsRecipeSopStep[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s, i) => {
        const row = s as Record<string, unknown>;
        return {
          order: Number(row.order) || i + 1,
          title: String(row.title ?? "").trim(),
          durationMin: Math.max(0, Number(row.durationMin) || 0),
          notes: String(row.notes ?? "").trim(),
        };
      })
      .filter((s) => s.title.length > 0)
      .sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

export type WmsRecipeDashboard = {
  totalRecipes: number;
  activeRecipes: number;
  draftRecipes: number;
  archivedRecipes: number;
  totalIngredients: number;
  totalSubRecipes: number;
  averageHpp: number;
  averageMargin: number;
  averageMarginPct: number;
  needReview: number;
  needApproval: number;
  recentlyUpdated: Array<{ id: string; name: string; category: string; updatedAt: string }>;
  highFoodCost: Array<{ id: string; name: string; foodCostPct: number }>;
};

export type WmsRecipeBatchResult = {
  recipeId: string;
  recipeName: string;
  targetQty: number;
  yieldPerRecipe: number;
  multiplier: number;
  ingredientCost: number;
  packagingCost: number;
  totalCost: number;
  lines: Array<{
    productId: string;
    sku: string;
    name: string;
    unit: string;
    lineType: string;
    qtyPerServing: number;
    wastePct: number;
    shrinkagePct: number;
    actualQtyPerServing: number;
    neededQty: number;
    onHand: number;
    minStock: number;
    hpp: number;
    lineCost: number;
    stockOk: boolean;
  }>;
  missingStock: Array<{ name: string; needed: number; onHand: number; unit: string }>;
  stockReady: boolean;
};

export async function getWmsRecipeDashboard(): Promise<WmsRecipeDashboard> {
  const recipes = await listWmsRecipes();
  const db = getDb();
  const subCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wmsProductionRecipe);
  const ingredientIds = await db
    .selectDistinct({ productId: wmsBomItem.productId })
    .from(wmsBomItem)
    .where(sql`${wmsBomItem.productId} is not null`);

  const active = recipes.filter((r) => r.recipeStatus === "published");
  const drafts = recipes.filter((r) => r.recipeStatus === "draft");
  const archived = recipes.filter((r) => r.recipeStatus === "archived");
  const withCogs = recipes.filter((r) => r.cogs > 0);
  const avgHpp = withCogs.length ? Math.round(withCogs.reduce((s, r) => s + r.cogs, 0) / withCogs.length) : 0;
  const avgMargin = withCogs.length ? Math.round(withCogs.reduce((s, r) => s + r.margin, 0) / withCogs.length) : 0;
  const avgMarginPct =
    withCogs.length
      ? Math.round(
          withCogs.reduce((s, r) => s + (r.sellPrice > 0 ? (r.margin / r.sellPrice) * 100 : 0), 0) /
            withCogs.length *
            10,
        ) / 10
      : 0;
  const needReview = recipes.filter((r) => r.foodCostPct > 38 && r.recipeStatus === "published").length;
  const pendingStatuses = ["pending_kitchen", "pending_warehouse", "pending_manager", "pending_owner"];
  const needApprovalCount =
    drafts.length + recipes.filter((r) => pendingStatuses.includes(r.recipeStatus)).length;

  const rows = await db
    .select({
      id: wmsRecipe.id,
      name: wmsRecipe.name,
      category: wmsRecipe.category,
      updatedAt: wmsRecipe.updatedAt,
    })
    .from(wmsRecipe)
    .orderBy(desc(wmsRecipe.updatedAt))
    .limit(5);

  return {
    totalRecipes: recipes.length,
    activeRecipes: active.length,
    draftRecipes: drafts.length,
    archivedRecipes: archived.length,
    totalIngredients: ingredientIds.length,
    totalSubRecipes: Number(subCount[0]?.n ?? 0),
    averageHpp: avgHpp,
    averageMargin: avgMargin,
    averageMarginPct: avgMarginPct,
    needReview,
    needApproval: needApprovalCount,
    recentlyUpdated: rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      updatedAt: new Date(r.updatedAt).toISOString(),
    })),
    highFoodCost: recipes
      .filter((r) => r.foodCostPct > 38)
      .sort((a, b) => b.foodCostPct - a.foodCostPct)
      .slice(0, 5)
      .map((r) => ({ id: r.id, name: r.name, foodCostPct: r.foodCostPct })),
  };
}

export async function calculateRecipeBatch(recipeId: string, targetQty: number): Promise<WmsRecipeBatchResult | null> {
  const detail = await getWmsRecipe(recipeId);
  if (!detail) return null;
  const yieldPer = Math.max(1, Number(detail.yieldQty) || 1);
  const multiplier = targetQty / yieldPer;
  const products = await getWmsProducts();
  const stockById = new Map(products.map((p) => [p.id, p]));

  let ingredientCost = 0;
  let packagingCost = 0;
  const lines: WmsRecipeBatchResult["lines"] = [];
  const missingStock: WmsRecipeBatchResult["missingStock"] = [];

  for (const b of detail.bom) {
    const isSub = b.lineType === "sub_recipe";
    if (!b.productId && !isSub) continue;
    const p = b.productId ? stockById.get(b.productId) : undefined;
    const actualPer = bomActualQty(b.qty, b.wastePct, b.shrinkagePct);
    const needed = actualPer * multiplier;
    const lineCost = needed * b.hpp;
    const stockOk = isSub ? true : (p?.onHand ?? 0) >= needed;
    if (b.lineType === "packaging") packagingCost += lineCost;
    else ingredientCost += lineCost;
    lines.push({
      productId: b.productId ?? "",
      sku: b.sku,
      name: b.productName,
      unit: b.unit,
      lineType: b.lineType,
      qtyPerServing: b.qty,
      wastePct: b.wastePct,
      shrinkagePct: b.shrinkagePct,
      actualQtyPerServing: Math.round(actualPer * 1000) / 1000,
      neededQty: Math.round(needed * 1000) / 1000,
      onHand: p?.onHand ?? 0,
      minStock: p?.minStock ?? 0,
      hpp: b.hpp,
      lineCost: Math.round(lineCost),
      stockOk,
    });
    if (!stockOk && !isSub) {
      missingStock.push({
        name: b.productName,
        needed: Math.round(needed * 1000) / 1000,
        onHand: p?.onHand ?? 0,
        unit: b.unit,
      });
    }
  }

  return {
    recipeId: detail.id,
    recipeName: detail.name,
    targetQty,
    yieldPerRecipe: yieldPer,
    multiplier: Math.round(multiplier * 1000) / 1000,
    ingredientCost: Math.round(ingredientCost),
    packagingCost: Math.round(packagingCost),
    totalCost: Math.round(ingredientCost + packagingCost),
    lines,
    missingStock,
    stockReady: missingStock.length === 0,
  };
}

export type RecipeInputWms = {
  name: string;
  category?: string;
  yieldQty?: string;
  sellPrice: number;
  bom: Array<{ productId: string; qty: number }>;
};

export async function createWmsRecipe(input: RecipeInputWms) {
  const db = getDb();
  const [rec] = await db
    .insert(wmsRecipe)
    .values({
      name: input.name.trim(),
      category: input.category?.trim() ?? "",
      yieldQty: input.yieldQty?.trim() || "1",
      sellPrice: Math.round(input.sellPrice),
      recipeStatus: "draft",
    })
    .returning();
  if (input.bom.length) {
    await db.insert(wmsBomItem).values(
      input.bom.map((b) => ({ recipeId: rec.id, productId: b.productId, qty: b.qty })),
    );
  }
  await saveRecipeVersionSnapshot(rec.id, "Versi awal");
  return rec;
}

export async function archiveWmsRecipe(
  id: string,
  actor?: { id: string; name: string },
) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, id)).limit(1);
  if (!rec) return null;
  if (rec.version.startsWith("os:")) {
    throw new Error("Resep OS-sync tidak bisa di-archive dari WMS.");
  }
  const [updated] = await db
    .update(wmsRecipe)
    .set({ recipeStatus: "archived", updatedAt: new Date() })
    .where(eq(wmsRecipe.id, id))
    .returning();
  if (updated && actor) {
    await logRecipeAudit(id, "archive", { actorId: actor.id, actorName: actor.name });
  }
  return updated ?? null;
}

export async function duplicateWmsRecipe(id: string, actor?: { id: string; name: string }) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, id)).limit(1);
  if (!rec) return null;
  const bomRows = await db.select().from(wmsBomItem).where(eq(wmsBomItem.recipeId, id));
  const [copy] = await db
    .insert(wmsRecipe)
    .values({
      name: `${rec.name} (salinan)`,
      recipeSku: "",
      recipeCode: "",
      category: rec.category,
      subCategory: rec.subCategory,
      productionArea: rec.productionArea,
      yieldQty: rec.yieldQty,
      yieldUnit: rec.yieldUnit,
      sellPrice: rec.sellPrice,
      recipeStatus: "draft",
      description: rec.description,
      version: "v1",
    })
    .returning();
  if (bomRows.length) {
    await db.insert(wmsBomItem).values(
      bomRows.map((b) => ({
        recipeId: copy.id,
        productId: b.productId,
        subRecipeId: b.subRecipeId,
        lineType: b.lineType,
        qty: b.qty,
        wastePct: b.wastePct,
        shrinkagePct: b.shrinkagePct,
        notes: b.notes,
      })),
    );
  }
  if (actor) {
    await logRecipeAudit(copy.id, "duplicate", {
      actorId: actor.id,
      actorName: actor.name,
      note: `Salinan dari ${rec.name}`,
    });
  }
  return copy;
}

/** Recipe + COGS/foodCost/margin (dihitung dari product.hpp saat query). */
export async function listWmsRecipes() {
  const db = getDb();
  const recipes = await db.select().from(wmsRecipe).orderBy(desc(wmsRecipe.createdAt));
  const costRows = await db
    .select({
      recipeId: wmsBomItem.recipeId,
      cogs: sql<number>`coalesce(sum(
        ${wmsBomItem.qty}
        * (1 + coalesce(${wmsBomItem.wastePct}, 0) / 100.0)
        * (1 + coalesce(${wmsBomItem.shrinkagePct}, 0) / 100.0)
        * coalesce(${wmsProduct.hpp}, 0)
      ), 0)`,
    })
    .from(wmsBomItem)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsBomItem.productId))
    .groupBy(wmsBomItem.recipeId);
  const cogsBy = new Map(costRows.map((r) => [r.recipeId, Number(r.cogs)]));

  return recipes.map((r) => {
    const cogs = cogsBy.get(r.id) ?? 0;
    const sell = Number(r.sellPrice);
    const foodCostPct = sell > 0 ? (cogs / sell) * 100 : 0;
    return {
      id: r.id,
      name: r.name,
      recipeSku: r.recipeSku,
      recipeCode: r.recipeCode,
      category: r.category,
      subCategory: r.subCategory,
      productionArea: r.productionArea,
      yieldQty: r.yieldQty,
      yieldUnit: r.yieldUnit,
      sellPrice: sell,
      recipeStatus: r.recipeStatus as WmsRecipeStatus,
      isFavorite: r.isFavorite,
      cogs: Math.round(cogs),
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      margin: Math.round(sell - cogs),
      version: r.version,
      updatedAt: new Date(r.updatedAt).toISOString(),
      source: r.version.startsWith("os:") ? ("os-sync" as const) : ("manual" as const),
      menuItemId: r.version.startsWith("os:") ? (r.version.split(":")[1] ?? null) : null,
    };
  });
}

export async function getWmsRecipe(id: string) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, id)).limit(1);
  if (!rec) return null;
  const bom = await db
    .select({
      id: wmsBomItem.id,
      productId: wmsBomItem.productId,
      subRecipeId: wmsBomItem.subRecipeId,
      productName: wmsProduct.name,
      subRecipeName: wmsProductionRecipe.name,
      sku: wmsProduct.sku,
      unit: wmsProduct.unit,
      hpp: wmsProduct.hpp,
      qty: wmsBomItem.qty,
      wastePct: wmsBomItem.wastePct,
      shrinkagePct: wmsBomItem.shrinkagePct,
      lineType: wmsBomItem.lineType,
      notes: wmsBomItem.notes,
    })
    .from(wmsBomItem)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsBomItem.productId))
    .leftJoin(wmsProductionRecipe, eq(wmsProductionRecipe.id, wmsBomItem.subRecipeId))
    .where(eq(wmsBomItem.recipeId, id));

  const products = await getWmsProducts();
  const stockById = new Map(products.map((p) => [p.id, p]));

  const lines = await Promise.all(
    bom.map(async (b) => {
      const isSub = b.lineType === "sub_recipe" && b.subRecipeId;
      const unitHpp = isSub ? await getSubRecipeUnitCost(b.subRecipeId!) : Number(b.hpp ?? 0);
      const actualQty = bomActualQty(Number(b.qty), Number(b.wastePct), Number(b.shrinkagePct));
      const lineCost = actualQty * unitHpp;
      const p = b.productId ? stockById.get(b.productId) : undefined;
      return {
        ...b,
        productName: isSub ? (b.subRecipeName ?? "Sub Recipe") : (b.productName ?? "-"),
        sku: isSub ? `SUB-${b.subRecipeId?.slice(0, 8)}` : (b.sku ?? ""),
        unit: isSub ? "batch" : (b.unit ?? ""),
        actualQty: Math.round(actualQty * 1000) / 1000,
        lineCost,
        onHand: p?.onHand ?? 0,
        minStock: p?.minStock ?? 0,
        hpp: unitHpp,
      };
    }),
  );
  const cogs = lines.reduce((s, l) => s + l.lineCost, 0);
  const sell = Number(rec.sellPrice);
  return {
    id: rec.id,
    name: rec.name,
    recipeSku: rec.recipeSku,
    recipeCode: rec.recipeCode,
    category: rec.category,
    subCategory: rec.subCategory,
    productionArea: rec.productionArea,
    yieldQty: rec.yieldQty,
    yieldUnit: rec.yieldUnit,
    description: rec.description,
    sopSteps: parseSopSteps(rec.sopSteps),
    recipeStatus: rec.recipeStatus,
    sellPrice: sell,
    cogs: Math.round(cogs),
    foodCostPct: sell > 0 ? Math.round((cogs / sell) * 1000) / 10 : 0,
    margin: Math.round(sell - cogs),
    source: rec.version.startsWith("os:") ? ("os-sync" as const) : ("manual" as const),
    bom: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      subRecipeId: l.subRecipeId,
      productName: l.productName,
      sku: l.sku ?? "",
      unit: l.unit ?? "",
      qty: Number(l.qty),
      wastePct: Number(l.wastePct),
      shrinkagePct: Number(l.shrinkagePct),
      actualQty: l.actualQty,
      lineType: l.lineType,
      notes: l.notes,
      onHand: l.onHand,
      minStock: l.minStock,
      hpp: Number(l.hpp ?? 0),
      lineCost: Math.round(l.lineCost),
      contribPct: cogs > 0 ? Math.round((l.lineCost / cogs) * 1000) / 10 : 0,
    })),
  };
}

// =============================================================================
// Recipe/BOM P1 — Ingredient Library, Sub Recipe BOM, Approval Workflow (PRD §5–7, §17–18)
// =============================================================================

export type WmsRecipeStatus =
  | "draft"
  | "pending_kitchen"
  | "pending_warehouse"
  | "pending_manager"
  | "pending_owner"
  | "published"
  | "archived";

export type WmsIngredientType = "raw" | "packaging" | "semi_finished" | "finished" | "consumable";

const APPROVAL_CHAIN: Record<string, { next: WmsRecipeStatus; roles: string[] }> = {
  draft: {
    next: "pending_kitchen",
    roles: ["Owner", "Manajer", "Kasir"],
  },
  pending_kitchen: {
    next: "pending_warehouse",
    roles: ["Kasir", "Owner", "Manajer"],
  },
  pending_warehouse: {
    next: "pending_manager",
    roles: ["Kasir", "Owner", "Manajer"],
  },
  pending_manager: {
    next: "pending_owner",
    roles: ["Manajer", "Owner"],
  },
  pending_owner: { next: "published", roles: ["Owner"] },
};

function classifyIngredient(category: string, name: string): WmsIngredientType {
  const c = `${category} ${name}`.toLowerCase();
  if (/kemasan|packaging|cup|lid|straw|box|bag|label|sleeve/.test(c)) return "packaging";
  if (/semi|setengah|base|syrup|sauce|shot|foam/.test(c)) return "semi_finished";
  if (/jadi|finished|produk/.test(c)) return "finished";
  if (/tissue|sapu|detergen|consumable|operasional/.test(c)) return "consumable";
  return "raw";
}

/** PRD §5 — library bahan dari wms_product. */
export async function listWmsIngredientLibrary(opts?: { type?: WmsIngredientType; q?: string }) {
  const products = await getWmsProducts();
  const q = opts?.q?.trim().toLowerCase() ?? "";
  return products
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      hpp: p.hpp,
      onHand: p.onHand,
      minStock: p.minStock,
      status: p.status,
      ingredientType: classifyIngredient(p.category, p.name),
    }))
    .filter((p) => !opts?.type || p.ingredientType === opts.type)
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/** Biaya per unit output sub-recipe (production recipe). */
export async function getSubRecipeUnitCost(subRecipeId: string): Promise<number> {
  const detail = await getProductionRecipe(subRecipeId);
  if (!detail) return 0;
  const outputQty = Math.max(1, detail.outputQty);
  const total = detail.bom.reduce((s, b) => s + Number(b.qty) * Number(b.hpp ?? 0), 0);
  return total / outputQty;
}

async function logRecipeAudit(
  recipeId: string,
  action: string,
  opts: { step?: string; actorId?: string | null; actorName?: string; note?: string },
) {
  const db = getDb();
  let actorId: string | null = opts.actorId?.trim() ? opts.actorId : null;
  if (actorId) {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, actorId)).limit(1);
    if (!row) actorId = null;
  }
  await db.insert(wmsRecipeAuditLog).values({
    recipeId,
    action,
    step: opts.step ?? "",
    actorId,
    actorName: opts.actorName ?? "",
    note: opts.note ?? "",
  });
}

export async function getRecipeAuditLog(recipeId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(wmsRecipeAuditLog)
    .where(eq(wmsRecipeAuditLog.recipeId, recipeId))
    .orderBy(desc(wmsRecipeAuditLog.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    step: r.step,
    actorName: r.actorName,
    note: r.note,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

type RecipeVersionSnapshot = {
  name: string;
  recipeSku: string;
  category: string;
  subCategory: string;
  productionArea: string;
  yieldQty: string;
  yieldUnit: string;
  sellPrice: number;
  recipeStatus: string;
  description: string;
  sopSteps: WmsRecipeSopStep[];
  bom: Array<{
    lineType: string;
    productId: string | null;
    subRecipeId: string | null;
    productName: string;
    qty: number;
    wastePct: number;
    shrinkagePct: number;
    notes: string;
  }>;
};

async function buildRecipeVersionSnapshot(recipeId: string): Promise<RecipeVersionSnapshot | null> {
  const detail = await getWmsRecipe(recipeId);
  if (!detail) return null;
  return {
    name: detail.name,
    recipeSku: detail.recipeSku,
    category: detail.category,
    subCategory: detail.subCategory,
    productionArea: detail.productionArea,
    yieldQty: detail.yieldQty,
    yieldUnit: detail.yieldUnit,
    sellPrice: detail.sellPrice,
    recipeStatus: detail.recipeStatus,
    description: detail.description,
    sopSteps: detail.sopSteps,
    bom: detail.bom.map((b) => ({
      lineType: b.lineType,
      productId: b.productId,
      subRecipeId: b.subRecipeId,
      productName: b.productName,
      qty: b.qty,
      wastePct: b.wastePct,
      shrinkagePct: b.shrinkagePct,
      notes: b.notes ?? "",
    })),
  };
}

export async function saveRecipeVersionSnapshot(
  recipeId: string,
  label: string,
  actorName = "",
): Promise<{ id: string; versionNo: number } | null> {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, recipeId)).limit(1);
  if (!rec || rec.version.startsWith("os:")) return null;

  const snapshot = await buildRecipeVersionSnapshot(recipeId);
  if (!snapshot) return null;

  const detail = await getWmsRecipe(recipeId);
  const [maxRow] = await db
    .select({ n: sql<number>`coalesce(max(${wmsRecipeVersion.versionNo}), 0)::int` })
    .from(wmsRecipeVersion)
    .where(eq(wmsRecipeVersion.recipeId, recipeId));
  const versionNo = Number(maxRow?.n ?? 0) + 1;

  const [row] = await db
    .insert(wmsRecipeVersion)
    .values({
      recipeId,
      versionNo,
      label: label.trim() || `Versi ${versionNo}`,
      snapshot: JSON.stringify(snapshot),
      cogs: detail?.cogs ?? 0,
      sellPrice: detail?.sellPrice ?? 0,
      foodCostPct: detail?.foodCostPct ?? 0,
      actorName,
    })
    .returning({ id: wmsRecipeVersion.id, versionNo: wmsRecipeVersion.versionNo });
  return row ?? null;
}

export type WmsRecipeVersionRow = {
  id: string;
  versionNo: number;
  label: string;
  cogs: number;
  sellPrice: number;
  foodCostPct: number;
  actorName: string;
  createdAt: string;
  bomLineCount: number;
  sopStepCount: number;
};

export type WmsRecipeVersionCompare = {
  cogsDelta: number;
  sellPriceDelta: number;
  foodCostPctDelta: number;
  bomLineDelta: number;
  sopStepDelta: number;
  bomAdded: string[];
  bomRemoved: string[];
};

function parseVersionSnapshot(raw: string): RecipeVersionSnapshot | null {
  try {
    return JSON.parse(raw) as RecipeVersionSnapshot;
  } catch {
    return null;
  }
}

function compareSnapshotToCurrent(
  snap: RecipeVersionSnapshot,
  current: NonNullable<Awaited<ReturnType<typeof getWmsRecipe>>>,
  versionMetrics: { cogs: number; sellPrice: number; foodCostPct: number },
): WmsRecipeVersionCompare {
  const snapKeys = new Set(
    snap.bom.map((b) => (b.lineType === "sub_recipe" ? `sub:${b.subRecipeId}` : `prod:${b.productId}`)),
  );
  const curKeys = new Set(
    current.bom.map((b) => (b.lineType === "sub_recipe" ? `sub:${b.subRecipeId}` : `prod:${b.productId}`)),
  );
  const bomAdded = current.bom
    .filter((b) => !snapKeys.has(b.lineType === "sub_recipe" ? `sub:${b.subRecipeId}` : `prod:${b.productId}`))
    .map((b) => b.productName);
  const bomRemoved = snap.bom
    .filter((b) => {
      const key = b.lineType === "sub_recipe" ? `sub:${b.subRecipeId}` : `prod:${b.productId}`;
      return !curKeys.has(key);
    })
    .map((b) => b.productName);

  return {
    cogsDelta: current.cogs - versionMetrics.cogs,
    sellPriceDelta: current.sellPrice - versionMetrics.sellPrice,
    foodCostPctDelta: Math.round((current.foodCostPct - versionMetrics.foodCostPct) * 10) / 10,
    bomLineDelta: current.bom.length - snap.bom.length,
    sopStepDelta: current.sopSteps.length - snap.sopSteps.length,
    bomAdded,
    bomRemoved,
  };
}

export async function listWmsRecipeVersions(recipeId: string): Promise<WmsRecipeVersionRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(wmsRecipeVersion)
    .where(eq(wmsRecipeVersion.recipeId, recipeId))
    .orderBy(desc(wmsRecipeVersion.versionNo))
    .limit(30);
  return rows.map((r) => {
    const snap = parseVersionSnapshot(r.snapshot);
    return {
      id: r.id,
      versionNo: r.versionNo,
      label: r.label,
      cogs: r.cogs,
      sellPrice: r.sellPrice,
      foodCostPct: Number(r.foodCostPct),
      actorName: r.actorName,
      createdAt: new Date(r.createdAt).toISOString(),
      bomLineCount: snap?.bom.length ?? 0,
      sopStepCount: snap?.sopSteps.length ?? 0,
    };
  });
}

export async function getWmsRecipeVersionDetail(versionId: string) {
  const db = getDb();
  const [row] = await db.select().from(wmsRecipeVersion).where(eq(wmsRecipeVersion.id, versionId)).limit(1);
  if (!row) return null;
  const snapshot = parseVersionSnapshot(row.snapshot);
  if (!snapshot) return null;
  const current = await getWmsRecipe(row.recipeId);
  const compare = current
    ? compareSnapshotToCurrent(snapshot, current, {
        cogs: row.cogs,
        sellPrice: row.sellPrice,
        foodCostPct: Number(row.foodCostPct),
      })
    : null;
  return {
    id: row.id,
    recipeId: row.recipeId,
    versionNo: row.versionNo,
    label: row.label,
    cogs: row.cogs,
    sellPrice: row.sellPrice,
    foodCostPct: Number(row.foodCostPct),
    actorName: row.actorName,
    createdAt: new Date(row.createdAt).toISOString(),
    snapshot,
    compareToCurrent: compare,
  };
}

export async function restoreWmsRecipeVersion(
  recipeId: string,
  versionId: string,
  actor?: { id: string; name: string },
) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, recipeId)).limit(1);
  if (!rec) return null;
  if (rec.version.startsWith("os:")) {
    throw new Error("Resep OS-sync tidak bisa di-restore dari versi WMS.");
  }
  const [ver] = await db
    .select()
    .from(wmsRecipeVersion)
    .where(and(eq(wmsRecipeVersion.id, versionId), eq(wmsRecipeVersion.recipeId, recipeId)))
    .limit(1);
  if (!ver) return null;
  const snapshot = parseVersionSnapshot(ver.snapshot);
  if (!snapshot) throw new Error("Snapshot versi rusak.");

  await saveRecipeVersionSnapshot(recipeId, `Sebelum restore v${ver.versionNo}`, actor?.name ?? "");

  await db
    .update(wmsRecipe)
    .set({
      name: snapshot.name,
      recipeSku: snapshot.recipeSku,
      category: snapshot.category,
      subCategory: snapshot.subCategory,
      productionArea: snapshot.productionArea,
      yieldQty: snapshot.yieldQty,
      yieldUnit: snapshot.yieldUnit,
      sellPrice: snapshot.sellPrice,
      description: snapshot.description,
      sopSteps: JSON.stringify(snapshot.sopSteps),
      recipeStatus: "draft",
      updatedAt: new Date(),
    })
    .where(eq(wmsRecipe.id, recipeId));

  await db.delete(wmsBomItem).where(eq(wmsBomItem.recipeId, recipeId));
  if (snapshot.bom.length) {
    await db.insert(wmsBomItem).values(
      snapshot.bom.map((b) => ({
        recipeId,
        lineType: b.lineType,
        productId: b.productId,
        subRecipeId: b.subRecipeId,
        qty: b.qty,
        wastePct: b.wastePct,
        shrinkagePct: b.shrinkagePct,
        notes: b.notes,
      })),
    );
  }

  if (actor) {
    await logRecipeAudit(recipeId, "restore", {
      actorId: actor.id,
      actorName: actor.name,
      note: `Restore ke v${ver.versionNo}: ${ver.label}`,
    });
  }
  return getWmsRecipe(recipeId);
}

export type WmsRecipeInsight = {
  severity: "info" | "warning" | "critical";
  code: string;
  title: string;
  message: string;
  action?: string;
};

export async function getWmsRecipeInsights(recipeId: string): Promise<{
  score: number;
  insights: WmsRecipeInsight[];
}> {
  const detail = await getWmsRecipe(recipeId);
  if (!detail) {
    return {
      score: 0,
      insights: [{ severity: "critical", code: "not_found", title: "Resep tidak ditemukan", message: "ID resep tidak valid." }],
    };
  }

  const insights: WmsRecipeInsight[] = [];
  let penalty = 0;

  if (detail.bom.length === 0) {
    insights.push({
      severity: "critical",
      code: "bom_empty",
      title: "BOM kosong",
      message: "Resep belum punya bahan — HPP dan potong stok tidak bisa dihitung.",
      action: "Tambah bahan di tab BOM atau tarik dari Produk OS.",
    });
    penalty += 35;
  }

  if (detail.foodCostPct > 45) {
    insights.push({
      severity: "critical",
      code: "food_cost_critical",
      title: "Food cost sangat tinggi",
      message: `Food cost ${detail.foodCostPct}% — jauh di atas target ≤30%.`,
      action: "Review harga jual atau kurangi qty bahan mahal.",
    });
    penalty += 25;
  } else if (detail.foodCostPct > 38) {
    insights.push({
      severity: "warning",
      code: "food_cost_high",
      title: "Food cost perlu review",
      message: `Food cost ${detail.foodCostPct}% — di zona amber (>38%).`,
      action: "Pertimbangkan substitusi bahan atau adjust porsi.",
    });
    penalty += 15;
  }

  if (detail.margin < 0) {
    insights.push({
      severity: "critical",
      code: "negative_margin",
      title: "Margin negatif",
      message: `HPP ${detail.cogs} melebihi harga jual ${detail.sellPrice}.`,
      action: "Naikkan harga jual atau turunkan BOM.",
    });
    penalty += 30;
  }

  const lowStock = detail.bom.filter((b) => b.lineType !== "sub_recipe" && b.onHand < b.actualQty);
  if (lowStock.length > 0) {
    insights.push({
      severity: "warning",
      code: "low_stock",
      title: `${lowStock.length} bahan stok rendah`,
      message: lowStock.map((b) => `${b.productName} (${b.onHand}/${b.actualQty} ${b.unit})`).slice(0, 3).join(" · "),
      action: "Cek inventory / buat PO.",
    });
    penalty += Math.min(20, lowStock.length * 5);
  }

  if (detail.source === "manual" && detail.sopSteps.length === 0) {
    insights.push({
      severity: "info",
      code: "no_sop",
      title: "Belum ada SOP produksi",
      message: "Langkah produksi kosong — kitchen tidak punya panduan standar.",
      action: "Isi tab SOP sebelum publish.",
    });
    penalty += 5;
  }

  if (detail.recipeStatus.startsWith("pending_")) {
    const step = detail.recipeStatus.replace("pending_", "");
    insights.push({
      severity: "info",
      code: "pending_approval",
      title: "Menunggu approval",
      message: `Resep menunggu persetujuan tahap ${step}.`,
      action: "Lihat tab Approval untuk audit trail.",
    });
  } else if (detail.recipeStatus === "draft") {
    insights.push({
      severity: "info",
      code: "draft",
      title: "Masih draft",
      message: "Resep belum published — tidak dipakai untuk operasional penuh.",
      action: "Ajukan approval setelah BOM & SOP lengkap.",
    });
    penalty += 5;
  }

  if (detail.source === "os-sync" && detail.bom.length > 0) {
    const highWaste = detail.bom.filter((b) => b.wastePct > 15);
    if (highWaste.length > 0) {
      insights.push({
        severity: "warning",
        code: "high_waste",
        title: "Waste % tinggi",
        message: `${highWaste.map((b) => `${b.productName} ${b.wastePct}%`).slice(0, 2).join(", ")}`,
        action: "Review waste di Produk Manajemen OS.",
      });
      penalty += 8;
    }
  }

  if (insights.length === 0) {
    insights.push({
      severity: "info",
      code: "healthy",
      title: "Resep sehat",
      message: "Tidak ada masalah operasional terdeteksi.",
    });
  }

  return { score: Math.max(0, 100 - penalty), insights };
}

/** PRD §15 — resep menu yang memakai sub-recipe ini. */
export async function getRecipeDependents(subRecipeId: string) {
  const db = getDb();
  const rows = await db
    .select({
      recipeId: wmsBomItem.recipeId,
      recipeName: wmsRecipe.name,
      qty: wmsBomItem.qty,
    })
    .from(wmsBomItem)
    .innerJoin(wmsRecipe, eq(wmsRecipe.id, wmsBomItem.recipeId))
    .where(and(eq(wmsBomItem.subRecipeId, subRecipeId), eq(wmsBomItem.lineType, "sub_recipe")));
  return rows.map((r) => ({
    recipeId: r.recipeId,
    recipeName: r.recipeName,
    qty: Number(r.qty),
  }));
}

export type WmsRecipeDependencyMap = {
  recipeId: string;
  recipeName: string;
  upstream: Array<{
    lineType: string;
    refId: string | null;
    name: string;
    sku: string;
    qty: number;
    unit: string;
  }>;
  sharedRecipes: Array<{
    productId: string;
    productName: string;
    recipes: Array<{ recipeId: string; recipeName: string; qty: number }>;
  }>;
  subRecipeDependents: Array<{
    subRecipeId: string;
    subRecipeName: string;
    usedBy: Array<{ recipeId: string; recipeName: string; qty: number }>;
  }>;
};

/** PRD §15 — peta ketergantungan bahan & sub-recipe untuk satu resep menu. */
export async function getWmsRecipeDependencyMap(recipeId: string): Promise<WmsRecipeDependencyMap | null> {
  const detail = await getWmsRecipe(recipeId);
  if (!detail) return null;
  const db = getDb();

  const upstream = detail.bom.map((b) => ({
    lineType: b.lineType,
    refId: (b.subRecipeId ?? b.productId) || null,
    name: b.productName,
    sku: b.sku,
    qty: b.qty,
    unit: b.unit,
  }));

  const productIds = [...new Set(detail.bom.filter((b) => b.productId).map((b) => b.productId!))];
  const sharedByProduct = new Map<
    string,
    { productName: string; recipes: Array<{ recipeId: string; recipeName: string; qty: number }> }
  >();

  if (productIds.length) {
    const rows = await db
      .select({
        recipeId: wmsBomItem.recipeId,
        recipeName: wmsRecipe.name,
        productId: wmsBomItem.productId,
        productName: wmsProduct.name,
        qty: wmsBomItem.qty,
      })
      .from(wmsBomItem)
      .innerJoin(wmsRecipe, eq(wmsRecipe.id, wmsBomItem.recipeId))
      .innerJoin(wmsProduct, eq(wmsProduct.id, wmsBomItem.productId))
      .where(and(inArray(wmsBomItem.productId, productIds), sql`${wmsBomItem.recipeId} != ${recipeId}`));

    for (const row of rows) {
      if (!row.productId) continue;
      const entry = sharedByProduct.get(row.productId) ?? {
        productName: row.productName ?? "-",
        recipes: [],
      };
      entry.recipes.push({
        recipeId: row.recipeId,
        recipeName: row.recipeName,
        qty: Number(row.qty),
      });
      sharedByProduct.set(row.productId, entry);
    }
  }

  const sharedRecipes = [...sharedByProduct.entries()].map(([productId, v]) => ({
    productId,
    productName: v.productName,
    recipes: v.recipes,
  }));

  const subRecipeDependents: WmsRecipeDependencyMap["subRecipeDependents"] = [];
  for (const line of detail.bom.filter((b) => b.lineType === "sub_recipe" && b.subRecipeId)) {
    const usedBy = (await getRecipeDependents(line.subRecipeId!)).filter((u) => u.recipeId !== recipeId);
    subRecipeDependents.push({
      subRecipeId: line.subRecipeId!,
      subRecipeName: line.productName,
      usedBy,
    });
  }

  return {
    recipeId: detail.id,
    recipeName: detail.name,
    upstream,
    sharedRecipes,
    subRecipeDependents,
  };
}

export async function toggleWmsRecipeFavorite(id: string) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, id)).limit(1);
  if (!rec) return null;
  const [updated] = await db
    .update(wmsRecipe)
    .set({ isFavorite: !rec.isFavorite, updatedAt: new Date() })
    .where(eq(wmsRecipe.id, id))
    .returning();
  return updated;
}

export async function exportWmsRecipesBundle() {
  const recipes = await listWmsRecipes();
  const bundle = [];
  for (const r of recipes) {
    const detail = await getWmsRecipe(r.id);
    if (detail) {
      bundle.push({
        name: detail.name,
        recipeSku: detail.recipeSku,
        category: detail.category,
        subCategory: detail.subCategory,
        productionArea: detail.productionArea,
        yieldQty: detail.yieldQty,
        yieldUnit: detail.yieldUnit,
        sellPrice: detail.sellPrice,
        recipeStatus: detail.recipeStatus,
        description: detail.description,
        sopSteps: detail.sopSteps,
        source: detail.source,
        bom: detail.bom.map((b) => ({
          lineType: b.lineType,
          productName: b.productName,
          sku: b.sku,
          qty: b.qty,
          unit: b.unit,
          wastePct: b.wastePct,
          shrinkagePct: b.shrinkagePct,
          subRecipeId: b.subRecipeId,
        })),
      });
    }
  }
  return { exportedAt: new Date().toISOString(), count: bundle.length, recipes: bundle };
}

export type WmsRecipeImportRow = {
  name: string;
  recipeSku?: string;
  category?: string;
  subCategory?: string;
  productionArea?: string;
  yieldQty?: string;
  yieldUnit?: string;
  sellPrice?: number;
  description?: string;
  sopSteps?: WmsRecipeSopStep[];
  source?: string;
  bom?: Array<{
    lineType?: string;
    productName?: string;
    sku?: string;
    qty: number;
    unit?: string;
    wastePct?: number;
    shrinkagePct?: number;
    subRecipeId?: string;
  }>;
};

export type WmsRecipeImportResult = {
  dryRun: boolean;
  created: number;
  skipped: number;
  errors: string[];
  preview: Array<{ name: string; bomLines: number; sopSteps: number }>;
};

export async function importWmsRecipesFromBundle(
  input: { recipes: WmsRecipeImportRow[] },
  opts?: { dryRun?: boolean },
): Promise<WmsRecipeImportResult> {
  const dryRun = opts?.dryRun ?? false;
  const products = await getWmsProducts();
  const skuToId = new Map(products.map((p) => [p.sku.toLowerCase(), p.id]));
  const subRecipes = await listProductionRecipes();
  const subByName = new Map(subRecipes.map((s) => [s.name.toLowerCase(), s.id]));

  const result: WmsRecipeImportResult = { dryRun, created: 0, skipped: 0, errors: [], preview: [] };

  for (const row of input.recipes) {
    if (!row.name?.trim()) {
      result.errors.push("Baris tanpa nama resep dilewati.");
      result.skipped++;
      continue;
    }
    if (row.source === "os-sync") {
      result.skipped++;
      continue;
    }

    const bomResolved: Array<
      | { lineType: "ingredient" | "packaging"; productId: string; qty: number; wastePct: number }
      | { lineType: "sub_recipe"; subRecipeId: string; qty: number }
    > = [];

    for (const b of row.bom ?? []) {
      const qty = Number(b.qty);
      if (!(qty > 0)) continue;
      const lineType = b.lineType === "packaging" ? "packaging" : b.lineType === "sub_recipe" ? "sub_recipe" : "ingredient";
      if (lineType === "sub_recipe") {
        const subId =
          b.subRecipeId ||
          (b.productName ? subByName.get(b.productName.toLowerCase()) : undefined);
        if (!subId) {
          result.errors.push(`${row.name}: sub-recipe "${b.productName ?? "?"}" tidak ditemukan.`);
          continue;
        }
        bomResolved.push({ lineType: "sub_recipe", subRecipeId: subId, qty });
      } else {
        const pid = b.sku ? skuToId.get(b.sku.toLowerCase()) : undefined;
        if (!pid) {
          result.errors.push(`${row.name}: SKU "${b.sku ?? "?"}" tidak ada di WMS.`);
          continue;
        }
        bomResolved.push({
          lineType: lineType === "packaging" ? "packaging" : "ingredient",
          productId: pid,
          qty,
          wastePct: Number(b.wastePct) || 0,
        });
      }
    }

    const sop = (row.sopSteps ?? []).filter((s) => s.title?.trim());
    result.preview.push({ name: row.name.trim(), bomLines: bomResolved.length, sopSteps: sop.length });

    if (dryRun) continue;

    const db = getDb();
    const [rec] = await db
      .insert(wmsRecipe)
      .values({
        name: row.name.trim(),
        recipeSku: row.recipeSku?.trim() ?? "",
        recipeCode: row.recipeSku?.trim() ?? "",
        category: row.category?.trim() ?? "",
        subCategory: row.subCategory?.trim() ?? "",
        productionArea: row.productionArea?.trim() ?? "",
        yieldQty: row.yieldQty?.trim() || "1",
        yieldUnit: row.yieldUnit?.trim() || "porsi",
        sellPrice: Math.round(Number(row.sellPrice) || 0),
        description: row.description?.trim() ?? "",
        sopSteps: JSON.stringify(
          sop.map((s, i) => ({
            order: s.order || i + 1,
            title: s.title.trim(),
            durationMin: Math.max(0, Number(s.durationMin) || 0),
            notes: s.notes?.trim() ?? "",
          })),
        ),
        recipeStatus: "draft",
        version: "v1",
      })
      .returning();

    if (bomResolved.length) {
      await db.insert(wmsBomItem).values(
        bomResolved.map((b) =>
          b.lineType === "sub_recipe"
            ? { recipeId: rec.id, lineType: "sub_recipe", subRecipeId: b.subRecipeId, qty: b.qty }
            : {
                recipeId: rec.id,
                lineType: b.lineType,
                productId: b.productId,
                qty: b.qty,
                wastePct: b.wastePct,
              },
        ),
      );
    }
    result.created++;
  }

  return result;
}

export async function updateWmsRecipeSop(
  recipeId: string,
  steps: WmsRecipeSopStep[],
  actor?: { id: string; name: string },
) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, recipeId)).limit(1);
  if (!rec) return null;
  if (rec.version.startsWith("os:")) {
    throw new Error("SOP resep OS-sync — edit di Produk Manajemen.");
  }
  await saveRecipeVersionSnapshot(recipeId, "Sebelum update SOP", actor?.name ?? "");
  const normalized = steps
    .map((s, i) => ({
      order: s.order || i + 1,
      title: s.title.trim(),
      durationMin: Math.max(0, Number(s.durationMin) || 0),
      notes: s.notes?.trim() ?? "",
    }))
    .filter((s) => s.title.length > 0);
  const [updated] = await db
    .update(wmsRecipe)
    .set({
      sopSteps: JSON.stringify(normalized),
      recipeStatus: "draft",
      updatedAt: new Date(),
    })
    .where(eq(wmsRecipe.id, recipeId))
    .returning();
  if (updated && actor) {
    await logRecipeAudit(recipeId, "sop_update", {
      actorId: actor.id,
      actorName: actor.name,
      note: `${normalized.length} langkah`,
    });
  }
  return { ...updated, sopSteps: normalized };
}

export async function submitRecipeForApproval(
  recipeId: string,
  actor: { id: string; name: string; role: string },
) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, recipeId)).limit(1);
  if (!rec) return null;
  if (rec.recipeStatus !== "draft" && rec.recipeStatus !== "archived") {
    throw new Error("Hanya resep draft/archived yang bisa diajukan.");
  }
  await saveRecipeVersionSnapshot(recipeId, "Sebelum ajukan approval", actor.name);
  const [updated] = await db
    .update(wmsRecipe)
    .set({ recipeStatus: "pending_kitchen", updatedAt: new Date() })
    .where(eq(wmsRecipe.id, recipeId))
    .returning();
  await logRecipeAudit(recipeId, "submit", {
    step: "kitchen",
    actorId: actor.id,
    actorName: actor.name,
    note: `Diajukan oleh ${actor.role}`,
  });
  return updated;
}

export async function approveRecipeStep(
  recipeId: string,
  actor: { id: string; name: string; role: string },
) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, recipeId)).limit(1);
  if (!rec) return null;
  const step = rec.recipeStatus as string;
  const chain = APPROVAL_CHAIN[step];
  if (!chain) throw new Error("Resep tidak dalam antrian approval.");
  if (!chain.roles.includes(actor.role)) {
    throw new Error(`Role ${actor.role} tidak bisa approve tahap ${step}.`);
  }
  const [updated] = await db
    .update(wmsRecipe)
    .set({ recipeStatus: chain.next, updatedAt: new Date() })
    .where(eq(wmsRecipe.id, recipeId))
    .returning();
  await logRecipeAudit(recipeId, "approve", {
    step,
    actorId: actor.id,
    actorName: actor.name,
    note: `→ ${chain.next}`,
  });
  return updated;
}

export async function rejectRecipeToDraft(
  recipeId: string,
  actor: { id: string; name: string },
  note?: string,
) {
  const db = getDb();
  const [updated] = await db
    .update(wmsRecipe)
    .set({ recipeStatus: "draft", updatedAt: new Date() })
    .where(eq(wmsRecipe.id, recipeId))
    .returning();
  if (!updated) return null;
  await logRecipeAudit(recipeId, "reject", {
    actorId: actor.id,
    actorName: actor.name,
    note: note ?? "Dikembalikan ke draft",
  });
  return updated;
}

export async function addRecipeBomLine(
  recipeId: string,
  line:
    | { lineType: "ingredient" | "packaging"; productId: string; qty: number; wastePct?: number }
    | { lineType: "sub_recipe"; subRecipeId: string; qty: number },
) {
  const db = getDb();
  const [rec] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.id, recipeId)).limit(1);
  if (!rec) return null;
  if (rec.version.startsWith("os:")) {
    throw new Error("BOM resep OS-sync — edit di Produk Manajemen lalu tarik ulang.");
  }
  await saveRecipeVersionSnapshot(recipeId, "Sebelum tambah BOM");
  const values =
    line.lineType === "sub_recipe"
      ? {
          recipeId,
          lineType: "sub_recipe" as const,
          subRecipeId: line.subRecipeId,
          productId: null,
          qty: line.qty,
        }
      : {
          recipeId,
          lineType: line.lineType,
          productId: line.productId,
          qty: line.qty,
          wastePct: line.wastePct ?? 0,
        };
  const [row] = await db.insert(wmsBomItem).values(values).returning();
  await db.update(wmsRecipe).set({ recipeStatus: "draft", updatedAt: new Date() }).where(eq(wmsRecipe.id, recipeId));
  return row;
}

/** Keuangan & HPP: KPI + ringkasan per resep. */
export async function getWmsFinanceOverview() {
  const recipes = await listWmsRecipes();
  const products = await getWmsProducts();
  const inventoryValue = Math.round(products.reduce((s, p) => s + p.onHand * p.hpp, 0));
  const withCost = recipes.filter((r) => r.cogs > 0);
  const avgFoodCost =
    withCost.length > 0
      ? Math.round((withCost.reduce((s, r) => s + r.foodCostPct, 0) / withCost.length) * 10) / 10
      : 0;
  return {
    kpis: {
      inventoryValue,
      avgFoodCost,
      totalMaterials: products.length,
      totalRecipes: recipes.length,
    },
    recipes,
    materials: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      hpp: p.hpp,
    })),
  };
}

// =============================================================================
// FASE 5 — Reports (dari ledger) + Stock Opname + Adjustment.
// =============================================================================

export async function getWmsReports(params?: {
  from?: string;
  to?: string;
  type?: string;
  warehouseId?: string;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const limit = Math.min(Math.max(Number(params?.limit ?? 200), 1), 500);
  const offset = Math.max(Number(params?.offset ?? 0), 0);
  const filters = [];
  // Tanggal "YYYY-MM-DD" = hari kalender WIB penuh (akhir inklusif); ISO lengkap dipakai apa adanya.
  const isKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (params?.from) {
    const from = isKey(params.from) ? new Date(`${params.from}T00:00:00+07:00`) : new Date(params.from);
    if (!Number.isNaN(from.getTime())) filters.push(sql`${wmsStockMovement.createdAt} >= ${from}`);
  }
  if (params?.to) {
    if (isKey(params.to)) {
      const end = new Date(new Date(`${params.to}T00:00:00+07:00`).getTime() + 86_400_000);
      filters.push(sql`${wmsStockMovement.createdAt} < ${end}`);
    } else {
      const to = new Date(params.to);
      if (!Number.isNaN(to.getTime())) filters.push(sql`${wmsStockMovement.createdAt} <= ${to}`);
    }
  }
  if (params?.type && params.type !== "all") filters.push(eq(wmsStockMovement.type, params.type));
  if (params?.warehouseId) filters.push(eq(wmsStockMovement.warehouseId, params.warehouseId));
  const where = filters.length ? and(...filters) : undefined;

  const [agg] = await db
    .select({
      masuk: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} > 0 then ${wmsStockMovement.qty} else 0 end), 0)`,
      keluar: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then -${wmsStockMovement.qty} else 0 end), 0)`,
      valueMasuk: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} > 0 then ${wmsStockMovement.valueHpp} else 0 end), 0)`,
      valueKeluar: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then ${wmsStockMovement.valueHpp} else 0 end), 0)`,
      total: sql<number>`count(*)::int`,
    })
    .from(wmsStockMovement)
    .where(where);

  const bars = await db
    .select({
      day: sql<string>`to_char(${wmsStockMovement.createdAt} AT TIME ZONE 'Asia/Jakarta', 'DD/MM')`,
      masuk: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} > 0 then ${wmsStockMovement.qty} else 0 end), 0)`,
      keluar: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then -${wmsStockMovement.qty} else 0 end), 0)`,
    })
    .from(wmsStockMovement)
    .where(where)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const rows = await db
    .select({
      id: wmsStockMovement.id,
      type: wmsStockMovement.type,
      qty: wmsStockMovement.qty,
      valueHpp: wmsStockMovement.valueHpp,
      refDoc: wmsStockMovement.refDoc,
      createdAt: wmsStockMovement.createdAt,
      productName: wmsProduct.name,
      warehouseName: wmsWarehouse.name,
    })
    .from(wmsStockMovement)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsStockMovement.productId))
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockMovement.warehouseId))
    .where(where)
    .orderBy(desc(wmsStockMovement.createdAt))
    .limit(limit)
    .offset(offset);

  const totalRows = Number(agg?.total ?? 0);
  return {
    kpis: {
      masuk: Math.round(Number(agg?.masuk ?? 0)),
      keluar: Math.round(Number(agg?.keluar ?? 0)),
      valueMasuk: Math.round(Number(agg?.valueMasuk ?? 0)),
      valueKeluar: Math.round(Number(agg?.valueKeluar ?? 0)),
      total: totalRows,
    },
    page: { limit, offset, total: totalRows, hasMore: offset + limit < totalRows },
    bars: bars.map((b) => ({ label: b.day, masuk: Number(b.masuk), keluar: Number(b.keluar) })),
    movements: rows.map((r) => ({
      id: r.id,
      type: r.type,
      qty: Number(r.qty),
      valueHpp: Math.round(Number(r.valueHpp)),
      refDoc: r.refDoc,
      productName: r.productName ?? "-",
      warehouseName: r.warehouseName ?? "-",
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** Adjustment manual stok (koreksi) — lewat ledger. Wajib alasan (audit). */
export async function adjustWmsStock(
  input: { productId: string; warehouseId: string; deltaQty: number; note?: string },
  userId?: string | null,
) {
  const reason = input.note?.trim();
  if (!reason) throw new Error("Alasan penyesuaian wajib diisi.");
  const delta = Number(input.deltaQty);
  if (!Number.isFinite(delta) || delta === 0) throw new Error("Jumlah penyesuaian tidak valid.");
  return runInTx(async (tx) => {
    const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, input.productId)).limit(1);
    if (!prod) throw new Error("Produk tidak ditemukan.");
    await recordStockMovement(tx, {
      type: "adjustment",
      productId: input.productId,
      warehouseId: input.warehouseId,
      deltaQty: delta,
      hpp: Number(prod.hpp),
      refDoc: `ADJ · ${reason}`,
      userId: userId ?? null,
    });
    await writeWmsAudit(tx, {
      userId,
      action: "Penyesuaian stok gudang",
      object: prod.sku,
      status: "warning",
      metadata: { productId: input.productId, warehouseId: input.warehouseId, deltaQty: delta, reason },
    });
    return { ok: true };
  });
}

// =============================================================================
// Smart Stock Opname (Phase 3). Satu sistem opname (wms_stock_opname/line) + ledger existing.
// - Snapshot stok per hitung, di dalam transaksi yang mengunci baris stok ruang → konsisten
//   dengan urutan ledger; finalisasi menerapkan delta (fisik − snapshot) ke stok live sehingga
//   transaksi sesudah hitung (jual/terima/transfer) tidak terhapus.
// - Riwayat hitung append-only (wms_opname_count), hitungan pertama disimpan di baris.
// - Klasifikasi toleransi deterministik (wms-opname-rules) → hitung ulang / Manajer / Owner.
// - Nilai yang diposting disimpan per baris dari ledger (historis), tidak membuat expense.
// =============================================================================

export type OpnameKind = "daily" | "weekly" | "monthly" | "incidental";
export type OpnameScope = "full" | "partial" | "cycle";

/** Toleransi dari app_settings `wms.opname.tolerance` (global), digabung dengan default. */
export async function loadOpnameTolerance(db: Db = getDb()): Promise<ToleranceConfig> {
  const [row] = await db
    .select({ value: appSettings.valueJson })
    .from(appSettings)
    .where(and(eq(appSettings.key, "wms.opname.tolerance"), sql`${appSettings.outletId} is null`))
    .limit(1);
  const stored = (row?.value ?? {}) as Partial<ToleranceConfig>;
  return {
    ...DEFAULT_TOLERANCE,
    ...stored,
    absoluteByUnit: { ...DEFAULT_TOLERANCE.absoluteByUnit, ...(stored.absoluteByUnit ?? {}) },
    recountPctByCategory: { ...DEFAULT_TOLERANCE.recountPctByCategory, ...(stored.recountPctByCategory ?? {}) },
  };
}

/** Tipe ruang sebuah sesi opname (untuk cek izin lokasi di setiap endpoint). */
export async function getWmsOpnameWarehouseType(id: string) {
  const [row] = await getDb()
    .select({ type: wmsWarehouse.type })
    .from(wmsStockOpname)
    .innerJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockOpname.warehouseId))
    .where(eq(wmsStockOpname.id, id))
    .limit(1);
  return (row?.type ?? null) as WmsWarehouse["type"] | null;
}

export async function createWmsOpname(
  warehouseId: string,
  userId?: string | null,
  opts: { kind?: OpnameKind; scope?: OpnameScope; productIds?: string[] } = {},
) {
  const kind: OpnameKind = opts.kind ?? "incidental";
  const scope: OpnameScope = opts.scope ?? (opts.productIds?.length ? "cycle" : "partial");
  if (scope === "cycle" && !opts.productIds?.length) throw new Error("Cycle count butuh daftar bahan.");
  return runInTx(async (tx) => {
    const policy = await loadBusinessDayPolicy(tx);
    const [op] = await tx
      .insert(wmsStockOpname)
      .values({
        doc: makeWmsDoc("OPN"),
        warehouseId,
        status: "draft",
        createdBy: userId ?? null,
        kind,
        scope,
        businessDate: jakartaDateKey(new Date(), policy),
      })
      .returning();
    // Baris = semua bahan aktif yang pernah punya stok di ruang ini (termasuk stok 0 — bulanan
    // wajib memeriksa bahan yang sistemnya kosong) atau daftar cycle count.
    const stocks = await tx
      .select({ productId: wmsWarehouseStock.productId, qty: wmsWarehouseStock.qty })
      .from(wmsWarehouseStock)
      .innerJoin(wmsProduct, eq(wmsProduct.id, wmsWarehouseStock.productId))
      .where(
        and(
          eq(wmsWarehouseStock.warehouseId, warehouseId),
          sql`${wmsProduct.archivedAt} is null`,
          opts.productIds?.length ? inArray(wmsWarehouseStock.productId, opts.productIds) : sql`true`,
        ),
      );
    const have = new Set(stocks.map((s) => s.productId));
    const extra = (opts.productIds ?? []).filter((id) => !have.has(id)).map((productId) => ({ productId, qty: 0 }));
    const rows = [...stocks, ...extra];
    if (rows.length) {
      await tx.insert(wmsOpnameLine).values(
        rows.map((s) => ({ opnameId: op.id, productId: s.productId, systemQty: Number(s.qty), physicalQty: Number(s.qty) })),
      );
    }
    await writeWmsAudit(tx, { userId, action: "Sesi opname dibuat", object: op.doc, metadata: { opnameId: op.id, kind, scope, lines: rows.length } });
    return op;
  });
}

/**
 * Detail opname. Blind (penghitung non-Owner/Manajer): stok sistem, selisih, nilai, klasifikasi
 * disembunyikan, dan hitungan petugas LAIN tidak terlihat sebelum disetujui.
 */
export async function getWmsOpname(id: string, opts: { blind?: boolean; viewerId?: string | null } = {}) {
  const db = getDb();
  const [op] = await db.select().from(wmsStockOpname).where(eq(wmsStockOpname.id, id)).limit(1);
  if (!op) return null;
  const lines = await db
    .select({
      id: wmsOpnameLine.id,
      productId: wmsOpnameLine.productId,
      productName: wmsProduct.name,
      sku: wmsProduct.sku,
      barcode: wmsProduct.barcode,
      imageUrl: wmsProduct.imageUrl,
      category: wmsProduct.category,
      unit: wmsProduct.unit,
      hpp: wmsProduct.hpp,
      systemQty: wmsOpnameLine.systemQty,
      physicalQty: wmsOpnameLine.physicalQty,
      countedAt: wmsOpnameLine.countedAt,
      countedBy: wmsOpnameLine.countedBy,
      firstPhysicalQty: wmsOpnameLine.firstPhysicalQty,
      firstSystemQty: wmsOpnameLine.firstSystemQty,
      countAttempts: wmsOpnameLine.countAttempts,
      needsRecount: wmsOpnameLine.needsRecount,
      recountReason: wmsOpnameLine.recountReason,
      classification: wmsOpnameLine.classification,
      postedVariance: wmsOpnameLine.postedVariance,
      postedValue: wmsOpnameLine.postedValue,
    })
    .from(wmsOpnameLine)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsOpnameLine.productId))
    .where(eq(wmsOpnameLine.opnameId, id))
    .orderBy(wmsProduct.category, wmsProduct.name);
  const blind = !!opts.blind && op.status !== "completed";
  const { loadProductUoms } = await import("@/lib/wms-uom");
  const uoms = await loadProductUoms(lines.map((l) => l.productId).filter((x): x is string => !!x), db);
  const counted = lines.filter((l) => l.countedAt).length;
  return {
    id: op.id,
    doc: op.doc,
    warehouseId: op.warehouseId,
    status: op.status,
    kind: op.kind,
    scope: op.scope,
    businessDate: op.businessDate ? String(op.businessDate) : null,
    blind,
    rejectReason: op.rejectReason,
    submittedAt: op.submittedAt?.toISOString() ?? null,
    approvedAt: op.approvedAt?.toISOString() ?? null,
    createdAt: op.createdAt.toISOString(),
    progress: { counted, total: lines.length, recount: lines.filter((l) => l.needsRecount).length },
    approvalTier: blind ? null : worstClass(lines.filter((l) => l.countedAt).map((l) => l.classification as OpnameClass | null)),
    lines: lines.map((l) => {
      const isCounted = !!l.countedAt;
      // Penghitung blind hanya melihat angka hitungannya sendiri.
      const own = !opts.viewerId || l.countedBy === opts.viewerId;
      const variance = isCounted ? Number((Number(l.physicalQty) - Number(l.systemQty)).toFixed(4)) : 0;
      return {
        id: l.id,
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        barcode: l.barcode,
        imageUrl: l.imageUrl,
        category: l.category,
        unit: l.unit,
        uoms: l.productId ? (uoms.get(l.productId) ?? []) : [],
        counted: isCounted,
        countedByMe: isCounted && own,
        attempts: l.countAttempts,
        needsRecount: l.needsRecount,
        recountReason: l.recountReason,
        systemQty: blind ? null : Number(l.systemQty),
        physicalQty: blind && (!isCounted || !own) ? null : Number(l.physicalQty),
        firstPhysicalQty: blind ? null : l.firstPhysicalQty === null ? null : Number(l.firstPhysicalQty),
        variance: blind ? null : variance,
        varianceValue: blind ? null : l.postedValue !== null ? Math.round(Number(l.postedValue)) : Math.round(variance * Number(l.hpp ?? 0)),
        classification: blind ? null : (l.classification as OpnameClass | null),
      };
    }),
  };
}

export async function listWmsOpnames(filter: { allowedTypes?: WmsWarehouse["type"][] | "all" } = {}) {
  const db = getDb();
  const rows = await db
    .select({
      id: wmsStockOpname.id,
      doc: wmsStockOpname.doc,
      status: wmsStockOpname.status,
      kind: wmsStockOpname.kind,
      scope: wmsStockOpname.scope,
      rejectReason: wmsStockOpname.rejectReason,
      createdAt: wmsStockOpname.createdAt,
      warehouseId: wmsStockOpname.warehouseId,
      warehouseName: wmsWarehouse.name,
      warehouseType: wmsWarehouse.type,
      lines: sql<number>`count(${wmsOpnameLine.id})::int`,
      counted: sql<number>`count(${wmsOpnameLine.countedAt})::int`,
      recount: sql<number>`count(*) filter (where ${wmsOpnameLine.needsRecount})::int`,
    })
    .from(wmsStockOpname)
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockOpname.warehouseId))
    .leftJoin(wmsOpnameLine, eq(wmsOpnameLine.opnameId, wmsStockOpname.id))
    .where(
      filter.allowedTypes && filter.allowedTypes !== "all" ? inArray(wmsWarehouse.type, filter.allowedTypes) : sql`true`,
    )
    .groupBy(wmsStockOpname.id, wmsWarehouse.name, wmsWarehouse.type)
    .orderBy(desc(wmsStockOpname.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    doc: r.doc,
    status: r.status,
    kind: r.kind,
    scope: r.scope,
    rejected: r.status === "draft" && !!r.rejectReason,
    warehouseId: r.warehouseId,
    warehouse: r.warehouseName ?? "-",
    lines: Number(r.lines),
    counted: Number(r.counted),
    recount: Number(r.recount),
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Simpan hitungan fisik (autosave aman). Snapshot stok sistem diambil SAAT dihitung, di dalam
 * transaksi yang mengunci baris stok ruang (urutan konsisten dengan ledger). Hitungan pertama
 * disimpan; hitung ulang menambah riwayat. `clientRequestId` = idempoten (kirim ulang setelah
 * koneksi putus tidak menambah percobaan). Hanya selama draft.
 */
export async function saveWmsOpnameLine(
  lineId: string,
  physicalQty: number,
  opnameId?: string,
  userId?: string | null,
  opts: { clientRequestId?: string | null; breakdown?: Record<string, unknown> | null } = {},
) {
  if (!Number.isFinite(physicalQty) || physicalQty < 0) throw new Error("Jumlah fisik harus angka ≥ 0.");
  return runInTx(async (tx) => {
    const [line] = await tx
      .select({ line: wmsOpnameLine, status: wmsStockOpname.status, warehouseId: wmsStockOpname.warehouseId })
      .from(wmsOpnameLine)
      .innerJoin(wmsStockOpname, eq(wmsStockOpname.id, wmsOpnameLine.opnameId))
      .where(eq(wmsOpnameLine.id, lineId))
      .for("update", { of: wmsOpnameLine })
      .limit(1);
    if (!line || (opnameId && line.line.opnameId !== opnameId)) return null;
    if (line.status === "completed") throw new Error("Opname sudah difinalisasi — hitungan tidak bisa diubah.");
    if (line.status === "submitted") throw new Error("Opname sedang menunggu persetujuan manajer — hitungan terkunci.");
    if (opts.clientRequestId) {
      const [dup] = await tx
        .select({ id: wmsOpnameCount.id })
        .from(wmsOpnameCount)
        .where(and(eq(wmsOpnameCount.lineId, lineId), eq(wmsOpnameCount.clientRequestId, opts.clientRequestId)))
        .limit(1);
      if (dup) return line.line; // kiriman ulang autosave — sudah tersimpan
    }
    let systemQty = 0;
    if (line.line.productId && line.warehouseId) {
      // Kunci baris stok ruang: snapshot tidak bisa "di tengah" mutasi lain yang sedang berjalan.
      const [stock] = await tx
        .select({ qty: wmsWarehouseStock.qty })
        .from(wmsWarehouseStock)
        .where(and(eq(wmsWarehouseStock.productId, line.line.productId), eq(wmsWarehouseStock.warehouseId, line.warehouseId)))
        .for("update")
        .limit(1);
      systemQty = Number(stock?.qty ?? 0);
    }
    const attempt = line.line.countAttempts + 1;
    const isRecount = line.line.countAttempts > 0;
    const [prod] = line.line.productId
      ? await tx.select({ unit: wmsProduct.unit, hpp: wmsProduct.hpp, category: wmsProduct.category }).from(wmsProduct).where(eq(wmsProduct.id, line.line.productId)).limit(1)
      : [];
    const priorEvents = line.line.productId && line.warehouseId ? await opnameVarianceEvents(tx, line.line.productId, line.warehouseId, line.line.opnameId) : 0;
    const cls = classifyVariance(
      {
        systemQty,
        physicalQty,
        unit: prod?.unit ?? "",
        rate: Number(prod?.hpp ?? 0),
        category: prod?.category,
        priorVarianceEvents: priorEvents,
        recounted: isRecount && line.line.needsRecount,
      },
      await loadOpnameTolerance(tx),
    );
    const [row] = await tx
      .update(wmsOpnameLine)
      .set({
        physicalQty,
        systemQty,
        countedAt: new Date(),
        countedBy: userId ?? null,
        countAttempts: attempt,
        firstPhysicalQty: line.line.countAttempts === 0 ? physicalQty : line.line.firstPhysicalQty,
        firstSystemQty: line.line.countAttempts === 0 ? systemQty : line.line.firstSystemQty,
        classification: cls.classification,
        // Selisih di atas toleransi → wajib hitung ulang (penghitung blind hanya diberi tahu
        // "hitung ulang", tanpa angka sistem). Hitung ulang yang diminta selesai setelah dihitung lagi;
        // bila tetap di luar toleransi, klasifikasi naik ke review Manajer.
        needsRecount: cls.classification === "recount",
        recountReason: cls.classification === "recount" ? "Di luar toleransi — hitung ulang untuk memastikan." : "",
      })
      .where(eq(wmsOpnameLine.id, lineId))
      .returning();
    await tx.insert(wmsOpnameCount).values({
      lineId,
      opnameId: line.line.opnameId,
      attempt,
      kind: isRecount ? "recount" : "count",
      physicalQty,
      systemQty,
      breakdown: opts.breakdown ?? null,
      clientRequestId: opts.clientRequestId ?? null,
      countedBy: userId ?? null,
    });
    return row ?? null;
  });
}

/** Kejadian selisih (non-sesuai, sudah diposting) bahan di ruang ini dalam 90 hari, selain sesi ini. */
async function opnameVarianceEvents(db: Db, productId: string, warehouseId: string, exceptOpnameId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wmsOpnameLine)
    .innerJoin(wmsStockOpname, eq(wmsStockOpname.id, wmsOpnameLine.opnameId))
    .where(
      and(
        eq(wmsOpnameLine.productId, productId),
        eq(wmsStockOpname.warehouseId, warehouseId),
        eq(wmsStockOpname.status, "completed"),
        ne(wmsStockOpname.id, exceptOpnameId),
        sql`${wmsOpnameLine.postedVariance} is not null and ${wmsOpnameLine.postedVariance} <> 0`,
        sql`${wmsOpnameLine.postedAt} > now() - interval '90 days'`,
        sql`coalesce(${wmsOpnameLine.classification}, 'minor') <> 'minor'`,
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Penghitung mengirim hasil. Full = semua baris wajib dihitung; semua cakupan: baris yang
 * diminta dihitung ulang harus dihitung dulu.
 */
async function submitWmsOpnameTx(id: string, userId?: string | null) {
  return runInTx(async (tx) => {
    const [op] = await tx.select().from(wmsStockOpname).where(eq(wmsStockOpname.id, id)).for("update").limit(1);
    if (!op) return null;
    if (op.status !== "draft") throw new Error(op.status === "submitted" ? "Opname sudah dikirim." : "Opname sudah selesai.");
    const [stats] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        counted: sql<number>`count(${wmsOpnameLine.countedAt})::int`,
        recount: sql<number>`count(*) filter (where ${wmsOpnameLine.needsRecount})::int`,
      })
      .from(wmsOpnameLine)
      .where(eq(wmsOpnameLine.opnameId, id));
    const counted = Number(stats?.counted ?? 0);
    if (!counted) throw new Error("Belum ada bahan yang dihitung.");
    if (Number(stats?.recount ?? 0)) throw new Error(`${stats.recount} bahan diminta dihitung ulang — hitung dulu sebelum dikirim.`);
    if ((op.scope === "full" || op.scope === "cycle") && counted < Number(stats?.total ?? 0)) {
      throw new Error(`Opname ${op.scope === "full" ? "penuh" : "cycle"}: ${Number(stats.total) - counted} bahan belum dihitung. Isi 0 bila memang kosong.`);
    }
    const [updated] = await tx
      .update(wmsStockOpname)
      .set({ status: "submitted", submittedBy: userId ?? null, submittedAt: new Date() })
      .where(eq(wmsStockOpname.id, id))
      .returning();
    await writeWmsAudit(tx, { userId, action: "Opname dikirim ke manajer", object: op.doc, metadata: { opnameId: id, counted, scope: op.scope } });
    return updated;
  });
}

/** Manajer/Owner meminta hitung ulang baris tertentu → sesi kembali draft; hitungan lama tersimpan. */
async function requestOpnameRecountTx(id: string, lineIds: string[], reason: string, userId?: string | null) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Alasan hitung ulang wajib diisi.");
  if (!lineIds.length) throw new Error("Pilih bahan yang dihitung ulang.");
  return runInTx(async (tx) => {
    const [op] = await tx.select().from(wmsStockOpname).where(eq(wmsStockOpname.id, id)).for("update").limit(1);
    if (!op) return null;
    if (op.status === "completed") throw new Error("Opname sudah selesai — koreksi lewat opname baru / penyesuaian resmi.");
    const marked = await tx
      .update(wmsOpnameLine)
      .set({ needsRecount: true, recountReason: why })
      .where(and(eq(wmsOpnameLine.opnameId, id), inArray(wmsOpnameLine.id, lineIds), sql`${wmsOpnameLine.countedAt} is not null`))
      .returning({ id: wmsOpnameLine.id });
    if (!marked.length) throw new Error("Bahan yang dipilih belum pernah dihitung.");
    const [updated] = await tx
      .update(wmsStockOpname)
      .set({ status: "draft", recountRequestedAt: new Date(), rejectReason: `Hitung ulang: ${why}` })
      .where(eq(wmsStockOpname.id, id))
      .returning();
    await writeWmsAudit(tx, { userId, action: "Opname: hitung ulang diminta", object: op.doc, status: "warning", metadata: { opnameId: id, lines: marked.length, reason: why } });
    return updated;
  });
}

/** Manajer menolak → kembali draft untuk dihitung ulang (alasan wajib). */
async function rejectWmsOpnameTx(id: string, reason: string, userId?: string | null) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Alasan penolakan wajib diisi.");
  return runInTx(async (tx) => {
    const [op] = await tx.select().from(wmsStockOpname).where(eq(wmsStockOpname.id, id)).for("update").limit(1);
    if (!op) return null;
    if (op.status !== "submitted") throw new Error("Hanya opname yang sudah dikirim yang bisa ditolak.");
    const [updated] = await tx
      .update(wmsStockOpname)
      .set({ status: "draft", rejectReason: why })
      .where(eq(wmsStockOpname.id, id))
      .returning();
    await writeWmsAudit(tx, { userId, action: "Opname ditolak", object: op.doc, status: "warning", metadata: { opnameId: id, reason: why } });
    return updated;
  });
}

/**
 * Setujui & posting: tiap baris terhitung → adjustment = fisik − snapshot saat dihitung, diterapkan
 * ke stok live (mutasi sesudah hitung tetap). Baris tak terhitung dilewati (partial). Dikunci +
 * idempoten. Baris "eskalasi Owner" hanya bisa disetujui Owner. Nilai posting disimpan per baris
 * dari ledger (historis). `allowNegative` dipertahankan: penjualan sah sesudah hitung bisa membuat
 * saldo minus — ditandai `negativeAfter` di audit untuk ditinjau.
 */
async function finalizeWmsOpnameTx(
  id: string,
  userId?: string | null,
  opts: { allowSelfApproval?: boolean; approverRole?: string | null } = {},
) {
  return runInTx(async (tx) => {
    const [op] = await tx.select().from(wmsStockOpname).where(eq(wmsStockOpname.id, id)).for("update").limit(1);
    if (!op) return null;
    if (op.status === "completed") return op;
    if (op.status !== "submitted") throw new Error("Opname harus dikirim penghitung dulu sebelum disetujui.");
    if (!opts.allowSelfApproval && userId && op.submittedBy === userId) {
      throw new Error("Opname yang kamu kirim sendiri harus disetujui Owner atau manajer lain.");
    }
    if (!op.warehouseId) throw new Error("Opname tanpa warehouse.");

    const lines = await tx.select().from(wmsOpnameLine).where(eq(wmsOpnameLine.opnameId, id)).for("update");
    const tier = worstClass(lines.filter((l) => l.countedAt).map((l) => l.classification as OpnameClass | null));
    if (tier === "owner" && opts.approverRole && opts.approverRole !== "Owner") {
      throw new Error("Ada selisih kritis/berulang — opname ini harus disetujui Owner.");
    }
    if (lines.some((l) => l.needsRecount)) throw new Error("Masih ada bahan yang menunggu hitung ulang.");

    const now = new Date();
    const adjusted: Array<{ sku: string; systemQty: number; physicalQty: number; variance: number; value: number; before: number; after: number; negativeAfter: boolean }> = [];
    for (const l of lines) {
      if (!l.productId || !l.countedAt) continue;
      const variance = Number((Number(l.physicalQty) - Number(l.systemQty)).toFixed(4));
      if (variance === 0) {
        await tx.update(wmsOpnameLine).set({ postedVariance: 0, postedValue: 0, postedRate: null, postedAt: now }).where(eq(wmsOpnameLine.id, l.id));
        continue;
      }
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, l.productId)).limit(1);
      const before = await warehouseOnHand(tx, l.productId, op.warehouseId);
      const moved = await recordStockMovement(tx, {
        type: "adjustment",
        productId: l.productId,
        warehouseId: op.warehouseId,
        deltaQty: variance,
        hpp: Number(prod?.hpp ?? 0),
        refDoc: `${op.doc} · opname`,
        userId: userId ?? null,
        // Hitung fisik = kebenaran saat itu; penjualan sesudahnya boleh membuat minus.
        allowNegative: true,
      });
      // Nilai historis = biaya yang benar-benar dicatat ledger saat posting (moving average).
      const value = Math.round((variance < 0 ? -1 : 1) * Math.abs(Number(moved?.cost ?? variance * Number(prod?.hpp ?? 0))));
      const rate = Math.abs(variance) > 0 ? Math.abs(value / variance) : Number(prod?.hpp ?? 0);
      await tx
        .update(wmsOpnameLine)
        .set({ postedVariance: variance, postedValue: value, postedRate: Math.round(rate * 10_000) / 10_000, postedAt: now })
        .where(eq(wmsOpnameLine.id, l.id));
      const after = Number((before + variance).toFixed(4));
      adjusted.push({ sku: prod?.sku ?? "", systemQty: Number(l.systemQty), physicalQty: Number(l.physicalQty), variance, value, before, after, negativeAfter: after < 0 });
    }
    const [updated] = await tx
      .update(wmsStockOpname)
      .set({ status: "completed", approvedBy: userId ?? null, approvedAt: now })
      .where(eq(wmsStockOpname.id, id))
      .returning();
    await writeWmsAudit(tx, {
      userId,
      action: "Opname disetujui & diposting",
      object: op.doc,
      status: adjusted.length ? "warning" : "recorded",
      metadata: {
        opnameId: id,
        tier,
        approverRole: opts.approverRole ?? null,
        shortage: adjusted.filter((a) => a.value < 0).reduce((s, a) => s + a.value, 0),
        surplus: adjusted.filter((a) => a.value > 0).reduce((s, a) => s + a.value, 0),
        varianceValue: adjusted.reduce((sum, a) => sum + a.value, 0),
        lines: adjusted,
      },
    });
    return updated;
  });
}

/** Riwayat hitung (hanya Owner/Manajer — berisi snapshot sistem). */
export async function listOpnameCounts(opnameId: string) {
  return getDb()
    .select({ count: wmsOpnameCount, name: user.name })
    .from(wmsOpnameCount)
    .leftJoin(user, eq(user.id, wmsOpnameCount.countedBy))
    .where(eq(wmsOpnameCount.opnameId, opnameId))
    .orderBy(wmsOpnameCount.lineId, wmsOpnameCount.attempt);
}

// =============================================================================
// Ringkasan WMS (dipakai dashboard WMS + integrasi modul OS via /api/wms/summary).
// =============================================================================

export type WmsSummary = {
  inventoryValue: number; // total nilai stok (semua gudang)
  lowStockTotal: number; // total item menipis/habis di outlet
  byWarehouse: Array<{ code: string; name: string; type: string; area: string; value: number; lowCount: number; outCount: number }>;
  outletAlerts: Array<{ warehouse: string; area: string; items: Array<{ name: string; unit: string; onHand: number; min: number; status: "low" | "out" }> }>;
};

export async function getWmsSummary(): Promise<WmsSummary> {
  const warehouses = await listWmsWarehouses();
  let inventoryValue = 0;
  const byWarehouse: WmsSummary["byWarehouse"] = [];
  const outletAlerts: WmsSummary["outletAlerts"] = [];

  for (const w of warehouses) {
    const prods = await getWmsProducts({ warehouseId: w.id });
    const value = Math.round(prods.reduce((s, p) => s + p.onHand * p.hpp, 0));
    inventoryValue += value;
    // Alert: produk dengan ambang min (>0) yang stoknya di gudang ini <= min.
    const low = prods.filter((p) => p.minStock > 0 && p.onHand <= p.minStock);
    byWarehouse.push({
      code: w.code,
      name: w.name,
      type: w.type,
      area: w.area,
      value,
      lowCount: low.filter((p) => p.onHand > 0).length,
      outCount: low.filter((p) => p.onHand <= 0).length,
    });
    if (w.type !== "main" && low.length > 0) {
      outletAlerts.push({
        warehouse: w.name,
        area: w.area,
        items: low.slice(0, 25).map((p) => ({
          name: p.name,
          unit: p.unit,
          onHand: p.onHand,
          min: p.minStock,
          status: p.onHand <= 0 ? "out" : "low",
        })),
      });
    }
  }

  return {
    inventoryValue,
    lowStockTotal: outletAlerts.reduce((s, a) => s + a.items.length, 0),
    byWarehouse,
    outletAlerts,
  };
}

// =============================================================================
// Checklist gudang (harian / receiving-QC / opname). Template hardcoded per jenis.
// =============================================================================

export async function createChecklistRun(
  input: { type: ChecklistType; warehouseId?: string | null; refId?: string | null },
  userId?: string | null,
) {
  const db = getDb();
  const tpl = WMS_CHECKLIST_TEMPLATES[input.type];
  if (!tpl) throw new Error("Jenis checklist tidak dikenal.");
  const [run] = await db
    .insert(wmsChecklistRun)
    .values({
      type: input.type,
      warehouseId: input.warehouseId ?? null,
      refId: input.refId ?? null,
      status: "draft",
      createdBy: userId ?? null,
    })
    .returning();
  await db.insert(wmsChecklistRunItem).values(
    tpl.items.map((label, i) => ({ runId: run.id, label, sortOrder: i })),
  );
  return run;
}

export async function getChecklistRun(id: string) {
  const db = getDb();
  const [run] = await db.select().from(wmsChecklistRun).where(eq(wmsChecklistRun.id, id)).limit(1);
  if (!run) return null;
  const items = await db
    .select()
    .from(wmsChecklistRunItem)
    .where(eq(wmsChecklistRunItem.runId, id))
    .orderBy(wmsChecklistRunItem.sortOrder);
  const [wh] = run.warehouseId
    ? await db.select({ name: wmsWarehouse.name }).from(wmsWarehouse).where(eq(wmsWarehouse.id, run.warehouseId)).limit(1)
    : [{ name: null }];
  return {
    id: run.id,
    type: run.type,
    title: WMS_CHECKLIST_TEMPLATES[run.type as ChecklistType]?.title ?? "Checklist",
    warehouseId: run.warehouseId,
    warehouseName: wh?.name ?? null,
    status: run.status,
    note: run.note,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    items: items.map((it) => ({ id: it.id, label: it.label, checked: it.checked, note: it.note })),
  };
}

export async function toggleChecklistItem(itemId: string, checked: boolean, note?: string) {
  const db = getDb();
  const set: Record<string, unknown> = { checked };
  if (note !== undefined) set.note = note.trim();
  const [row] = await db.update(wmsChecklistRunItem).set(set).where(eq(wmsChecklistRunItem.id, itemId)).returning();
  return row ?? null;
}

export async function completeChecklistRun(id: string) {
  const db = getDb();
  const [row] = await db
    .update(wmsChecklistRun)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(wmsChecklistRun.id, id))
    .returning();
  return row ?? null;
}

export async function listChecklistRuns(type?: ChecklistType) {
  const db = getDb();
  const filters = [];
  if (type) filters.push(eq(wmsChecklistRun.type, type));
  const rows = await db
    .select({
      id: wmsChecklistRun.id,
      type: wmsChecklistRun.type,
      status: wmsChecklistRun.status,
      createdAt: wmsChecklistRun.createdAt,
      warehouseName: wmsWarehouse.name,
      total: sql<number>`count(${wmsChecklistRunItem.id})::int`,
      done: sql<number>`coalesce(sum(case when ${wmsChecklistRunItem.checked} then 1 else 0 end), 0)::int`,
    })
    .from(wmsChecklistRun)
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsChecklistRun.warehouseId))
    .leftJoin(wmsChecklistRunItem, eq(wmsChecklistRunItem.runId, wmsChecklistRun.id))
    .where(filters.length ? and(...filters) : undefined)
    .groupBy(wmsChecklistRun.id, wmsWarehouse.name)
    .orderBy(desc(wmsChecklistRun.createdAt))
    .limit(60);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: WMS_CHECKLIST_TEMPLATES[r.type as ChecklistType]?.title ?? "Checklist",
    status: r.status,
    warehouse: r.warehouseName ?? "-",
    total: Number(r.total),
    done: Number(r.done),
    createdAt: r.createdAt.toISOString(),
  }));
}

// =============================================================================
// FASE 6 — Smart 2026: Smart Reorder (forecast) + Cold Chain + Owner Analytics.
// =============================================================================

/** Saran reorder dari rata-rata konsumsi (out/internal_out) 30 hari terakhir. */
export async function getWmsSmartReorder() {
  const db = getDb();
  const config = await getWmsExtendedConfig();
  const coverDays = config.reorderLeadDays;
  const products = await getWmsProducts();

  const usageRows = await db
    .select({
      productId: wmsStockMovement.productId,
      totalOut: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then -${wmsStockMovement.qty} else 0 end), 0)`,
    })
    .from(wmsStockMovement)
    .where(
      and(
        sql`${wmsStockMovement.createdAt} >= now() - interval '30 days'`,
        or(eq(wmsStockMovement.type, "out"), eq(wmsStockMovement.type, "internal_out")),
      ),
    )
    .groupBy(wmsStockMovement.productId);
  const usageBy = new Map(usageRows.map((r) => [r.productId, Number(r.totalOut)]));

  const items = products.map((p) => {
    const avgDaily = (usageBy.get(p.id) ?? 0) / 30;
    const daysCover = avgDaily > 0 ? p.onHand / avgDaily : null;
    // Target: cukup N hari (settings) + buffer minStock.
    const target = Math.max(p.minStock, Math.ceil(avgDaily * coverDays));
    const suggestedQty = Math.max(0, Math.round(target - p.onHand));
    const urgency = p.onHand <= 0 ? "critical" : p.onHand <= p.minStock ? "low" : "ok";
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      onHand: p.onHand,
      minStock: p.minStock,
      avgDaily: Math.round(avgDaily * 100) / 100,
      daysCover: daysCover != null ? Math.round(daysCover * 10) / 10 : null,
      suggestedQty,
      urgency,
    };
  });

  const needReorder = items
    .filter((i) => i.suggestedQty > 0 || i.urgency !== "ok")
    .sort((a, b) => (a.daysCover ?? 9999) - (b.daysCover ?? 9999));
  return { items: needReorder, totalSuggestions: needReorder.length };
}

/** Simpan bacaan suhu cold chain (webhook IoT). */
export async function addColdChainReading(unitCode: string, tempC: number) {
  const db = getDb();
  const [row] = await db
    .insert(wmsColdChainReading)
    .values({ unitCode: unitCode.trim(), tempC })
    .returning();
  return row;
}

/** Ringkasan cold chain: unit + suhu terkini + tren + alert zona aman (0–8°C). */
export async function getWmsColdChain() {
  const db = getDb();
  // Seed contoh HANYA di dev/test/demo — di produksi jangan fabrikasi data sensor
  // (bacaan suhu palsu bisa menyembunyikan alert cold chain yang nyata).
  const allowSampleData =
    process.env.NODE_ENV !== "production" || process.env.GARAGE_SEED_DEMO === "true";
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(wmsColdChainReading);
  if (Number(n) === 0 && allowSampleData) {
    const now = Date.now();
    const units: Array<[string, number]> = [
      ["CHILLER-01", 4],
      ["FREEZER-01", -18],
      ["CHILLER-02", 9],
    ];
    const seed = [];
    for (const [code, base] of units) {
      for (let i = 11; i >= 0; i--) {
        seed.push({
          unitCode: code,
          // Variasi ±0,8°C: CHILLER-02 (9°C) selalu tetap di luar zona aman 0–8°C
          // (±1 bisa membulat ke 8,0 sehingga contoh alert kadang hilang).
          tempC: Math.round((base + (Math.random() * 1.6 - 0.8)) * 10) / 10,
          recordedAt: new Date(now - i * 60 * 60 * 1000),
        });
      }
    }
    await db.insert(wmsColdChainReading).values(seed);
  }

  const rows = await db
    .select()
    .from(wmsColdChainReading)
    .where(sql`${wmsColdChainReading.recordedAt} >= now() - interval '1 day'`)
    .orderBy(wmsColdChainReading.recordedAt);

  const byUnit = new Map<string, Array<{ t: string; temp: number }>>();
  for (const r of rows) {
    const arr = byUnit.get(r.unitCode) ?? [];
    arr.push({ t: r.recordedAt.toISOString(), temp: Number(r.tempC) });
    byUnit.set(r.unitCode, arr);
  }

  const units = Array.from(byUnit.entries()).map(([code, series]) => {
    const latest = series[series.length - 1]?.temp ?? 0;
    const isFreezer = code.toUpperCase().includes("FREEZER");
    const safe = isFreezer ? latest <= -12 : latest >= 0 && latest <= 8;
    return { code, latest, safe, series };
  });

  return {
    units,
    alerts: units.filter((u) => !u.safe).map((u) => ({ code: u.code, temp: u.latest })),
  };
}

/** Owner analytics: food cost, margin, top bahan konsumsi, waste. */
export async function getWmsOwnerAnalytics() {
  const db = getDb();
  const recipes = await listWmsRecipes();
  const withCost = recipes.filter((r) => r.cogs > 0);
  const avgFoodCost =
    withCost.length > 0
      ? Math.round((withCost.reduce((s, r) => s + r.foodCostPct, 0) / withCost.length) * 10) / 10
      : 0;
  const avgMargin =
    recipes.length > 0 ? Math.round(recipes.reduce((s, r) => s + r.margin, 0) / recipes.length) : 0;

  // Top bahan berdasarkan nilai konsumsi 30 hari.
  const topRows = await db
    .select({
      name: wmsProduct.name,
      value: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then ${wmsStockMovement.valueHpp} else 0 end), 0)`,
    })
    .from(wmsStockMovement)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsStockMovement.productId))
    .where(sql`${wmsStockMovement.createdAt} >= now() - interval '30 days'`)
    .groupBy(wmsProduct.name)
    .orderBy(sql`2 desc`)
    .limit(6);

  const [waste] = await db
    .select({ v: sql<number>`coalesce(sum(${wmsStockMovement.valueHpp}), 0)` })
    .from(wmsStockMovement)
    .where(eq(wmsStockMovement.type, "waste"));

  return {
    kpis: {
      avgFoodCost,
      avgMargin,
      totalRecipes: recipes.length,
      wasteValue: Math.round(Number(waste?.v ?? 0)),
    },
    topMaterials: topRows
      .filter((r) => Number(r.value) > 0)
      .map((r) => ({ name: r.name ?? "-", value: Math.round(Number(r.value)) })),
    recipes: recipes.slice(0, 10),
  };
}

// =============================================================================
// FASE 7 — Integrasi POS. Setiap penjualan POS → cocokkan menu ke resep WMS →
// baca BOM → buat Internal Order untuk memotong bahan gudang (FEFO). Item tanpa
// resep WMS dilewati (tidak error). Stok kurang → dilewati (tidak blok jualan).
// =============================================================================

/** Normalisasi nama menu untuk pencocokan resep: buang varian & rapikan spasi. */
function normalizeMenuName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\((?:hot|cold|ice|panas|dingin|sedang|pedas|barbeque|balado|campur)\)/g, "")
    .replace(/\b(hot|cold|ice|panas|dingin|sedang|pedas|barbeque|balado|campur)\b/g, "")
    .replace(/[-–—|].*$/, "") // buang keterangan setelah pemisah
    .replace(/\s+/g, " ")
    .trim();
}

/** True bila SKU gudang sudah punya baris ledger (stok tidak boleh dihapus permanen). */
export async function wmsSkuHasLedger(sku: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: wmsStockMovement.id })
    .from(wmsStockMovement)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsStockMovement.productId))
    .where(eq(wmsProduct.sku, sku))
    .limit(1);
  return Boolean(row);
}

export async function processPosSale(
  input: { items: Array<{ name: string; qty: number }>; ref?: string | null },
  userId?: string | null,
) {
  const db = getDb();
  const processed: Array<{ menu: string; io: string }> = [];
  const skipped: Array<{ menu: string; reason: string }> = [];

  // Penjualan Garage OS sendiri sudah memotong stok di dalam transaksi order
  // (consumeWmsStockForSale). Webhook dengan ref = id/no order Garage akan
  // memotong dua kali → tolak.
  const ref = input.ref?.trim();
  if (ref) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
    const [own] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(isUuid ? or(eq(orders.id, ref), eq(orders.orderNo, ref)) : eq(orders.orderNo, ref))
      .limit(1);
    if (own) throw new Error("Order Garage OS sudah memotong stok saat transaksi; webhook tidak dipakai untuk order ini.");
  }

  // Muat semua resep sekali; cocokkan di memori (persis dulu, lalu ternormalisasi).
  // Resep yang diarsipkan tidak ikut dicocokkan supaya tidak memotong bahan lama.
  const recipes = await db.select().from(wmsRecipe).where(ne(wmsRecipe.recipeStatus, "archived"));
  const norm = new Map<string, typeof recipes>();
  for (const r of recipes) {
    const key = normalizeMenuName(r.name);
    const arr = norm.get(key) ?? [];
    arr.push(r);
    norm.set(key, arr);
  }

  // Peta kategori → area (bar/dapur/umum) untuk routing per bahan.
  const cats = await listWmsCategories();
  const areaByCat = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.area]));
  const areaOf = (category: string | null): WmsArea =>
    areaByCat.get((category ?? "").trim().toLowerCase()) ?? "umum";


  for (const it of input.items) {
    const soldQty = Number(it.qty);
    if (soldQty <= 0) continue;

    const exact = recipes.find((r) => r.name.trim().toLowerCase() === it.name.trim().toLowerCase());
    let candidates = exact ? [exact] : (norm.get(normalizeMenuName(it.name)) ?? []);

    if (!exact && candidates.length > 1) {
      const { parsePosMenuName } = await import("@/lib/wms-bridge");
      const parsed = parsePosMenuName(it.name);
      if (parsed.variantLabel) {
        const vLower = parsed.variantLabel.toLowerCase();
        const variantMatch = candidates.find(
          (r) =>
            r.name.trim().toLowerCase() === it.name.trim().toLowerCase() ||
            r.name.trim().toLowerCase().endsWith(` ${vLower}`),
        );
        if (variantMatch) candidates = [variantMatch];
      }
    }

    let recId: string;
    let recCategory: string;
    let lines: Array<{ productId: string; qty: number; area: WmsArea }>;

    if (candidates.length === 1) {
      const rec = candidates[0];
      recId = rec.id;
      recCategory = rec.category;
      const bom = await db
        .select({ productId: wmsBomItem.productId, qty: wmsBomItem.qty, category: wmsProduct.category })
        .from(wmsBomItem)
        .leftJoin(wmsProduct, eq(wmsProduct.id, wmsBomItem.productId))
        .where(eq(wmsBomItem.recipeId, rec.id));
      lines = bom
        .filter((b) => b.productId)
        .map((b) => ({
          productId: b.productId as string,
          qty: Number(b.qty) * soldQty,
          area: areaOf(b.category),
        }));
    } else if (candidates.length === 0) {
      const { resolveMenuBom } = await import("@/lib/wms-bridge");
      const osBom = await resolveMenuBom(it.name);
      if (!osBom) {
        skipped.push({ menu: it.name, reason: "tanpa resep WMS / menu OS" });
        continue;
      }
      recId = osBom.menuItemId;
      recCategory = osBom.category;
      lines = osBom.lines.map((b) => ({
        productId: b.productId,
        qty: b.qty * soldQty,
        area: b.area,
      }));
    } else {
      skipped.push({ menu: it.name, reason: "resep ganda (ambigu) — tidak dipotong" });
      continue;
    }

    if (lines.length === 0) {
      skipped.push({ menu: it.name, reason: "resep tanpa bahan" });
      continue;
    }

    // Penjualan = KONSUMSI bahan (mutasi "out"), bukan transfer gudang→outlet.
    // (Dulu memakai createInternalOrder: stok hanya pindah ruang, total tak berkurang.)
    // Bahan umum mengikuti area mayoritas resep supaya diambil dari ruang yang sama.
    const barCount = lines.filter((l) => l.area === "bar").length;
    const kitCount = lines.filter((l) => l.area === "dapur").length;
    const primaryArea: WmsArea =
      barCount === 0 && kitCount === 0
        ? /coffee|non.?coffee|kopi|minum|bar|drink/i.test(recCategory) ? "bar" : "dapur"
        : barCount >= kitCount ? "bar" : "dapur";

    const refDoc = input.ref ? `SALE ${input.ref}:${recId}` : `SALE ${makeWmsDoc("POS")}`;
    try {
      const result = await runInTx(async (tx) => {
        // Idempotensi: retry webhook dengan ref+resep sama tidak memotong dua kali.
        if (input.ref) {
          // Kunci per ref+resep: dua retry bersamaan tidak lolos cek duplikat berdua.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${refDoc}))`);
          const [dupe] = await tx
            .select({ id: wmsStockMovement.id })
            .from(wmsStockMovement)
            .where(sql`${wmsStockMovement.refDoc} like ${`${refDoc}%`}`)
            .limit(1);
          if (dupe) return { duplicate: true, shortage: 0 };
        }
        let shortage = 0;
        for (const l of lines) {
          const prod = await wmsProductById(tx, l.productId);
          if (!prod) continue;
          const area = prod.area === "umum" ? primaryArea : prod.area;
          shortage += await consumeProductForSale(tx, { ...prod, area }, l.qty, refDoc, userId ?? null);
        }
        return { duplicate: false, shortage };
      });
      processed.push({
        menu: it.name,
        io: result.duplicate ? `${refDoc} (sudah diproses)` : result.shortage > 0 ? `${refDoc} (melebihi stok tercatat)` : refDoc,
      });
    } catch (e) {
      skipped.push({ menu: it.name, reason: e instanceof Error ? e.message : "gagal potong stok" });
    }
  }

  return { processed, skipped };
}

// =============================================================================
// WMS Notifications + extended settings (app_settings key wms.config)
// =============================================================================

export type WmsNotification = {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  text: string;
  href: string;
};

export type WmsConfig = {
  expiryStrict: boolean;
  defaultPutAway: string;
  notifyLowStock: boolean;
  notifyColdChain: boolean;
  reorderLeadDays: number;
};

const WMS_CONFIG_KEY = "wms.config";
const DEFAULT_WMS_CONFIG: WmsConfig = {
  expiryStrict: true,
  defaultPutAway: "DRY",
  notifyLowStock: true,
  notifyColdChain: true,
  reorderLeadDays: 14,
};

export async function getWmsExtendedConfig(): Promise<WmsConfig> {
  const db = getDb();
  const [row] = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(and(eq(appSettings.key, WMS_CONFIG_KEY), sql`${appSettings.outletId} IS NULL`))
    .limit(1);
  const raw = row?.valueJson as Partial<WmsConfig> | undefined;
  return { ...DEFAULT_WMS_CONFIG, ...raw };
}

export async function updateWmsExtendedConfig(patch: Partial<WmsConfig>): Promise<WmsConfig> {
  const db = getDb();
  const current = await getWmsExtendedConfig();
  const next = { ...current, ...patch };
  const [existing] = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(and(eq(appSettings.key, WMS_CONFIG_KEY), sql`${appSettings.outletId} IS NULL`))
    .limit(1);
  if (existing) {
    await db.update(appSettings).set({ valueJson: next }).where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({ key: WMS_CONFIG_KEY, valueJson: next, outletId: null });
  }
  return next;
}

export async function getWmsNotifications(): Promise<WmsNotification[]> {
  await ensureWmsSeeded();
  const db = getDb();
  const config = await getWmsExtendedConfig();
  const notes: WmsNotification[] = [];
  if (config.notifyLowStock) {
    const products = await getWmsProducts();
    const low = products.filter((p) => p.status === "low" || p.status === "out");
    // Habis dulu, baru menipis; sisanya diringkas (tidak dipotong diam-diam).
    const ordered = [...low].sort((a, b) => (a.status === "out" ? 0 : 1) - (b.status === "out" ? 0 : 1));
    for (const p of ordered.slice(0, 5)) {
      notes.push({
        id: `low-${p.id}`,
        level: p.status === "out" ? "critical" : "warning",
        title: p.status === "out" ? "Out of Stock" : "Low Stock",
        text: `${p.name} (${p.onHand} ${p.unit})`,
        href: "/warehouse/inventory",
      });
    }
    if (ordered.length > 5) {
      notes.push({
        id: "low-more",
        level: "warning",
        title: "Stok menipis lainnya",
        text: `+${ordered.length - 5} bahan lagi menipis/habis`,
        href: "/warehouse/inventory",
      });
    }
  }
  if (config.notifyColdChain) {
    const cold = await getWmsColdChain();
    for (const a of cold.alerts.slice(0, 3)) {
      notes.push({
        id: `cold-${a.code}`,
        level: "critical",
        title: "Cold Chain Alert",
        text: `${a.code} suhu ${a.temp}°C di luar zona aman`,
        href: "/warehouse/cold-chain",
      });
    }
  }
  const [{ draftCount }] = await db
    .select({ draftCount: sql<number>`count(*)::int` })
    .from(wmsReceiving)
    .where(or(eq(wmsReceiving.status, "draft"), eq(wmsReceiving.status, "pending_approval")));
  if (Number(draftCount) > 0) {
    notes.push({
      id: "rcv-draft",
      level: "info",
      title: "Receiving Draft",
      text: `${draftCount} dokumen penerimaan belum selesai`,
      href: "/warehouse/receiving",
    });
  }
  // V2: dokumen yang menunggu tindakan gudang/manajemen (satu baris per jenis).
  const [[mrq], [po], [opname]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(wmsMaterialRequest).where(eq(wmsMaterialRequest.status, "submitted")),
    db.select({ n: sql<number>`count(*)::int` }).from(wmsPurchaseOrder).where(eq(wmsPurchaseOrder.status, "pending_approval")),
    db.select({ n: sql<number>`count(*)::int` }).from(wmsStockOpname).where(eq(wmsStockOpname.status, "submitted")),
  ]);
  const waiting: Array<[number, string, string, string, string]> = [
    [Number(mrq?.n ?? 0), "mrq-pending", "Minta Bahan", "permintaan Bar/Dapur belum dikirim", "/warehouse/material-requests"],
    [Number(po?.n ?? 0), "po-approval", "PO menunggu persetujuan", "PO perlu disetujui", "/warehouse/purchase-orders"],
    [Number(opname?.n ?? 0), "opname-review", "Opname menunggu tinjauan", "opname perlu ditinjau", "/warehouse/opname"],
  ];
  for (const [n, id, title, what, href] of waiting) {
    if (n > 0) notes.push({ id, level: "warning", title, text: `${n} ${what}`, href });
  }
  const pendingApprovals = await db
    .select({ id: approvals.id, amount: approvals.amount })
    .from(approvals)
    .where(and(eq(approvals.status, "pending"), ilike(approvals.type, "%Receiving%")))
    .limit(3);
  for (const a of pendingApprovals) {
    notes.push({
      id: `app-${a.id}`,
      level: "warning",
      title: "Approval Receiving",
      text: `Selisih qty ${a.amount} menunggu manager`,
      href: "/warehouse/receiving",
    });
  }
  return notes;
}

// --- Smart Notification V2: notifikasi persetujuan (setelah transaksi sukses) ---

export async function submitWmsOpname(id: string, userId?: string | null) {
  const result = await submitWmsOpnameTx(id, userId);
  if (result) await notifyOpnameSubmitted(result, await opnameNeedsOwner(id));
  return result;
}

export async function requestOpnameRecount(id: string, lineIds: string[], reason: string, userId?: string | null) {
  const result = await requestOpnameRecountTx(id, lineIds, reason, userId);
  if (result) await resolveOpnameReview(id, "Diminta hitung ulang");
  return result;
}

export async function rejectWmsOpname(id: string, reason: string, userId?: string | null) {
  const result = await rejectWmsOpnameTx(id, reason, userId);
  if (result) await resolveOpnameReview(id, "Opname ditolak");
  return result;
}

export async function finalizeWmsOpname(
  id: string,
  userId?: string | null,
  opts: { allowSelfApproval?: boolean; approverRole?: string | null } = {},
) {
  const result = await finalizeWmsOpnameTx(id, userId, opts);
  if (result?.status === "completed") await resolveOpnameReview(id, "Opname disetujui");
  return result;
}

/** Ada baris dengan selisih di atas batas Owner → hanya Owner yang boleh menyetujui. */
async function opnameNeedsOwner(id: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(wmsOpnameLine)
    .where(and(eq(wmsOpnameLine.opnameId, id), eq(wmsOpnameLine.classification, "owner")));
  return Number(row?.n ?? 0) > 0;
}
