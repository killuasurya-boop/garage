import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  supplierInvoices,
  user,
  wmsBatch,
  wmsCategory,
  wmsProduct,
  wmsSupplier,
  wmsWarehouse,
  wmsWarehouseStock,
} from "@/db/schema";
import { completeReceiving, createReceiving, recordStockMovement, runInTx } from "@/lib/wms-service";

// =============================================================================
// Pengadaan gudang (owner, Okt 2026):
//   Permintaan Belanja (Bar/Dapur) → disetujui Owner/Manajer → Purchase Order →
//   penerimaan barang (parsial/penuh) → hutang supplier (tempo) / lunas (cash).
// Permintaan & PO TIDAK mengubah stok; stok hanya bertambah saat penerimaan
// diselesaikan (recordStockMovement di completeReceiving).
// =============================================================================

type Db = ReturnType<typeof getDb>;
export type ProcurementActor = { id: string; name: string; role: string };
export type ProcurementArea = "bar" | "dapur" | "umum";

export class ProcurementError extends Error {}

const OPEN_REQUEST = ["submitted", "approved"];
const OPEN_PO = ["approved", "sent", "partial"];

function makeDoc(prefix: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

const nowTime = () => new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date());

async function audit(tx: Db, actor: ProcurementActor, action: string, object: string, metadata: Record<string, unknown>, status = "recorded") {
  await tx.insert(auditLogs).values({
    time: nowTime(),
    actor: actor.name,
    action,
    object,
    device: "WMS",
    status,
    metadata: { ...metadata, userId: actor.id },
  });
}

/**
 * Posisi stok per bahan untuk satu area: stok yang dapat dipakai (tanpa batch
 * kedaluwarsa), barang dalam perjalanan (PO terbuka), dan permintaan terbuka.
 */
export async function stockPositions(productIds: string[], area: ProcurementArea, db: Db = getDb()) {
  const result = new Map<string, { usable: number; expired: number; incoming: number; requested: number }>();
  if (!productIds.length) return result;
  for (const id of productIds) result.set(id, { usable: 0, expired: 0, incoming: 0, requested: 0 });

  const rooms = await db.select({ id: wmsWarehouse.id, area: wmsWarehouse.area }).from(wmsWarehouse);
  const roomIds = rooms.filter((r) => area === "umum" || r.area === area).map((r) => r.id);
  if (roomIds.length) {
    const stock = await db
      .select({ productId: wmsWarehouseStock.productId, qty: sql<number>`coalesce(sum(${wmsWarehouseStock.qty}), 0)` })
      .from(wmsWarehouseStock)
      .where(and(inArray(wmsWarehouseStock.productId, productIds), inArray(wmsWarehouseStock.warehouseId, roomIds)))
      .groupBy(wmsWarehouseStock.productId);
    for (const s of stock) result.get(s.productId)!.usable = Number(s.qty);
    const expired = await db
      .select({ productId: wmsBatch.productId, qty: sql<number>`coalesce(sum(${wmsBatch.qty}), 0)` })
      .from(wmsBatch)
      .where(
        and(
          inArray(wmsBatch.productId, productIds),
          inArray(wmsBatch.warehouseId, roomIds),
          lt(wmsBatch.expiredAt, new Date()),
          sql`${wmsBatch.qty} > 0`,
        ),
      )
      .groupBy(wmsBatch.productId);
    for (const e of expired) {
      const pos = result.get(e.productId)!;
      pos.expired = Number(e.qty);
      pos.usable = Math.max(0, pos.usable - Number(e.qty));
    }
  }
  const incoming = await db
    .select({
      productId: purchaseOrderItems.productId,
      qty: sql<number>`coalesce(sum(greatest(${purchaseOrderItems.qty} - ${purchaseOrderItems.receivedQty}, 0)), 0)`,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
    .where(and(inArray(purchaseOrderItems.productId, productIds), inArray(purchaseOrders.status, OPEN_PO)))
    .groupBy(purchaseOrderItems.productId);
  for (const i of incoming) result.get(i.productId)!.incoming = Number(i.qty);
  const requested = await db
    .select({ productId: purchaseRequestItems.productId, qty: sql<number>`coalesce(sum(coalesce(${purchaseRequestItems.approvedQty}, ${purchaseRequestItems.qty})), 0)` })
    .from(purchaseRequestItems)
    .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseRequestItems.requestId))
    .where(and(inArray(purchaseRequestItems.productId, productIds), inArray(purchaseRequests.status, OPEN_REQUEST), eq(purchaseRequests.area, area)))
    .groupBy(purchaseRequestItems.productId);
  for (const r of requested) result.get(r.productId)!.requested = Number(r.qty);
  return result;
}

// ---------------------------------------------------------------------------
// Permintaan Belanja
// ---------------------------------------------------------------------------

export type RequestItemInput = { productId: string; qty: number; note?: string };

export async function createPurchaseRequest(
  input: { area: ProcurementArea; priority?: "normal" | "urgent"; note?: string; items: RequestItemInput[] },
  actor: ProcurementActor,
) {
  const items = input.items.filter((i) => Number(i.qty) > 0);
  if (!items.length) throw new ProcurementError("Isi minimal 1 bahan dengan jumlah > 0.");
  const ids = [...new Set(items.map((i) => i.productId))];
  if (ids.length !== items.length) throw new ProcurementError("Bahan yang sama tercantum dua kali — gabungkan jumlahnya.");
  return runInTx(async (tx) => {
    // Kunci per area: dua permintaan bersamaan tidak lolos cek duplikat berdua.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`purchase-request:${input.area}`}))`);
    const products = await tx.select().from(wmsProduct).where(inArray(wmsProduct.id, ids));
    if (products.length !== ids.length) throw new ProcurementError("Ada bahan yang tidak ditemukan.");
    const dupes = await tx
      .select({ doc: purchaseRequests.doc, productId: purchaseRequestItems.productId })
      .from(purchaseRequestItems)
      .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseRequestItems.requestId))
      .where(and(inArray(purchaseRequestItems.productId, ids), inArray(purchaseRequests.status, OPEN_REQUEST), eq(purchaseRequests.area, input.area)));
    if (dupes.length) {
      const names = dupes.map((d) => `${products.find((p) => p.id === d.productId)?.name ?? "bahan"} (${d.doc})`);
      throw new ProcurementError(`Masih ada permintaan terbuka untuk: ${names.join(", ")}. Ubah permintaan itu, jangan dobel.`);
    }
    const positions = await stockPositions(ids, input.area, tx);
    const [request] = await tx
      .insert(purchaseRequests)
      .values({
        doc: makeDoc("PR"),
        area: input.area,
        priority: input.priority ?? "normal",
        note: input.note?.trim() ?? "",
        status: "submitted",
        requestedBy: actor.id,
      })
      .returning();
    await tx.insert(purchaseRequestItems).values(
      items.map((i) => {
        const prod = products.find((p) => p.id === i.productId)!;
        const pos = positions.get(i.productId)!;
        return {
          requestId: request.id,
          productId: i.productId,
          qty: Number(i.qty),
          usableAtRequest: pos.usable,
          incomingAtRequest: pos.incoming,
          refUnitCost: Number(prod.hpp),
          note: i.note?.trim() ?? "",
        };
      }),
    );
    await audit(tx, actor, "Permintaan belanja diajukan", request.doc, { requestId: request.id, area: input.area, items: items.length });
    return request;
  });
}

export async function listPurchaseRequests(filter?: { status?: string[]; area?: ProcurementArea }) {
  const db = getDb();
  const conds = [];
  if (filter?.status?.length) conds.push(inArray(purchaseRequests.status, filter.status));
  if (filter?.area) conds.push(eq(purchaseRequests.area, filter.area));
  const requests = await db
    .select({ r: purchaseRequests, requester: user.name })
    .from(purchaseRequests)
    .leftJoin(user, eq(user.id, purchaseRequests.requestedBy))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(purchaseRequests.createdAt))
    .limit(200);
  if (!requests.length) return [];
  const items = await db
    .select({ i: purchaseRequestItems, name: wmsProduct.name, sku: wmsProduct.sku, unit: wmsProduct.unit, hpp: wmsProduct.hpp })
    .from(purchaseRequestItems)
    .innerJoin(wmsProduct, eq(wmsProduct.id, purchaseRequestItems.productId))
    .where(inArray(purchaseRequestItems.requestId, requests.map((r) => r.r.id)));
  return requests.map(({ r, requester }) => {
    const lines = items
      .filter((x) => x.i.requestId === r.id)
      .map((x) => {
        const qty = Number(x.i.approvedQty ?? x.i.qty);
        const netNeed = Math.max(0, Number(x.i.qty) - Number(x.i.usableAtRequest) - Number(x.i.incomingAtRequest));
        return {
          id: x.i.id,
          productId: x.i.productId,
          name: x.name,
          sku: x.sku,
          unit: x.unit,
          qty: Number(x.i.qty),
          approvedQty: x.i.approvedQty === null ? null : Number(x.i.approvedQty),
          usableAtRequest: Number(x.i.usableAtRequest),
          incomingAtRequest: Number(x.i.incomingAtRequest),
          netNeed,
          refUnitCost: Number(x.i.refUnitCost),
          estimate: Math.round(qty * Number(x.i.refUnitCost)),
          note: x.i.note,
        };
      });
    return {
      id: r.id,
      doc: r.doc,
      area: r.area,
      status: r.status,
      priority: r.priority,
      note: r.note,
      requestedBy: r.requestedBy,
      requesterName: requester ?? "-",
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      estimate: lines.reduce((sum, l) => sum + l.estimate, 0),
      items: lines,
    };
  });
}

/** Owner/Manajer: setujui (opsional ubah qty), minta revisi, atau tolak. */
export async function decidePurchaseRequest(
  id: string,
  input: { action: "approve" | "revise" | "reject"; note?: string; items?: Array<{ itemId: string; approvedQty: number }> },
  actor: ProcurementActor,
) {
  const note = input.note?.trim() ?? "";
  if (input.action !== "approve" && note.length < 3) throw new ProcurementError("Alasan wajib diisi untuk revisi/penolakan.");
  return runInTx(async (tx) => {
    const [request] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).for("update").limit(1);
    if (!request) throw new ProcurementError("Permintaan tidak ditemukan.");
    if (request.status !== "submitted") throw new ProcurementError(`Permintaan berstatus ${request.status}, tidak bisa diputuskan.`);
    if (request.requestedBy === actor.id && actor.role !== "Owner") {
      throw new ProcurementError("Permintaan sendiri harus disetujui orang lain (Owner/Manajer lain).");
    }
    if (input.action === "approve") {
      for (const it of input.items ?? []) {
        if (!(Number(it.approvedQty) >= 0)) throw new ProcurementError("Jumlah disetujui tidak valid.");
        await tx
          .update(purchaseRequestItems)
          .set({ approvedQty: Number(it.approvedQty) })
          .where(and(eq(purchaseRequestItems.id, it.itemId), eq(purchaseRequestItems.requestId, id)));
      }
      await tx
        .update(purchaseRequestItems)
        .set({ approvedQty: sql`${purchaseRequestItems.qty}` })
        .where(and(eq(purchaseRequestItems.requestId, id), sql`${purchaseRequestItems.approvedQty} is null`));
    }
    const status = input.action === "approve" ? "approved" : input.action === "revise" ? "revised" : "rejected";
    const [updated] = await tx
      .update(purchaseRequests)
      .set({ status, decidedBy: actor.id, decidedAt: new Date(), decisionNote: note, updatedAt: new Date() })
      .where(eq(purchaseRequests.id, id))
      .returning();
    await audit(tx, actor, `Permintaan belanja ${status === "approved" ? "disetujui" : status === "revised" ? "diminta revisi" : "ditolak"}`, request.doc, { requestId: id, note }, status === "approved" ? "recorded" : "warning");
    return updated;
  });
}

/** Pengaju/Owner/Manajer membatalkan permintaan yang belum dipesan. */
export async function cancelPurchaseRequest(id: string, reason: string, actor: ProcurementActor) {
  if (reason.trim().length < 3) throw new ProcurementError("Alasan pembatalan wajib diisi.");
  return runInTx(async (tx) => {
    const [request] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).for("update").limit(1);
    if (!request) throw new ProcurementError("Permintaan tidak ditemukan.");
    const elevated = actor.role === "Owner" || actor.role === "Manajer";
    if (!elevated && request.requestedBy !== actor.id) throw new ProcurementError("Hanya pengaju atau Owner/Manajer yang bisa membatalkan.");
    if (!["submitted", "revised", "approved"].includes(request.status)) throw new ProcurementError(`Permintaan berstatus ${request.status} tidak bisa dibatalkan.`);
    const [updated] = await tx
      .update(purchaseRequests)
      .set({ status: "cancelled", decisionNote: reason.trim(), updatedAt: new Date() })
      .where(eq(purchaseRequests.id, id))
      .returning();
    await audit(tx, actor, "Permintaan belanja dibatalkan", request.doc, { requestId: id, reason: reason.trim() }, "warning");
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Purchase Order
// ---------------------------------------------------------------------------

export type PoItemInput = { productId: string; qty: number; unitCost: number; requestItemId?: string | null };

export async function createPurchaseOrder(
  input: {
    supplierId?: string | null;
    supplierName?: string;
    area?: ProcurementArea;
    paymentTerm?: "cash" | "tempo";
    dueDays?: number;
    expectedDate?: string | null;
    note?: string;
    items: PoItemInput[];
  },
  actor: ProcurementActor,
) {
  const items = input.items.filter((i) => Number(i.qty) > 0);
  if (!items.length) throw new ProcurementError("Isi minimal 1 bahan.");
  if (items.some((i) => !(Number(i.unitCost) >= 0))) throw new ProcurementError("Harga per satuan tidak valid.");
  if (input.paymentTerm === "tempo" && !(Number(input.dueDays) > 0)) throw new ProcurementError("Termin tempo wajib mengisi jumlah hari jatuh tempo.");
  return runInTx(async (tx) => {
    let supplierName = input.supplierName?.trim() ?? "";
    if (input.supplierId) {
      const [sup] = await tx.select().from(wmsSupplier).where(eq(wmsSupplier.id, input.supplierId)).limit(1);
      if (!sup) throw new ProcurementError("Supplier tidak ditemukan.");
      supplierName = sup.name;
    }
    if (!supplierName) throw new ProcurementError("Pilih supplier.");
    const requestItemIds = items.map((i) => i.requestItemId).filter((x): x is string => Boolean(x));
    let requestIds: string[] = [];
    if (requestItemIds.length) {
      const linked = await tx
        .select({ requestId: purchaseRequestItems.requestId, status: purchaseRequests.status, doc: purchaseRequests.doc })
        .from(purchaseRequestItems)
        .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseRequestItems.requestId))
        .where(inArray(purchaseRequestItems.id, requestItemIds))
        .for("update");
      const notApproved = linked.filter((l) => l.status !== "approved");
      if (notApproved.length) throw new ProcurementError(`Permintaan ${notApproved.map((l) => l.doc).join(", ")} belum disetujui / sudah dipesan.`);
      requestIds = [...new Set(linked.map((l) => l.requestId))];
    }
    const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unitCost), 0);
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        doc: makeDoc("PO"),
        supplierId: input.supplierId ?? null,
        supplierName,
        area: input.area ?? "umum",
        status: "draft",
        paymentTerm: input.paymentTerm ?? "cash",
        dueDays: input.paymentTerm === "tempo" ? Math.round(Number(input.dueDays)) : 0,
        expectedDate: input.expectedDate || null,
        note: input.note?.trim() ?? "",
        totalEstimate: Math.round(total),
        createdBy: actor.id,
      })
      .returning();
    await tx.insert(purchaseOrderItems).values(
      items.map((i) => ({ poId: po.id, productId: i.productId, qty: Number(i.qty), unitCost: Number(i.unitCost), requestItemId: i.requestItemId ?? null })),
    );
    if (requestIds.length) {
      await tx.update(purchaseRequests).set({ status: "ordered", updatedAt: new Date() }).where(inArray(purchaseRequests.id, requestIds));
    }
    await audit(tx, actor, "PO dibuat", po.doc, { poId: po.id, supplier: supplierName, total: Math.round(total), requests: requestIds.length });
    return po;
  });
}

async function setPoStatus(id: string, from: string[], to: string, actor: ProcurementActor, extra: Partial<typeof purchaseOrders.$inferInsert>, action: string) {
  return runInTx(async (tx) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update").limit(1);
    if (!po) throw new ProcurementError("PO tidak ditemukan.");
    if (!from.includes(po.status)) throw new ProcurementError(`PO berstatus ${po.status}, aksi tidak bisa dilakukan.`);
    const [updated] = await tx.update(purchaseOrders).set({ status: to, updatedAt: new Date(), ...extra }).where(eq(purchaseOrders.id, id)).returning();
    await audit(tx, actor, action, po.doc, { poId: id, from: po.status, to, ...(extra.cancelReason ? { reason: extra.cancelReason } : {}) }, to === "cancelled" ? "warning" : "recorded");
    return { po, updated };
  });
}

export async function approvePurchaseOrder(id: string, actor: ProcurementActor) {
  const { updated } = await setPoStatus(id, ["draft"], "approved", actor, { approvedBy: actor.id, approvedAt: new Date() }, "PO disetujui");
  return updated;
}

export async function markPurchaseOrderSent(id: string, actor: ProcurementActor) {
  const { updated } = await setPoStatus(id, ["approved"], "sent", actor, { sentAt: new Date() }, "PO dikirim ke supplier");
  return updated;
}

/** Batalkan PO yang belum ada barang diterima; permintaan terkait kembali "approved". */
export async function cancelPurchaseOrder(id: string, reason: string, actor: ProcurementActor) {
  if (reason.trim().length < 3) throw new ProcurementError("Alasan pembatalan wajib diisi.");
  return runInTx(async (tx) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update").limit(1);
    if (!po) throw new ProcurementError("PO tidak ditemukan.");
    if (!["draft", "approved", "sent"].includes(po.status)) throw new ProcurementError(`PO berstatus ${po.status} tidak bisa dibatalkan — tutup PO bila sisa barang tidak datang.`);
    const lines = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
    if (lines.some((l) => Number(l.receivedQty) > 0)) throw new ProcurementError("Sebagian barang sudah diterima; gunakan Tutup PO.");
    await reopenRequests(tx, lines.map((l) => l.requestItemId));
    const [updated] = await tx
      .update(purchaseOrders)
      .set({ status: "cancelled", cancelReason: reason.trim(), closedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    await audit(tx, actor, "PO dibatalkan", po.doc, { poId: id, reason: reason.trim() }, "warning");
    return updated;
  });
}

/** Tutup PO parsial: sisa barang tidak akan datang. */
export async function closePurchaseOrder(id: string, reason: string, actor: ProcurementActor) {
  if (reason.trim().length < 3) throw new ProcurementError("Alasan penutupan wajib diisi.");
  return runInTx(async (tx) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update").limit(1);
    if (!po) throw new ProcurementError("PO tidak ditemukan.");
    if (po.status !== "partial") throw new ProcurementError("Hanya PO yang sudah diterima sebagian yang bisa ditutup.");
    const lines = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
    await markRequestsFulfilled(tx, lines.map((l) => l.requestItemId));
    const [updated] = await tx
      .update(purchaseOrders)
      .set({ status: "closed", cancelReason: reason.trim(), closedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    await audit(tx, actor, "PO ditutup (sisa tidak datang)", po.doc, { poId: id, reason: reason.trim() }, "warning");
    return updated;
  });
}

async function requestIdsOf(tx: Db, requestItemIds: Array<string | null>) {
  const ids = requestItemIds.filter((x): x is string => Boolean(x));
  if (!ids.length) return [];
  const rows = await tx.select({ requestId: purchaseRequestItems.requestId }).from(purchaseRequestItems).where(inArray(purchaseRequestItems.id, ids));
  return [...new Set(rows.map((r) => r.requestId))];
}

async function reopenRequests(tx: Db, requestItemIds: Array<string | null>) {
  const ids = await requestIdsOf(tx, requestItemIds);
  if (ids.length) await tx.update(purchaseRequests).set({ status: "approved", updatedAt: new Date() }).where(inArray(purchaseRequests.id, ids));
}

async function markRequestsFulfilled(tx: Db, requestItemIds: Array<string | null>) {
  const ids = await requestIdsOf(tx, requestItemIds);
  if (ids.length) await tx.update(purchaseRequests).set({ status: "fulfilled", updatedAt: new Date() }).where(inArray(purchaseRequests.id, ids));
}

/**
 * Dipanggil dari completeReceiving/cancelReceiving (dalam transaksi yang sama):
 * tambah/kurangi qty diterima per baris PO lalu hitung ulang status PO.
 */
export async function applyReceivingToPo(tx: Db, poId: string, lines: Array<{ poItemId: string | null; qty: number }>) {
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).for("update").limit(1);
  if (!po) return;
  for (const line of lines) {
    if (!line.poItemId || !line.qty) continue;
    await tx
      .update(purchaseOrderItems)
      .set({ receivedQty: sql`greatest(${purchaseOrderItems.receivedQty} + ${line.qty}, 0)` })
      .where(and(eq(purchaseOrderItems.id, line.poItemId), eq(purchaseOrderItems.poId, poId)));
  }
  const items = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
  const anyReceived = items.some((i) => Number(i.receivedQty) > 0);
  const allReceived = items.every((i) => Number(i.receivedQty) >= Number(i.qty) - 0.0001);
  const status = allReceived ? "received" : anyReceived ? "partial" : po.sentAt ? "sent" : "approved";
  await tx
    .update(purchaseOrders)
    .set({ status, closedAt: allReceived ? new Date() : null, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, poId));
  if (allReceived) await markRequestsFulfilled(tx, items.map((i) => i.requestItemId));
  else await tx
    .update(purchaseRequests)
    .set({ status: "ordered", updatedAt: new Date() })
    .where(and(inArray(purchaseRequests.id, await requestIdsOf(tx, items.map((i) => i.requestItemId))), eq(purchaseRequests.status, "fulfilled")));
}

export async function listPurchaseOrders(filter?: { status?: string[] }) {
  const db = getDb();
  const pos = await db
    .select()
    .from(purchaseOrders)
    .where(filter?.status?.length ? inArray(purchaseOrders.status, filter.status) : undefined)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(200);
  if (!pos.length) return [];
  const items = await db
    .select({ i: purchaseOrderItems, name: wmsProduct.name, sku: wmsProduct.sku, unit: wmsProduct.unit })
    .from(purchaseOrderItems)
    .innerJoin(wmsProduct, eq(wmsProduct.id, purchaseOrderItems.productId))
    .where(inArray(purchaseOrderItems.poId, pos.map((p) => p.id)));
  const invoices = await db
    .select({ poId: supplierInvoices.poId, invoiceNo: supplierInvoices.invoiceNo, amount: supplierInvoices.amount, paidAmount: supplierInvoices.paidAmount, status: supplierInvoices.status, dueDate: supplierInvoices.dueDate })
    .from(supplierInvoices)
    .where(inArray(supplierInvoices.poId, pos.map((p) => p.id)));
  return pos.map((po) => {
    const lines = items
      .filter((x) => x.i.poId === po.id)
      .map((x) => ({
        id: x.i.id,
        productId: x.i.productId,
        name: x.name,
        sku: x.sku,
        unit: x.unit,
        qty: Number(x.i.qty),
        unitCost: Number(x.i.unitCost),
        receivedQty: Number(x.i.receivedQty),
        outstanding: Math.max(0, Number(x.i.qty) - Number(x.i.receivedQty)),
        requestItemId: x.i.requestItemId,
      }));
    return {
      id: po.id,
      doc: po.doc,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      area: po.area,
      status: po.status,
      paymentTerm: po.paymentTerm,
      dueDays: po.dueDays,
      expectedDate: po.expectedDate ? String(po.expectedDate) : null,
      note: po.note,
      totalEstimate: po.totalEstimate,
      createdAt: po.createdAt.toISOString(),
      cancelReason: po.cancelReason,
      items: lines,
      invoices: invoices
        .filter((i) => i.poId === po.id)
        .map((i) => ({ ...i, dueDate: i.dueDate.toISOString() })),
    };
  });
}

/**
 * Terima barang dari PO (parsial/penuh): buat dokumen penerimaan WMS terkait PO
 * lalu selesaikan (stok + HPP + belanja/hutang). Selisih lebih >10% dari sisa
 * PO butuh konfirmasi (`confirmDiscrepancy`).
 */
export async function receivePurchaseOrder(
  id: string,
  input: {
    warehouseId?: string | null;
    receivedDate?: string | null;
    invoiceNo?: string;
    additionalCost?: number;
    paymentMethod?: "Cash" | "Transfer" | "QRIS";
    confirmDiscrepancy?: boolean;
    items: Array<{ poItemId: string; receivedQty: number; unitCost?: number; qc?: "pass" | "reject"; batchNo?: string; expiredAt?: string | null; note?: string }>;
  },
  actor: ProcurementActor,
) {
  const db = getDb();
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po) throw new ProcurementError("PO tidak ditemukan.");
  if (!OPEN_PO.includes(po.status)) throw new ProcurementError(`PO berstatus ${po.status} — setujui PO dulu sebelum menerima barang.`);
  const lines = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
  const chosen = input.items.filter((i) => Number(i.receivedQty) > 0);
  if (!chosen.length) throw new ProcurementError("Isi jumlah barang yang diterima.");
  const receivedDate = input.receivedDate || null;
  let dueDate: string | null = null;
  if (po.paymentTerm === "tempo") {
    const base = receivedDate ? new Date(`${receivedDate}T05:00:00.000Z`) : new Date();
    base.setUTCDate(base.getUTCDate() + Number(po.dueDays || 0));
    dueDate = base.toISOString().slice(0, 10);
  }
  const rec = await createReceiving(
    {
      supplier: po.supplierName,
      poNumber: po.doc,
      poId: po.id,
      paymentTerm: po.paymentTerm === "tempo" ? "tempo" : "cash",
      invoiceNo: input.invoiceNo ?? "",
      dueDate,
      additionalCost: input.additionalCost ?? 0,
      warehouseId: input.warehouseId ?? undefined,
      paymentMethod: input.paymentMethod ?? "Cash",
      receivedDate,
      items: chosen.map((i) => {
        const line = lines.find((l) => l.id === i.poItemId);
        if (!line) throw new ProcurementError("Baris PO tidak ditemukan.");
        const outstanding = Math.max(0, Number(line.qty) - Number(line.receivedQty));
        const received = Number(i.receivedQty);
        return {
          productId: line.productId,
          // Parsial (kurang dari sisa) bukan selisih — sisanya tetap ditunggu di PO.
          orderedQty: Math.min(outstanding, received) || received,
          receivedQty: received,
          hpp: i.unitCost !== undefined ? Number(i.unitCost) : Number(line.unitCost),
          qc: i.qc ?? "pass",
          batchNo: i.batchNo,
          expiredAt: i.expiredAt ?? null,
          discrepancyNote: i.note ?? "",
          poItemId: line.id,
        };
      }),
    },
    actor.id,
  );
  const completed = await completeReceiving(rec.id, actor.id, { forceApprove: input.confirmDiscrepancy === true, actorName: actor.name });
  return { receivingId: rec.id, doc: rec.doc, status: completed?.status ?? "draft" };
}

// ---------------------------------------------------------------------------
// Hutang supplier (tempo)
// ---------------------------------------------------------------------------

export async function listSupplierPayables(filter?: { includePaid?: boolean }) {
  const db = getDb();
  const rows = await db
    .select()
    .from(supplierInvoices)
    .where(filter?.includePaid ? undefined : inArray(supplierInvoices.status, ["unpaid", "partial"]))
    .orderBy(supplierInvoices.dueDate)
    .limit(300);
  const today = new Date();
  return rows.map((r) => {
    const outstanding = Math.max(0, r.amount - Number(r.paidAmount ?? 0));
    const daysToDue = Math.ceil((r.dueDate.getTime() - today.getTime()) / 86_400_000);
    return {
      id: r.id,
      invoiceNo: r.invoiceNo,
      description: r.description,
      category: r.category,
      amount: r.amount,
      paidAmount: Number(r.paidAmount ?? 0),
      outstanding,
      status: r.status,
      dueDate: r.dueDate.toISOString(),
      daysToDue,
      overdue: outstanding > 0 && daysToDue < 0,
      receivingId: r.receivingId,
      poId: r.poId,
    };
  });
}

// ---------------------------------------------------------------------------
// Waste / rusak / kedaluwarsa
// ---------------------------------------------------------------------------

export const WASTE_KINDS = ["rusak", "kedaluwarsa", "tumpah", "salah_produksi", "lainnya"] as const;

export async function recordWaste(
  input: { productId: string; warehouseId: string; qty: number; kind: (typeof WASTE_KINDS)[number]; reason: string },
  actor: ProcurementActor,
) {
  const qty = Number(input.qty);
  if (!(qty > 0)) throw new ProcurementError("Jumlah waste harus lebih dari 0.");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new ProcurementError("Alasan waste wajib diisi.");
  return runInTx(async (tx) => {
    const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, input.productId)).limit(1);
    if (!prod) throw new ProcurementError("Bahan tidak ditemukan.");
    const [room] = await tx.select().from(wmsWarehouse).where(eq(wmsWarehouse.id, input.warehouseId)).limit(1);
    if (!room) throw new ProcurementError("Ruang tidak ditemukan.");
    const doc = makeDoc("WST");
    // Stok tidak boleh minus untuk waste (recordStockMovement menolak).
    const { cost } = await recordStockMovement(tx, {
      type: "waste",
      productId: input.productId,
      warehouseId: input.warehouseId,
      deltaQty: -qty,
      hpp: Number(prod.hpp),
      refDoc: `${doc} · ${input.kind} · ${reason}`,
      userId: actor.id,
    });
    await audit(tx, actor, "Waste bahan dicatat", doc, { productId: input.productId, sku: prod.sku, warehouseId: input.warehouseId, qty, kind: input.kind, reason, value: Math.round(cost) }, "warning");
    return { doc, value: Math.round(cost) };
  });
}

/** Area ruang (bar/dapur/umum) — dipakai route untuk membatasi staf outlet. */
export async function roomArea(warehouseId: string) {
  const [row] = await getDb()
    .select({ type: wmsWarehouse.type, area: wmsWarehouse.area })
    .from(wmsWarehouse)
    .where(eq(wmsWarehouse.id, warehouseId))
    .limit(1);
  return row ?? null;
}

/** Kategori bahan → area (untuk mengisi area permintaan dari bahan). */
export async function productAreas(productIds: string[]) {
  if (!productIds.length) return new Map<string, string>();
  const rows = await getDb()
    .select({ id: wmsProduct.id, area: wmsCategory.area })
    .from(wmsProduct)
    .leftJoin(wmsCategory, eq(wmsCategory.name, wmsProduct.category))
    .where(inArray(wmsProduct.id, productIds));
  return new Map(rows.map((r) => [r.id, r.area ?? "umum"]));
}
