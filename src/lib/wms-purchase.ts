import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  wmsBatch,
  wmsCategory,
  wmsProduct,
  wmsPurchaseOrder,
  wmsPurchaseOrderItem,
  wmsReceiving,
  wmsReceivingItem,
  wmsReorderRule,
  wmsStockMovement,
  wmsSupplier,
  wmsSupplierPayment,
  wmsWarehouse,
  wmsWarehouseStock,
} from "@/db/schema";
import { createReceiving, makeWmsDoc, runInTx, writeWmsAudit } from "@/lib/wms-service";
import { loadProductUoms } from "@/lib/wms-uom";

// =============================================================================
// GARAGE WMS — pembelian & reorder (konsep ERPNext: Purchase Order, Item Reorder
// per warehouse, Item Price history, Delivery Note/Pick List). Belanja tetap cash
// lunas saat penerimaan (recordCashPurchases) — PO tidak membuat hutang.
// =============================================================================

type Db = ReturnType<typeof getDb>;

export type { PoStatus as PurchaseOrderStatus } from "@/lib/wms-procurement-meta";
import type { PoStatus } from "@/lib/wms-procurement-meta";

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export type PurchaseOrderInput = {
  supplierId: string;
  warehouseId?: string | null;
  expectedDate?: string | null;
  note?: string;
  /** orderedQty & unitPrice dalam satuan dasar; uom/uomFactor = kemasan saat dipesan (cetak). */
  items: Array<{ productId: string; orderedQty: number; unitPrice: number; uom?: string | null; uomFactor?: number | null; sourceRefs?: string[] }>;
  deliveryNote?: string;
  paymentTerms?: string;
  showPrices?: boolean;
};

export async function createPurchaseOrder(input: PurchaseOrderInput, userId?: string | null) {
  return runInTx((tx) => createPurchaseOrderInTx(tx, input, userId));
}

/** Sama dengan createPurchaseOrder, di dalam transaksi pemanggil (atomik dengan klaim kekurangan). */
export async function createPurchaseOrderInTx(tx: Db, input: PurchaseOrderInput, userId?: string | null) {
  // Satu baris per bahan: baris ganda digabung (qty dijumlah, harga rata-rata tertimbang)
  // supaya penerimaan selalu jatuh ke baris yang tepat.
  const merged = new Map<string, { productId: string; orderedQty: number; value: number; uom: string | null; uomFactor: number | null; sourceRefs: string[] }>();
  for (const it of input.items) {
    if (!(it.orderedQty > 0)) continue;
    const cur = merged.get(it.productId) ?? { productId: it.productId, orderedQty: 0, value: 0, uom: it.uom ?? null, uomFactor: it.uomFactor ?? null, sourceRefs: [] };
    cur.orderedQty += it.orderedQty;
    // Asal kebutuhan tetap tercatat walau baris digabung (mis. MRQ Bar + MRQ Dapur).
    for (const ref of it.sourceRefs ?? []) if (!cur.sourceRefs.includes(ref)) cur.sourceRefs.push(ref);
    cur.value += it.orderedQty * Math.max(0, it.unitPrice);
    // Baris ganda beda kemasan → cetak pakai satuan dasar.
    if ((cur.uom ?? null) !== (it.uom ?? null)) {
      cur.uom = null;
      cur.uomFactor = null;
    }
    merged.set(it.productId, cur);
  }
  const items = [...merged.values()].map((m) => ({ productId: m.productId, orderedQty: m.orderedQty, unitPrice: m.value / m.orderedQty, uom: m.uom, uomFactor: m.uomFactor, sourceRefs: m.sourceRefs }));
  if (!items.length) throw new Error("PO butuh minimal 1 bahan.");
  {
    const [supplier] = await tx.select().from(wmsSupplier).where(eq(wmsSupplier.id, input.supplierId)).limit(1);
    if (!supplier || supplier.archivedAt) throw new Error("Supplier tidak ditemukan / diarsipkan.");
    const [po] = await tx
      .insert(wmsPurchaseOrder)
      .values({
        doc: makeWmsDoc("PO"),
        supplierId: supplier.id,
        supplierName: supplier.name,
        warehouseId: input.warehouseId ?? null,
        expectedDate: input.expectedDate || null,
        note: input.note?.trim() ?? "",
        deliveryNote: input.deliveryNote?.trim() ?? "",
        paymentTerms: input.paymentTerms?.trim() ?? "",
        showPrices: input.showPrices ?? true,
        createdBy: userId ?? null,
      })
      .returning();
    await tx.insert(wmsPurchaseOrderItem).values(
      items.map((it) => ({
        purchaseOrderId: po.id,
        productId: it.productId,
        orderedQty: round4(it.orderedQty),
        unitPrice: round4(Math.max(0, it.unitPrice)),
        uom: it.uom && it.uomFactor && it.uomFactor > 1 ? it.uom : null,
        uomFactor: it.uom && it.uomFactor && it.uomFactor > 1 ? round4(it.uomFactor) : null,
        sourceRefs: it.sourceRefs,
      })),
    );
    await writeWmsAudit(tx, { userId, action: "PO dibuat", object: po.doc, metadata: { supplier: supplier.name, items: items.length } });
    return po;
  }
}

export async function listPurchaseOrders(limit = 100) {
  const rows = await getDb()
    .select({
      po: wmsPurchaseOrder,
      warehouseName: wmsWarehouse.name,
      items: sql<number>`count(${wmsPurchaseOrderItem.id})::int`,
      total: sql<number>`coalesce(sum(${wmsPurchaseOrderItem.orderedQty} * ${wmsPurchaseOrderItem.unitPrice}), 0)`,
    })
    .from(wmsPurchaseOrder)
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsPurchaseOrder.warehouseId))
    .leftJoin(wmsPurchaseOrderItem, eq(wmsPurchaseOrderItem.purchaseOrderId, wmsPurchaseOrder.id))
    .groupBy(wmsPurchaseOrder.id, wmsWarehouse.name)
    .orderBy(desc(wmsPurchaseOrder.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.po, warehouseName: r.warehouseName, items: Number(r.items), total: Math.round(Number(r.total)) }));
}

export async function getPurchaseOrder(id: string) {
  const db = getDb();
  const [po] = await db.select().from(wmsPurchaseOrder).where(eq(wmsPurchaseOrder.id, id)).limit(1);
  if (!po) return null;
  const [supplier] = po.supplierId ? await db.select().from(wmsSupplier).where(eq(wmsSupplier.id, po.supplierId)).limit(1) : [];
  const items = await db
    .select({ item: wmsPurchaseOrderItem, name: wmsProduct.name, sku: wmsProduct.sku, unit: wmsProduct.unit })
    .from(wmsPurchaseOrderItem)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsPurchaseOrderItem.productId))
    .where(eq(wmsPurchaseOrderItem.purchaseOrderId, id))
    .orderBy(wmsProduct.name);
  const receivings = await db
    .select({ id: wmsReceiving.id, doc: wmsReceiving.doc, status: wmsReceiving.status, createdAt: wmsReceiving.createdAt })
    .from(wmsReceiving)
    .where(eq(wmsReceiving.purchaseOrderId, id))
    .orderBy(desc(wmsReceiving.createdAt));
  const uoms = await loadProductUoms(items.map((r) => r.item.productId).filter((id): id is string => !!id), db);
  return {
    ...po,
    supplierPhone: supplier?.phone ?? "",
    supplierPic: supplier?.picName ?? "",
    supplierAddress: supplier?.address ?? "",
    items: items.map((r) => ({
      uoms: r.item.productId ? (uoms.get(r.item.productId) ?? []) : [],
      uom: r.item.uom,
      uomFactor: r.item.uomFactor === null ? null : Number(r.item.uomFactor),
      id: r.item.id,
      productId: r.item.productId,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      orderedQty: Number(r.item.orderedQty),
      receivedQty: Number(r.item.receivedQty),
      remainingQty: Math.max(0, round4(Number(r.item.orderedQty) - Number(r.item.receivedQty))),
      unitPrice: Number(r.item.unitPrice),
      sourceRefs: r.item.sourceRefs ?? [],
    })),
    receivings,
  };
}

export async function setPurchaseOrderStatus(id: string, action: "send" | "cancel", userId?: string | null) {
  return runInTx(async (tx) => {
    const [po] = await tx.select().from(wmsPurchaseOrder).where(eq(wmsPurchaseOrder.id, id)).for("update").limit(1);
    if (!po) return null;
    if (action === "send") {
      // "Terkirim" hanya setelah PO disetujui (konfirmasi manual petugas bahwa PO sudah dikirim).
      if (po.status !== "approved" && po.status !== "wa_opened") throw new Error("PO harus disetujui dulu sebelum ditandai terkirim.");
      const [updated] = await tx
        .update(wmsPurchaseOrder)
        .set({ status: "sent", sentAt: new Date(), sentBy: userId ?? null, sentRevision: po.revision })
        .where(eq(wmsPurchaseOrder.id, id))
        .returning();
      await writeWmsAudit(tx, { userId, action: "PO dikirim ke supplier", object: po.doc, metadata: { revision: po.revision } });
      return updated;
    }
    if (po.status === "received" || po.status === "cancelled") throw new Error("PO sudah selesai / dibatalkan.");
    const [paid] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(wmsSupplierPayment)
      .where(and(eq(wmsSupplierPayment.purchaseOrderId, id), ne(wmsSupplierPayment.status, "void")));
    if (Number(paid?.n)) throw new Error("PO ini sudah punya DP/pembayaran. Batalkan pembayaran itu dulu (Owner).");
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(wmsReceiving)
      .where(and(eq(wmsReceiving.purchaseOrderId, id), inArray(wmsReceiving.status, ["draft", "pending_approval"])));
    if (Number(open?.n)) throw new Error("Masih ada penerimaan draft untuk PO ini — selesaikan / hapus dulu.");
    const [updated] = await tx.update(wmsPurchaseOrder).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(wmsPurchaseOrder.id, id)).returning();
    await writeWmsAudit(tx, { userId, action: "PO dibatalkan", object: po.doc, status: "warning" });
    return updated;
  });
}

/** Buat penerimaan draft dari sisa qty PO (harga PO sebagai harga beli awal). */
export async function createReceivingFromPurchaseOrder(id: string, userId?: string | null) {
  const po = await getPurchaseOrder(id);
  if (!po) return null;
  if (po.status === "cancelled" || po.status === "received") throw new Error("PO sudah selesai / dibatalkan.");
  if (po.status === "draft" || po.status === "pending_approval") throw new Error("PO belum disetujui — barang belum bisa diterima atas PO ini.");
  const items = po.items.filter((it) => it.productId && it.remainingQty > 0);
  if (!items.length) throw new Error("Semua bahan di PO ini sudah diterima.");
  return createReceiving(
    {
      supplier: po.supplierName,
      poNumber: po.doc,
      purchaseOrderId: po.id,
      warehouseId: po.warehouseId ?? undefined,
      items: items.map((it) => ({
        productId: it.productId as string,
        orderedQty: it.remainingQty,
        receivedQty: it.remainingQty,
        hpp: it.unitPrice,
        qc: "pass" as const,
      })),
    },
    userId,
  );
}

/**
 * Penerimaan selesai (+1) / dibatalkan (−1) → akumulasi qty diterima per baris PO dan
 * status partial/received. Dipanggil di transaksi penerimaan.
 */
export async function applyReceivingToPurchaseOrder(
  tx: Db,
  purchaseOrderId: string,
  lines: Array<{ productId: string; qty: number }>,
  sign: 1 | -1,
) {
  const [po] = await tx.select().from(wmsPurchaseOrder).where(eq(wmsPurchaseOrder.id, purchaseOrderId)).for("update").limit(1);
  if (!po || po.status === "cancelled") return;
  const items = await tx.select().from(wmsPurchaseOrderItem).where(eq(wmsPurchaseOrderItem.purchaseOrderId, purchaseOrderId));
  for (const line of lines) {
    const item = items.find((it) => it.productId === line.productId);
    if (!item) continue;
    const next = Math.max(0, round4(Number(item.receivedQty) + sign * line.qty));
    item.receivedQty = next;
    await tx.update(wmsPurchaseOrderItem).set({ receivedQty: next }).where(eq(wmsPurchaseOrderItem.id, item.id));
  }
  const anyReceived = items.some((it) => Number(it.receivedQty) > 0);
  const allReceived = items.every((it) => Number(it.receivedQty) >= Number(it.orderedQty) - 0.00005);
  // Semua penerimaan dibatalkan → kembali ke tahap pengiriman terakhir yang tercapai.
  const fallback: PoStatus = po.processingAt ? "processing" : po.confirmedAt ? "confirmed" : po.sentAt ? "sent" : po.waOpenedAt ? "wa_opened" : po.approvedAt ? "approved" : "draft";
  const status: PoStatus = allReceived ? "received" : anyReceived ? "partial" : fallback;
  await tx.update(wmsPurchaseOrder).set({ status }).where(eq(wmsPurchaseOrder.id, purchaseOrderId));
}

/** Riwayat harga beli per bahan per supplier (dari penerimaan selesai): terakhir & rata-rata. */
export async function getSupplierPriceHistory(productIds: string[], db: Db = getDb()) {
  if (!productIds.length) return [];
  const rows = await db
    .select({
      productId: wmsReceivingItem.productId,
      supplierId: wmsReceiving.supplierId,
      supplier: wmsReceiving.supplier,
      price: wmsReceivingItem.hpp,
      qty: wmsReceivingItem.receivedQty,
      at: wmsReceiving.completedAt,
    })
    .from(wmsReceivingItem)
    .innerJoin(wmsReceiving, eq(wmsReceiving.id, wmsReceivingItem.receivingId))
    .where(and(inArray(wmsReceivingItem.productId, productIds), eq(wmsReceiving.status, "completed"), sql`${wmsReceivingItem.qc} <> 'reject'`))
    .orderBy(desc(wmsReceiving.completedAt));
  const grouped = new Map<string, { productId: string; supplierId: string | null; supplier: string; lastPrice: number; lastAt: Date | null; totalQty: number; totalValue: number; count: number }>();
  for (const r of rows) {
    if (!r.productId) continue;
    const key = `${r.productId}|${r.supplierId ?? r.supplier.toLowerCase()}`;
    const g = grouped.get(key);
    const qty = Number(r.qty);
    if (!g) {
      grouped.set(key, { productId: r.productId, supplierId: r.supplierId, supplier: r.supplier, lastPrice: Number(r.price), lastAt: r.at, totalQty: qty, totalValue: qty * Number(r.price), count: 1 });
    } else {
      g.totalQty += qty;
      g.totalValue += qty * Number(r.price);
      g.count += 1;
    }
  }
  return [...grouped.values()].map((g) => ({
    productId: g.productId,
    supplierId: g.supplierId,
    supplier: g.supplier,
    lastPrice: g.lastPrice,
    lastAt: g.lastAt?.toISOString() ?? null,
    avgPrice: g.totalQty > 0 ? round4(g.totalValue / g.totalQty) : g.lastPrice,
    receipts: g.count,
  }));
}

// ---------------------------------------------------------------------------
// Aturan reorder per ruang
// ---------------------------------------------------------------------------

export async function listReorderRules() {
  const rows = await getDb()
    .select({ rule: wmsReorderRule, name: wmsProduct.name, sku: wmsProduct.sku, unit: wmsProduct.unit, warehouseName: wmsWarehouse.name })
    .from(wmsReorderRule)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsReorderRule.productId))
    .innerJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsReorderRule.warehouseId))
    .orderBy(wmsWarehouse.name, wmsProduct.name);
  return rows.map((r) => ({ ...r.rule, minQty: Number(r.rule.minQty), maxQty: Number(r.rule.maxQty), name: r.name, sku: r.sku, unit: r.unit, warehouseName: r.warehouseName }));
}

export async function upsertReorderRule(input: { productId: string; warehouseId: string; minQty: number; maxQty: number }) {
  if (!(input.minQty >= 0) || !(input.maxQty > 0) || input.maxQty < input.minQty) throw new Error("Maks harus > 0 dan ≥ min.");
  const [row] = await getDb()
    .insert(wmsReorderRule)
    .values({ productId: input.productId, warehouseId: input.warehouseId, minQty: round4(input.minQty), maxQty: round4(input.maxQty) })
    .onConflictDoUpdate({
      target: [wmsReorderRule.productId, wmsReorderRule.warehouseId],
      set: { minQty: round4(input.minQty), maxQty: round4(input.maxQty), updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function deleteReorderRule(id: string) {
  const [row] = await getDb().delete(wmsReorderRule).where(eq(wmsReorderRule.id, id)).returning();
  return row ?? null;
}

export type ReorderSuggestion = {
  ruleId: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  warehouseType: string;
  onHand: number;
  minQty: number;
  maxQty: number;
  needQty: number;
  /** Bisa dipenuhi dari gudang utama area (Internal Order / transfer). */
  transferQty: number;
  sourceWarehouseId: string | null;
  sourceWarehouseName: string | null;
  /** Sisa yang harus dibeli. */
  purchaseQty: number;
  supplierId: string | null;
  supplier: string | null;
  lastPrice: number | null;
};

/**
 * Saran reorder per ruang: stok ruang ≤ min → butuh (max − stok). Ruang outlet
 * (Bar/Dapur) diisi dulu dari gudang utama areanya (stok layak, belum direservasi
 * aturan lain), sisanya jadi saran beli ke supplier terakhir.
 */
export async function getReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const db = getDb();
  const rules = await db
    .select({
      rule: wmsReorderRule,
      name: wmsProduct.name,
      sku: wmsProduct.sku,
      unit: wmsProduct.unit,
      area: wmsCategory.area,
      warehouseName: wmsWarehouse.name,
      warehouseType: wmsWarehouse.type,
      warehouseArea: wmsWarehouse.area,
      onHand: sql<number>`coalesce((select s.qty from wms_warehouse_stock s where s.product_id = ${wmsReorderRule.productId} and s.warehouse_id = ${wmsReorderRule.warehouseId}), 0)`,
    })
    .from(wmsReorderRule)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsReorderRule.productId))
    .innerJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsReorderRule.warehouseId))
    .leftJoin(wmsCategory, eq(wmsCategory.name, wmsProduct.category))
    .where(sql`${wmsProduct.archivedAt} is null`);
  const due = rules.filter((r) => Number(r.onHand) <= Number(r.rule.minQty));
  if (!due.length) return [];
  const warehouses = await db.select().from(wmsWarehouse);
  const productIds = [...new Set(due.map((r) => r.rule.productId))];
  const mainStocks = await db
    .select({ productId: wmsWarehouseStock.productId, warehouseId: wmsWarehouseStock.warehouseId, qty: wmsWarehouseStock.qty })
    .from(wmsWarehouseStock)
    .where(inArray(wmsWarehouseStock.productId, productIds));
  const expired = await db
    .select({ productId: wmsBatch.productId, warehouseId: wmsBatch.warehouseId, qty: sql<number>`sum(${wmsBatch.qty})` })
    .from(wmsBatch)
    .where(and(inArray(wmsBatch.productId, productIds), sql`${wmsBatch.qty} > 0`, sql`${wmsBatch.expiredAt} < now()`))
    .groupBy(wmsBatch.productId, wmsBatch.warehouseId);
  const usable = new Map<string, number>();
  for (const s of mainStocks) usable.set(`${s.productId}|${s.warehouseId}`, Number(s.qty));
  for (const e of expired) {
    const key = `${e.productId}|${e.warehouseId}`;
    usable.set(key, (usable.get(key) ?? 0) - Number(e.qty));
  }
  const prices = await getSupplierPriceHistory(productIds);
  const preferred = new Map<string, (typeof prices)[number]>();
  for (const p of prices) {
    const cur = preferred.get(p.productId);
    if (!cur || (p.lastAt ?? "") > (cur.lastAt ?? "")) preferred.set(p.productId, p);
  }
  const allocated = new Map<string, number>();
  return due
    .map((r) => {
      const onHand = Number(r.onHand);
      const needQty = round4(Math.max(0, Number(r.rule.maxQty) - onHand));
      let transferQty = 0;
      let source: (typeof warehouses)[number] | undefined;
      if (r.warehouseType !== "main") {
        const area = r.warehouseArea !== "umum" ? r.warehouseArea : (r.area ?? "umum");
        source = warehouses.find((w) => w.type === "main" && w.area === area) ?? warehouses.find((w) => w.type === "main" && w.isPrimary);
        if (source) {
          const key = `${r.rule.productId}|${source.id}`;
          const avail = Math.max(0, (usable.get(key) ?? 0) - (allocated.get(key) ?? 0));
          transferQty = round4(Math.min(avail, needQty));
          allocated.set(key, (allocated.get(key) ?? 0) + transferQty);
        }
      }
      const price = preferred.get(r.rule.productId);
      return {
        ruleId: r.rule.id,
        productId: r.rule.productId,
        name: r.name,
        sku: r.sku,
        unit: r.unit,
        warehouseId: r.rule.warehouseId,
        warehouseName: r.warehouseName,
        warehouseType: r.warehouseType,
        onHand,
        minQty: Number(r.rule.minQty),
        maxQty: Number(r.rule.maxQty),
        needQty,
        transferQty,
        sourceWarehouseId: transferQty > 0 ? (source?.id ?? null) : null,
        sourceWarehouseName: transferQty > 0 ? (source?.name ?? null) : null,
        purchaseQty: round4(needQty - transferQty),
        supplierId: price?.supplierId ?? null,
        supplier: price?.supplier ?? null,
        lastPrice: price?.lastPrice ?? null,
      };
    })
    .filter((s) => s.needQty > 0)
    .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, "id") || a.name.localeCompare(b.name, "id"));
}

/** Saran beli → PO draft per supplier (bahan tanpa riwayat supplier dilewati & dilaporkan). */
export async function createPurchaseOrdersFromSuggestions(userId?: string | null) {
  const suggestions = (await getReorderSuggestions()).filter((s) => s.purchaseQty > 0);
  const bySupplier = new Map<string, Map<string, { qty: number; price: number }>>();
  const skipped: string[] = [];
  for (const s of suggestions) {
    if (!s.supplierId) {
      skipped.push(s.name);
      continue;
    }
    const lines = bySupplier.get(s.supplierId) ?? new Map<string, { qty: number; price: number }>();
    const cur = lines.get(s.productId);
    lines.set(s.productId, { qty: round4((cur?.qty ?? 0) + s.purchaseQty), price: s.lastPrice ?? 0 });
    bySupplier.set(s.supplierId, lines);
  }
  const created = [];
  for (const [supplierId, lines] of bySupplier) {
    created.push(
      await createPurchaseOrder(
        { supplierId, note: "Dari saran reorder per ruang", items: [...lines].map(([productId, l]) => ({ productId, orderedQty: l.qty, unitPrice: l.price })) },
        userId,
      ),
    );
  }
  return { created, skipped: [...new Set(skipped)] };
}

// ---------------------------------------------------------------------------
// Surat jalan / pick list (transfer & internal order)
// ---------------------------------------------------------------------------

/** Baris dokumen pindah stok (TRF/IO) per batch: bahan, qty, no. batch, expired, ruang asal/tujuan. */
export async function getStockDocumentLines(refDoc: string) {
  const rows = await getDb()
    .select({
      type: wmsStockMovement.type,
      qty: wmsStockMovement.qty,
      productName: wmsProduct.name,
      sku: wmsProduct.sku,
      unit: wmsProduct.unit,
      warehouseName: wmsWarehouse.name,
      batchNo: wmsBatch.batchNo,
      expiredAt: wmsBatch.expiredAt,
      location: wmsBatch.location,
      createdAt: wmsStockMovement.createdAt,
      productId: wmsStockMovement.productId,
    })
    .from(wmsStockMovement)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsStockMovement.productId))
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockMovement.warehouseId))
    .leftJoin(wmsBatch, eq(wmsBatch.id, wmsStockMovement.batchId))
    .where(eq(wmsStockMovement.refDoc, refDoc))
    .orderBy(wmsProduct.name);
  const uoms = await loadProductUoms(rows.map((r) => r.productId).filter((id): id is string => !!id));
  const from = rows.find((r) => Number(r.qty) < 0)?.warehouseName ?? null;
  const to = rows.find((r) => Number(r.qty) > 0)?.warehouseName ?? null;
  return {
    doc: refDoc,
    from,
    to,
    createdAt: rows[0]?.createdAt?.toISOString() ?? null,
    // Baris masuk = satu per batch tujuan (no. batch & expired ikut dari sumber).
    lines: rows
      .filter((r) => Number(r.qty) > 0)
      .map((r) => ({
        name: r.productName ?? "-",
        sku: r.sku ?? "",
        uoms: r.productId ? (uoms.get(r.productId) ?? []) : [],
        unit: r.unit ?? "",
        qty: Number(r.qty),
        batchNo: r.batchNo ?? "",
        expiredAt: r.expiredAt?.toISOString() ?? null,
        location: r.location ?? "",
      })),
  };
}
