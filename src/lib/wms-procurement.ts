import { and, desc, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenses,
  user,
  wmsCategory,
  wmsMaterialRequest,
  wmsPoDispatch,
  wmsProduct,
  wmsPurchaseOrder,
  wmsPurchaseOrderItem,
  wmsReceiving,
  wmsSupplier,
  wmsSupplierBill,
  wmsSupplierPayment,
  wmsSupplierProduct,
  wmsWarehouse,
} from "@/db/schema";
import { WmsMasterError } from "@/lib/wms-master-data";
import {
  FUND_SOURCES,
  PO_EDITABLE,
  buildPoWhatsappText,
  poPdfFileName,
  waRecipient,
  type FundSource,
  type PoStatus,
} from "@/lib/wms-procurement-meta";
import { makeWmsDoc, runInTx, writeWmsAudit } from "@/lib/wms-service";

// =============================================================================
// GARAGE WMS — Pengadaan (Phase 2): persetujuan PO, revisi dokumen, alur kirim
// WhatsApp (Mode 1 manual; Mode 2 API resmi disiapkan), konfirmasi supplier,
// tagihan & pembayaran supplier.
//
// Aturan uang (anti ganda): biaya pembelian = SATU baris expenses dari penerimaan
// (sourceDoc WMS:<doc>#area). Tagihan & pembayaran di sini TIDAK membuat expenses
// dan TIDAK menyentuh laci kasir / buku kas. Penerimaan tempo mencatat biaya
// berstatus "recorded"; saat tagihan lunas terverifikasi status jadi "paid".
// =============================================================================

type Db = ReturnType<typeof getDb>;
export type ProcActor = { userId: string | null; name: string; role: string };

const isOwner = (a: ProcActor) => a.role === "Owner";
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

async function lockPo(tx: Db, id: string) {
  const [po] = await tx.select().from(wmsPurchaseOrder).where(eq(wmsPurchaseOrder.id, id)).for("update").limit(1);
  if (!po) throw new WmsMasterError("PO_NOT_FOUND", "PO tidak ditemukan.", 404);
  return po;
}

async function logDispatch(
  tx: Db,
  po: typeof wmsPurchaseOrder.$inferSelect,
  actor: ProcActor,
  input: { channel: string; event: string; recipient?: string; note?: string; pdfSha256?: string | null; providerMessageId?: string | null; providerStatus?: string | null },
) {
  await tx.insert(wmsPoDispatch).values({
    purchaseOrderId: po.id,
    revision: po.revision,
    channel: input.channel,
    event: input.event,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    recipient: input.recipient ?? "",
    note: input.note ?? "",
    pdfSha256: input.pdfSha256 ?? null,
    providerMessageId: input.providerMessageId ?? null,
    providerStatus: input.providerStatus ?? null,
    userId: actor.userId,
    userName: actor.name,
  });
}

// ---------------------------------------------------------------------------
// Persetujuan
// ---------------------------------------------------------------------------

export async function submitPurchaseOrder(id: string, actor: ProcActor) {
  return runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    if (po.status !== "draft") throw new WmsMasterError("PO_STATE", "Hanya PO draft yang bisa diajukan.");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(wmsPurchaseOrderItem).where(eq(wmsPurchaseOrderItem.purchaseOrderId, id));
    if (!Number(n)) throw new WmsMasterError("PO_EMPTY", "PO belum punya bahan.");
    const [row] = await tx.update(wmsPurchaseOrder).set({ status: "pending_approval", submittedAt: new Date() }).where(eq(wmsPurchaseOrder.id, id)).returning();
    await writeWmsAudit(tx, { userId: actor.userId, action: "PO diajukan untuk persetujuan", object: po.doc, metadata: { revision: po.revision } });
    return row;
  });
}

/** Penyetuju ≠ pembuat, kecuali Owner (dicatat "disetujui sendiri oleh Owner"). */
export async function approvePurchaseOrder(id: string, actor: ProcActor) {
  return runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    if (po.status !== "pending_approval") throw new WmsMasterError("PO_STATE", "PO tidak sedang menunggu persetujuan.");
    const self = po.createdBy !== null && po.createdBy === actor.userId;
    if (self && !isOwner(actor)) throw new WmsMasterError("PO_SELF_APPROVAL", "PO harus disetujui Owner atau Manajer lain (bukan pembuatnya).", 403);
    const [row] = await tx
      .update(wmsPurchaseOrder)
      .set({ status: "approved", approvedBy: actor.userId, approvedAt: new Date() })
      .where(eq(wmsPurchaseOrder.id, id))
      .returning();
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: self ? "PO disetujui sendiri oleh Owner" : "PO disetujui",
      object: po.doc,
      metadata: { revision: po.revision, selfApproved: self },
    });
    return row;
  });
}

/** Tolak persetujuan → kembali draft (bisa diperbaiki lalu diajukan ulang). */
export async function rejectPurchaseOrder(id: string, reason: string, actor: ProcActor) {
  const why = reason.trim();
  if (why.length < 3) throw new WmsMasterError("REASON_REQUIRED", "Alasan penolakan wajib diisi.", 400);
  return runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    if (po.status !== "pending_approval") throw new WmsMasterError("PO_STATE", "PO tidak sedang menunggu persetujuan.");
    const [row] = await tx.update(wmsPurchaseOrder).set({ status: "draft", submittedAt: null }).where(eq(wmsPurchaseOrder.id, id)).returning();
    await writeWmsAudit(tx, { userId: actor.userId, action: "PO ditolak", object: po.doc, status: "warning", metadata: { reason: why } });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Revisi: PO yang berubah setelah dokumen pernah dibuka/terkirim ke supplier naik
// revisinya dan wajib disetujui & dikirim ulang (PDF bertanda REVISI n).
// ---------------------------------------------------------------------------

export type PoRevisionInput = {
  expectedDate?: string | null;
  note?: string;
  deliveryNote?: string;
  paymentTerms?: string;
  showPrices?: boolean;
  warehouseId?: string | null;
  items?: Array<{ productId: string; orderedQty: number; unitPrice: number; uom?: string | null; uomFactor?: number | null }>;
};

export async function revisePurchaseOrder(id: string, input: PoRevisionInput, actor: ProcActor) {
  return runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    if (!(PO_EDITABLE as readonly string[]).includes(po.status)) {
      throw new WmsMasterError("PO_LOCKED", "PO yang sudah diterima (sebagian/penuh) atau batal tidak bisa diubah.");
    }
    const [{ open }] = await tx
      .select({ open: sql<number>`count(*)::int` })
      .from(wmsReceiving)
      .where(and(eq(wmsReceiving.purchaseOrderId, id), ne(wmsReceiving.status, "cancelled")));
    if (Number(open)) throw new WmsMasterError("PO_LOCKED", "Sudah ada penerimaan untuk PO ini — buat PO baru untuk perubahan.");

    const set: Partial<typeof wmsPurchaseOrder.$inferInsert> = {};
    if (input.expectedDate !== undefined) set.expectedDate = input.expectedDate || null;
    if (input.note !== undefined) set.note = input.note.trim();
    if (input.deliveryNote !== undefined) set.deliveryNote = input.deliveryNote.trim();
    if (input.paymentTerms !== undefined) set.paymentTerms = input.paymentTerms.trim();
    if (input.showPrices !== undefined) set.showPrices = input.showPrices;
    if (input.warehouseId !== undefined) set.warehouseId = input.warehouseId || null;

    const changes: string[] = Object.keys(set);
    if (input.items) {
      const merged = new Map<string, { productId: string; qty: number; value: number; uom: string | null; uomFactor: number | null }>();
      for (const it of input.items) {
        if (!(it.orderedQty > 0)) continue;
        const cur = merged.get(it.productId) ?? { productId: it.productId, qty: 0, value: 0, uom: it.uom ?? null, uomFactor: it.uomFactor ?? null };
        cur.qty += it.orderedQty;
        cur.value += it.orderedQty * Math.max(0, it.unitPrice);
        merged.set(it.productId, cur);
      }
      if (!merged.size) throw new WmsMasterError("PO_EMPTY", "PO butuh minimal 1 bahan.", 400);
      const old = await tx.select().from(wmsPurchaseOrderItem).where(eq(wmsPurchaseOrderItem.purchaseOrderId, id));
      const refsByProduct = new Map(old.map((o) => [o.productId, o.sourceRefs ?? []]));
      await tx.delete(wmsPurchaseOrderItem).where(eq(wmsPurchaseOrderItem.purchaseOrderId, id));
      await tx.insert(wmsPurchaseOrderItem).values(
        [...merged.values()].map((m) => ({
          purchaseOrderId: id,
          productId: m.productId,
          orderedQty: round4(m.qty),
          unitPrice: round4(m.value / m.qty),
          uom: m.uom && m.uomFactor && m.uomFactor > 1 ? m.uom : null,
          uomFactor: m.uom && m.uomFactor && m.uomFactor > 1 ? round4(m.uomFactor) : null,
          sourceRefs: refsByProduct.get(m.productId) ?? [],
        })),
      );
      changes.push("items");
    }
    if (!changes.length) return po;

    const dispatched = po.waOpenedAt !== null || po.sentRevision !== null;
    const needsReapproval = po.status !== "draft";
    if (dispatched) set.revision = po.revision + 1;
    if (needsReapproval) {
      set.status = "pending_approval";
      set.approvedAt = null;
      set.approvedBy = null;
      set.waOpenedAt = null;
      set.submittedAt = new Date();
    }
    const [row] = await tx.update(wmsPurchaseOrder).set(set).where(eq(wmsPurchaseOrder.id, id)).returning();
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: dispatched ? `PO direvisi (REVISI ${row.revision})` : "PO diubah",
      object: po.doc,
      status: dispatched ? "warning" : "recorded",
      metadata: { changes, fromStatus: po.status, revision: row.revision },
    });
    if (dispatched) {
      await logDispatch(tx, row, actor, { channel: "system", event: "revised", note: `Revisi ${row.revision}: dokumen lama tidak berlaku.` });
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// Dokumen & WhatsApp
// ---------------------------------------------------------------------------

const dateLabel = (d: Date | string | null) =>
  d
    ? new Date(typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00+07:00` : d).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      })
    : "-";

/** Semua data dokumen PO (PDF & pesan WhatsApp memakai sumber yang sama). */
export async function getPoDocument(id: string) {
  const db = getDb();
  const [po] = await db.select().from(wmsPurchaseOrder).where(eq(wmsPurchaseOrder.id, id)).limit(1);
  if (!po) return null;
  const [supplier] = po.supplierId ? await db.select().from(wmsSupplier).where(eq(wmsSupplier.id, po.supplierId)).limit(1) : [];
  const [warehouse] = po.warehouseId ? await db.select().from(wmsWarehouse).where(eq(wmsWarehouse.id, po.warehouseId)).limit(1) : [];
  const people = [po.createdBy, po.approvedBy, po.sentBy].filter((x): x is string => !!x);
  const names = people.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, people)) : [];
  const nameOf = (uid: string | null) => names.find((n) => n.id === uid)?.name ?? null;
  const rows = await db
    .select({ item: wmsPurchaseOrderItem, name: wmsProduct.name, sku: wmsProduct.sku, unit: wmsProduct.unit, category: wmsProduct.category, brand: wmsProduct.brand, subcategory: wmsProduct.subcategory })
    .from(wmsPurchaseOrderItem)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsPurchaseOrderItem.productId))
    .where(eq(wmsPurchaseOrderItem.purchaseOrderId, id))
    .orderBy(wmsProduct.category, wmsProduct.name);

  const { getAppSettings } = await import("@/lib/garage-service");
  const settings = await getAppSettings(null);

  const items = rows.map((r, i) => {
    const factor = r.item.uom && r.item.uomFactor && Number(r.item.uomFactor) > 1 ? Number(r.item.uomFactor) : 1;
    const baseQty = Number(r.item.orderedQty);
    const qty = round4(baseQty / factor);
    const unitPrice = round4(Number(r.item.unitPrice) * factor);
    return {
      no: i + 1,
      name: r.name ?? "(bahan dihapus)",
      sku: r.sku ?? "",
      category: r.category ?? "",
      spec: [r.brand, r.subcategory].filter(Boolean).join(" · "),
      qty,
      purchaseUnit: factor > 1 ? (r.item.uom as string) : (r.unit ?? ""),
      baseQty,
      baseUnit: r.unit ?? "",
      packInfo: factor > 1 ? `1 ${r.item.uom} = ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(factor)} ${r.unit ?? ""}` : "",
      unitPrice,
      subtotal: Math.round(baseQty * Number(r.item.unitPrice)),
      sourceRefs: r.item.sourceRefs ?? [],
    };
  });
  const total = items.reduce((s, it) => s + it.subtotal, 0);
  const pricesKnown = items.some((it) => it.unitPrice > 0);
  const approved = ["approved", "wa_opened", "sent", "confirmed", "processing", "partial", "received"].includes(po.status);
  const deliveryAddress = [warehouse?.name, settings.outletAddress].filter(Boolean).join(" — ");
  const fileName = poPdfFileName(po.doc, po.supplierName, po.revision);

  return {
    po,
    company: {
      name: "Garage Coffee",
      brand: settings.brandName,
      tagline: settings.brandTagline,
      address: settings.outletAddress,
      phone: settings.outletPhone,
      npwp: settings.npwp,
    },
    supplier: {
      name: supplier?.name ?? po.supplierName,
      pic: supplier?.picName ?? "",
      phone: supplier?.phone ?? "",
      address: supplier?.address ?? "",
      paymentMethod: supplier?.paymentMethod ?? "",
      paymentTermDays: supplier?.paymentTermDays ?? 0,
    },
    delivery: {
      address: deliveryAddress,
      warehouse: warehouse?.name ?? "Gudang Utama",
      neededBy: po.expectedDate,
      note: po.deliveryNote,
    },
    items,
    total,
    showPrices: po.showPrices && pricesKnown,
    approved,
    approvalLabel: approved ? `Disetujui${nameOf(po.approvedBy) ? ` oleh ${nameOf(po.approvedBy)}` : ""}${po.approvedAt ? ` · ${dateLabel(po.approvedAt)}` : ""}` : "BELUM DISETUJUI — bukan pesanan final",
    createdByName: nameOf(po.createdBy) ?? "Gudang",
    orderDateLabel: dateLabel(po.createdAt),
    neededByLabel: dateLabel(po.expectedDate),
    fileName,
    paymentTerms:
      po.paymentTerms ||
      (supplier?.paymentMethod === "tempo" && supplier.paymentTermDays > 0
        ? `Tempo ${supplier.paymentTermDays} hari setelah barang diterima`
        : supplier?.paymentMethod
          ? supplier.paymentMethod === "cash"
            ? "Tunai saat barang diterima"
            : supplier.paymentMethod === "transfer"
              ? "Transfer bank"
              : supplier.paymentMethod
          : ""),
  };
}

export type PoDocument = NonNullable<Awaited<ReturnType<typeof getPoDocument>>>;

/** Catat PDF dibuat (sekali per revisi + sidik dokumen) untuk jejak versi. */
export async function recordPoPdfGenerated(id: string, sha256: string, actor: ProcActor) {
  return runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    const [exists] = await tx
      .select({ id: wmsPoDispatch.id })
      .from(wmsPoDispatch)
      .where(and(eq(wmsPoDispatch.purchaseOrderId, id), eq(wmsPoDispatch.event, "pdf_generated"), eq(wmsPoDispatch.pdfSha256, sha256)))
      .limit(1);
    if (!exists) await logDispatch(tx, po, actor, { channel: "system", event: "pdf_generated", pdfSha256: sha256 });
  });
}

/**
 * Mode 1: siapkan pesan + tautan wa.me ke nomor supplier. Status → "WhatsApp Dibuka".
 * BUKAN bukti terkirim: petugas masih harus melampirkan PDF & menekan kirim di WhatsApp.
 */
export async function openPoWhatsapp(id: string, actor: ProcActor) {
  const doc = await getPoDocument(id);
  if (!doc) throw new WmsMasterError("PO_NOT_FOUND", "PO tidak ditemukan.", 404);
  const recipient = waRecipient(doc.supplier.phone);
  if (!recipient) throw new WmsMasterError("SUPPLIER_PHONE", `Nomor WhatsApp supplier ${doc.supplier.name} belum diisi / tidak valid. Lengkapi di Master Data → Supplier.`, 400);
  const text = buildPoWhatsappText({
    supplierName: doc.supplier.name,
    doc: doc.po.doc,
    revision: doc.po.revision,
    dateLabel: doc.orderDateLabel,
    itemCount: doc.items.length,
    estimatedTotal: doc.showPrices ? doc.total : null,
    deliveryAddress: doc.delivery.address,
    fileName: doc.fileName,
  });
  await runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    if (!["approved", "wa_opened", "sent", "confirmed", "processing"].includes(po.status)) {
      throw new WmsMasterError("PO_NOT_APPROVED", "PO harus disetujui dulu sebelum dikirim ke supplier.");
    }
    if (po.revision !== doc.po.revision) throw new WmsMasterError("PO_CHANGED", "PO baru saja berubah. Muat ulang lalu coba lagi.");
    if (po.status === "approved") await tx.update(wmsPurchaseOrder).set({ status: "wa_opened", waOpenedAt: new Date() }).where(eq(wmsPurchaseOrder.id, id));
    await logDispatch(tx, po, actor, { channel: "whatsapp_manual", event: "wa_opened", recipient });
  });
  return { url: `https://wa.me/${recipient}?text=${encodeURIComponent(text)}`, text, recipient, fileName: doc.fileName, revision: doc.po.revision };
}

/** Konfirmasi manual petugas: pesan + PDF revisi ini BENAR-BENAR sudah dikirim. */
export async function confirmPoSent(id: string, input: { revision: number; note?: string }, actor: ProcActor) {
  return runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    if (po.status !== "wa_opened") throw new WmsMasterError("PO_STATE", "Buka WhatsApp dari tombol Kirim PO dulu, lalu konfirmasi setelah pesan & PDF terkirim.");
    if (input.revision !== po.revision) throw new WmsMasterError("PO_CHANGED", `Dokumen yang dikonfirmasi (R${input.revision}) bukan revisi terbaru (R${po.revision}).`);
    const [row] = await tx
      .update(wmsPurchaseOrder)
      .set({ status: "sent", sentAt: new Date(), sentBy: actor.userId, sentRevision: po.revision })
      .where(eq(wmsPurchaseOrder.id, id))
      .returning();
    const [sup] = po.supplierId ? await tx.select({ phone: wmsSupplier.phone }).from(wmsSupplier).where(eq(wmsSupplier.id, po.supplierId)).limit(1) : [];
    await logDispatch(tx, po, actor, { channel: "whatsapp_manual", event: "sent_confirmed", recipient: waRecipient(sup?.phone) ?? "", note: input.note?.trim() || "Dikonfirmasi manual oleh petugas: pesan & PDF terkirim." });
    await writeWmsAudit(tx, { userId: actor.userId, action: "PO terkirim ke supplier (konfirmasi manual)", object: po.doc, metadata: { revision: po.revision, supplier: po.supplierName } });
    return row;
  });
}

/** Respons supplier: confirmed (stok & harga disetujui) / processing (sedang dikirim). */
export async function recordSupplierResponse(id: string, input: { status: "confirmed" | "processing"; note?: string }, actor: ProcActor) {
  return runInTx(async (tx) => {
    const po = await lockPo(tx, id);
    const allowed = input.status === "confirmed" ? ["sent"] : ["sent", "confirmed"];
    if (!allowed.includes(po.status)) throw new WmsMasterError("PO_STATE", input.status === "confirmed" ? "PO belum terkirim." : "PO belum terkirim/dikonfirmasi.");
    const now = new Date();
    const [row] = await tx
      .update(wmsPurchaseOrder)
      .set(input.status === "confirmed" ? { status: "confirmed", confirmedAt: now } : { status: "processing", processingAt: now, confirmedAt: po.confirmedAt ?? now })
      .where(eq(wmsPurchaseOrder.id, id))
      .returning();
    await logDispatch(tx, po, actor, { channel: "whatsapp_manual", event: input.status === "confirmed" ? "supplier_confirmed" : "supplier_processing", note: input.note?.trim() ?? "" });
    return row;
  });
}

export async function listPoDispatch(id: string) {
  return getDb().select().from(wmsPoDispatch).where(eq(wmsPoDispatch.purchaseOrderId, id)).orderBy(desc(wmsPoDispatch.createdAt));
}

/**
 * Mode 2 (WhatsApp Business Platform resmi) — kemampuan saja. Pengiriman dokumen via API
 * belum diaktifkan: butuh template yang disetujui Meta + persetujuan penerima. UI memakai
 * Mode 1 sampai `cloudReady` true dan adaptornya diimplementasikan.
 */
export function getPoWhatsappCapabilities() {
  const token = Boolean(process.env.WHATSAPP_CLOUD_API_TOKEN?.trim());
  const phone = Boolean(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim());
  const template = process.env.WMS_PO_WHATSAPP_TEMPLATE?.trim() || null;
  return {
    manual: true,
    cloudConfigured: token && phone && Boolean(template),
    cloudReady: false,
    note: "Mode WhatsApp Business API belum diaktifkan untuk PO; gunakan WhatsApp biasa (lampirkan PDF manual).",
  };
}

// ---------------------------------------------------------------------------
// Tagihan & pembayaran supplier
// ---------------------------------------------------------------------------

const addDays = (dateKey: string, days: number) => {
  const d = new Date(`${dateKey}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const todayKey = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Dipanggil di transaksi penyelesaian penerimaan bertermin "Tempo". Idempoten per penerimaan. */
export async function createBillForReceiving(
  tx: Db,
  rec: typeof wmsReceiving.$inferSelect,
  amount: number,
  userId: string | null,
) {
  const [existing] = await tx.select().from(wmsSupplierBill).where(eq(wmsSupplierBill.receivingId, rec.id)).limit(1);
  if (existing) return existing;
  const [sup] = rec.supplierId ? await tx.select().from(wmsSupplier).where(eq(wmsSupplier.id, rec.supplierId)).limit(1) : [];
  const invoiceDate = rec.receivedDate ? String(rec.receivedDate) : todayKey();
  const [bill] = await tx
    .insert(wmsSupplierBill)
    .values({
      doc: makeWmsDoc("BILL"),
      supplierId: rec.supplierId,
      supplierName: rec.supplier,
      purchaseOrderId: rec.purchaseOrderId,
      receivingId: rec.id,
      invoiceDate,
      dueDate: addDays(invoiceDate, sup?.paymentTermDays ?? 0),
      amount: Math.round(amount),
      createdBy: userId,
    })
    .returning();
  // DP yang sudah dibayar untuk PO ini menempel ke tagihan.
  if (rec.purchaseOrderId) {
    await tx
      .update(wmsSupplierPayment)
      .set({ billId: bill.id })
      .where(and(eq(wmsSupplierPayment.purchaseOrderId, rec.purchaseOrderId), isNull(wmsSupplierPayment.billId), ne(wmsSupplierPayment.status, "void")));
  }
  return recomputeBill(tx, bill.id, rec.doc);
}

/** paidAmount = pembayaran terverifikasi. Lunas → baris biaya penerimaan ikut "paid". */
async function recomputeBill(tx: Db, billId: string, receivingDoc?: string | null) {
  const [bill] = await tx.select().from(wmsSupplierBill).where(eq(wmsSupplierBill.id, billId)).limit(1);
  if (!bill || bill.status === "void") return bill;
  const [{ verified }] = await tx
    .select({ verified: sql<number>`coalesce(sum(${wmsSupplierPayment.amount}), 0)::int` })
    .from(wmsSupplierPayment)
    .where(and(eq(wmsSupplierPayment.billId, billId), eq(wmsSupplierPayment.status, "verified")));
  const paid = Number(verified);
  const status = paid >= bill.amount ? "paid" : paid > 0 ? "partial" : "unpaid";
  const [row] = await tx.update(wmsSupplierBill).set({ paidAmount: paid, status, updatedAt: new Date() }).where(eq(wmsSupplierBill.id, billId)).returning();
  let doc = receivingDoc ?? null;
  if (!doc && bill.receivingId) {
    const [rec] = await tx.select({ doc: wmsReceiving.doc }).from(wmsReceiving).where(eq(wmsReceiving.id, bill.receivingId)).limit(1);
    doc = rec?.doc ?? null;
  }
  if (doc) {
    // Satu baris biaya yang sama, hanya status pembayarannya yang berubah (tidak ada biaya baru).
    await tx
      .update(expenses)
      .set({ status: status === "paid" ? "paid" : "recorded", updatedAt: new Date() })
      .where(and(like(expenses.sourceDoc, `WMS:${doc}#%`), inArray(expenses.status, ["recorded", "paid"])));
  }
  return row;
}

/** Penerimaan dibatalkan: tagihan ikut batal. Ditolak bila sudah ada pembayaran aktif. */
export async function voidBillForReceiving(tx: Db, receivingId: string) {
  const [bill] = await tx.select().from(wmsSupplierBill).where(eq(wmsSupplierBill.receivingId, receivingId)).for("update").limit(1);
  if (!bill || bill.status === "void") return;
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(wmsSupplierPayment)
    .where(and(eq(wmsSupplierPayment.billId, bill.id), ne(wmsSupplierPayment.status, "void"), eq(wmsSupplierPayment.kind, "payment")));
  if (Number(n)) throw new Error(`Tagihan ${bill.doc} sudah punya pembayaran. Batalkan pembayaran itu dulu.`);
  // DP dilepas kembali ke PO (masih milik PO, bukan hilang).
  await tx.update(wmsSupplierPayment).set({ billId: null }).where(and(eq(wmsSupplierPayment.billId, bill.id), eq(wmsSupplierPayment.kind, "dp")));
  await tx.update(wmsSupplierBill).set({ status: "void", updatedAt: new Date() }).where(eq(wmsSupplierBill.id, bill.id));
}

export async function updateBillInvoice(
  id: string,
  input: { invoiceNo?: string; invoiceDate?: string | null; dueDate?: string | null; invoiceUrl?: string | null; note?: string },
  actor: ProcActor,
) {
  return runInTx(async (tx) => {
    const [bill] = await tx.select().from(wmsSupplierBill).where(eq(wmsSupplierBill.id, id)).for("update").limit(1);
    if (!bill) throw new WmsMasterError("BILL_NOT_FOUND", "Tagihan tidak ditemukan.", 404);
    if (bill.status === "void") throw new WmsMasterError("BILL_VOID", "Tagihan sudah dibatalkan.");
    const set: Partial<typeof wmsSupplierBill.$inferInsert> = { updatedAt: new Date() };
    if (input.invoiceNo !== undefined) set.invoiceNo = input.invoiceNo.trim();
    if (input.invoiceDate !== undefined) set.invoiceDate = input.invoiceDate || null;
    if (input.dueDate !== undefined) set.dueDate = input.dueDate || null;
    if (input.invoiceUrl !== undefined) set.invoiceUrl = input.invoiceUrl;
    if (input.note !== undefined) set.note = input.note.trim();
    const [row] = await tx.update(wmsSupplierBill).set(set).where(eq(wmsSupplierBill.id, id)).returning();
    await writeWmsAudit(tx, { userId: actor.userId, action: "Invoice supplier ditautkan", object: bill.doc, metadata: { invoiceNo: row.invoiceNo } });
    return row;
  });
}

export type SupplierPaymentInput = {
  billId?: string | null;
  purchaseOrderId?: string | null;
  kind: "payment" | "dp";
  amount: number;
  method: "cash" | "transfer";
  fundSource: FundSource;
  reference?: string;
  proofUrl?: string | null;
  paidAt?: string | null;
};

/**
 * Catat pembayaran/DP. Tidak membuat expenses & tidak memotong laci kasir.
 * Owner → langsung terverifikasi; lainnya → "Menunggu verifikasi" sampai Owner/Manajer lain memverifikasi.
 */
export async function recordSupplierPayment(input: SupplierPaymentInput, actor: ProcActor) {
  const amount = Math.round(Number(input.amount));
  if (!(amount > 0)) throw new WmsMasterError("AMOUNT_INVALID", "Nominal pembayaran harus lebih dari 0.", 400);
  if (!(FUND_SOURCES as readonly string[]).includes(input.fundSource)) {
    throw new WmsMasterError("FUND_SOURCE", "Sumber dana tidak valid. Laci kasir tidak boleh dipakai untuk bayar supplier.", 400);
  }
  if (input.method === "transfer" && input.fundSource === "petty") throw new WmsMasterError("FUND_SOURCE", "Transfer bank harus dari rekening bank atau uang Owner.", 400);
  if (input.method === "cash" && (input.fundSource === "bank_jago" || input.fundSource === "bank_bni")) {
    throw new WmsMasterError("FUND_SOURCE", "Pembayaran tunai harus dari kas kecil atau uang Owner.", 400);
  }
  if (input.method === "transfer" && !(input.reference ?? "").trim()) throw new WmsMasterError("REFERENCE_REQUIRED", "No. referensi transfer wajib diisi.", 400);

  return runInTx(async (tx) => {
    let billId: string | null = null;
    let poId: string | null = input.purchaseOrderId ?? null;
    let supplierId: string | null = null;
    let label = "";
    if (input.kind === "payment") {
      if (!input.billId) throw new WmsMasterError("BILL_REQUIRED", "Pilih tagihan yang dibayar.", 400);
      const [bill] = await tx.select().from(wmsSupplierBill).where(eq(wmsSupplierBill.id, input.billId)).for("update").limit(1);
      if (!bill || bill.status === "void") throw new WmsMasterError("BILL_NOT_FOUND", "Tagihan tidak ditemukan / dibatalkan.", 404);
      const [{ committed }] = await tx
        .select({ committed: sql<number>`coalesce(sum(${wmsSupplierPayment.amount}), 0)::int` })
        .from(wmsSupplierPayment)
        .where(and(eq(wmsSupplierPayment.billId, bill.id), ne(wmsSupplierPayment.status, "void")));
      const outstanding = bill.amount - Number(committed);
      if (outstanding <= 0) throw new WmsMasterError("BILL_PAID", `Tagihan ${bill.doc} sudah lunas / menunggu verifikasi pembayaran.`);
      if (amount > outstanding) throw new WmsMasterError("OVERPAY", `Nominal melebihi sisa tagihan (Rp${outstanding.toLocaleString("id-ID")}).`, 400);
      billId = bill.id;
      poId = bill.purchaseOrderId;
      supplierId = bill.supplierId;
      label = bill.doc;
    } else {
      if (!poId) throw new WmsMasterError("PO_REQUIRED", "DP harus untuk PO tertentu.", 400);
      const po = await lockPo(tx, poId);
      if (!["approved", "wa_opened", "sent", "confirmed", "processing", "partial"].includes(po.status)) {
        throw new WmsMasterError("PO_STATE", "DP hanya untuk PO yang sudah disetujui dan belum selesai.");
      }
      const [{ total }] = await tx
        .select({ total: sql<number>`coalesce(sum(${wmsPurchaseOrderItem.orderedQty} * ${wmsPurchaseOrderItem.unitPrice}), 0)` })
        .from(wmsPurchaseOrderItem)
        .where(eq(wmsPurchaseOrderItem.purchaseOrderId, po.id));
      const [{ dp }] = await tx
        .select({ dp: sql<number>`coalesce(sum(${wmsSupplierPayment.amount}), 0)::int` })
        .from(wmsSupplierPayment)
        .where(and(eq(wmsSupplierPayment.purchaseOrderId, po.id), eq(wmsSupplierPayment.kind, "dp"), ne(wmsSupplierPayment.status, "void")));
      const cap = Math.round(Number(total)) - Number(dp);
      if (amount > cap) throw new WmsMasterError("OVERPAY", `DP melebihi estimasi PO yang belum dibayar (Rp${Math.max(0, cap).toLocaleString("id-ID")}).`, 400);
      supplierId = po.supplierId;
      label = po.doc;
    }
    const verified = isOwner(actor);
    const [payment] = await tx
      .insert(wmsSupplierPayment)
      .values({
        doc: makeWmsDoc(input.kind === "dp" ? "DP" : "PAY"),
        billId,
        purchaseOrderId: poId,
        supplierId,
        kind: input.kind,
        amount,
        method: input.method,
        fundSource: input.fundSource,
        reference: (input.reference ?? "").trim(),
        proofUrl: input.proofUrl ?? null,
        status: verified ? "verified" : "pending_verification",
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        createdBy: actor.userId,
        createdByName: actor.name,
        verifiedBy: verified ? actor.userId : null,
        verifiedAt: verified ? new Date() : null,
      })
      .returning();
    if (billId) await recomputeBill(tx, billId);
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: input.kind === "dp" ? "DP supplier dicatat" : "Pembayaran supplier dicatat",
      object: label,
      metadata: { payment: payment.doc, amount, method: input.method, fundSource: input.fundSource, verified, selfVerifiedOwner: verified },
    });
    return payment;
  });
}

/** Verifikasi oleh Owner, atau Manajer lain (bukan pencatat). */
export async function verifySupplierPayment(id: string, actor: ProcActor) {
  return runInTx(async (tx) => {
    const [p] = await tx.select().from(wmsSupplierPayment).where(eq(wmsSupplierPayment.id, id)).for("update").limit(1);
    if (!p) throw new WmsMasterError("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
    if (p.status !== "pending_verification") throw new WmsMasterError("PAYMENT_STATE", "Pembayaran tidak menunggu verifikasi.");
    if (p.createdBy === actor.userId && !isOwner(actor)) throw new WmsMasterError("SELF_VERIFY", "Pembayaran harus diverifikasi Owner atau Manajer lain.", 403);
    const [row] = await tx.update(wmsSupplierPayment).set({ status: "verified", verifiedBy: actor.userId, verifiedAt: new Date() }).where(eq(wmsSupplierPayment.id, id)).returning();
    if (p.billId) await recomputeBill(tx, p.billId);
    await writeWmsAudit(tx, { userId: actor.userId, action: "Pembayaran supplier diverifikasi", object: p.doc, metadata: { amount: p.amount } });
    return row;
  });
}

/** Batalkan pembayaran (Owner saja, wajib alasan). Riwayat tetap ada. */
export async function voidSupplierPayment(id: string, reason: string, actor: ProcActor) {
  if (!isOwner(actor)) throw new WmsMasterError("FORBIDDEN", "Hanya Owner yang bisa membatalkan pembayaran.", 403);
  const why = reason.trim();
  if (why.length < 3) throw new WmsMasterError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.", 400);
  return runInTx(async (tx) => {
    const [p] = await tx.select().from(wmsSupplierPayment).where(eq(wmsSupplierPayment.id, id)).for("update").limit(1);
    if (!p) throw new WmsMasterError("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.", 404);
    if (p.status === "void") throw new WmsMasterError("PAYMENT_STATE", "Pembayaran sudah dibatalkan.");
    const [row] = await tx.update(wmsSupplierPayment).set({ status: "void", voidReason: why }).where(eq(wmsSupplierPayment.id, id)).returning();
    if (p.billId) await recomputeBill(tx, p.billId);
    await writeWmsAudit(tx, { userId: actor.userId, action: "Pembayaran supplier dibatalkan", object: p.doc, status: "warning", metadata: { amount: p.amount, reason: why } });
    return row;
  });
}

export async function listSupplierBills(filter: { status?: string[]; supplierId?: string } = {}) {
  const db = getDb();
  const conds = [];
  if (filter.status?.length) conds.push(inArray(wmsSupplierBill.status, filter.status));
  if (filter.supplierId) conds.push(eq(wmsSupplierBill.supplierId, filter.supplierId));
  const bills = await db
    .select({ bill: wmsSupplierBill, poDoc: wmsPurchaseOrder.doc, receivingDoc: wmsReceiving.doc })
    .from(wmsSupplierBill)
    .leftJoin(wmsPurchaseOrder, eq(wmsPurchaseOrder.id, wmsSupplierBill.purchaseOrderId))
    .leftJoin(wmsReceiving, eq(wmsReceiving.id, wmsSupplierBill.receivingId))
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(wmsSupplierBill.createdAt))
    .limit(200);
  const ids = bills.map((b) => b.bill.id);
  const payments = ids.length ? await db.select().from(wmsSupplierPayment).where(inArray(wmsSupplierPayment.billId, ids)).orderBy(desc(wmsSupplierPayment.paidAt)) : [];
  const today = todayKey();
  return bills.map((b) => ({
    ...b.bill,
    poDoc: b.poDoc,
    receivingDoc: b.receivingDoc,
    outstanding: Math.max(0, b.bill.amount - b.bill.paidAmount),
    overdue: b.bill.status !== "paid" && b.bill.status !== "void" && !!b.bill.dueDate && String(b.bill.dueDate) < today,
    payments: payments.filter((p) => p.billId === b.bill.id),
  }));
}

export async function listPoPayments(purchaseOrderId: string) {
  return getDb().select().from(wmsSupplierPayment).where(eq(wmsSupplierPayment.purchaseOrderId, purchaseOrderId)).orderBy(desc(wmsSupplierPayment.paidAt));
}

// ---------------------------------------------------------------------------
// Supplier ↔ bahan (harga referensi, utama/alternatif)
// ---------------------------------------------------------------------------

export async function listSupplierProducts(supplierId: string) {
  return getDb()
    .select({ link: wmsSupplierProduct, sku: wmsProduct.sku, name: wmsProduct.name, unit: wmsProduct.unit, category: wmsProduct.category })
    .from(wmsSupplierProduct)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsSupplierProduct.productId))
    .where(eq(wmsSupplierProduct.supplierId, supplierId))
    .orderBy(wmsProduct.name);
}

/** Satu bahan boleh punya banyak supplier; peran "primary" juga menjadi supplier utama bahan. */
export async function upsertSupplierProduct(input: { supplierId: string; productId: string; refPrice: number; role: "primary" | "alternative" }, actor: ProcActor) {
  return runInTx(async (tx) => {
    const [row] = await tx
      .insert(wmsSupplierProduct)
      .values({ supplierId: input.supplierId, productId: input.productId, refPrice: round4(Math.max(0, input.refPrice)), role: input.role })
      .onConflictDoUpdate({
        target: [wmsSupplierProduct.supplierId, wmsSupplierProduct.productId],
        set: { refPrice: round4(Math.max(0, input.refPrice)), role: input.role, updatedAt: new Date() },
      })
      .returning();
    if (input.role === "primary") {
      await tx
        .update(wmsSupplierProduct)
        .set({ role: "alternative", updatedAt: new Date() })
        .where(and(eq(wmsSupplierProduct.productId, input.productId), ne(wmsSupplierProduct.supplierId, input.supplierId), eq(wmsSupplierProduct.role, "primary")));
      await tx.update(wmsProduct).set({ defaultSupplierId: input.supplierId, updatedAt: new Date() }).where(eq(wmsProduct.id, input.productId));
    }
    await writeWmsAudit(tx, { userId: actor.userId, action: "Bahan supplier diperbarui", object: input.productId, metadata: { supplierId: input.supplierId, role: input.role, refPrice: input.refPrice } });
    return row;
  });
}

export async function removeSupplierProduct(supplierId: string, productId: string, actor: ProcActor) {
  return runInTx(async (tx) => {
    await tx.delete(wmsSupplierProduct).where(and(eq(wmsSupplierProduct.supplierId, supplierId), eq(wmsSupplierProduct.productId, productId)));
    await writeWmsAudit(tx, { userId: actor.userId, action: "Bahan dilepas dari supplier", object: productId, metadata: { supplierId } });
  });
}

/** Supplier & harga referensi untuk kebutuhan beli: utama master → link "primary" → penerimaan terakhir. */
export async function preferredSupplierFor(db: Db, productIds: string[]) {
  const out = new Map<string, { supplierId: string; refPrice: number | null }>();
  if (!productIds.length) return out;
  const products = await db.select({ id: wmsProduct.id, defaultSupplierId: wmsProduct.defaultSupplierId }).from(wmsProduct).where(inArray(wmsProduct.id, productIds));
  const links = await db.select().from(wmsSupplierProduct).where(inArray(wmsSupplierProduct.productId, productIds));
  const activeSup = new Set(
    (await db.select({ id: wmsSupplier.id }).from(wmsSupplier).where(isNull(wmsSupplier.archivedAt))).map((s) => s.id),
  );
  for (const p of products) {
    const own = links.filter((l) => l.productId === p.id && activeSup.has(l.supplierId));
    const sup = (p.defaultSupplierId && activeSup.has(p.defaultSupplierId) ? p.defaultSupplierId : null) ?? own.find((l) => l.role === "primary")?.supplierId ?? null;
    if (!sup) continue;
    const link = own.find((l) => l.supplierId === sup);
    out.set(p.id, { supplierId: sup, refPrice: link && Number(link.refPrice) > 0 ? Number(link.refPrice) : null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Procurement Command Center
// ---------------------------------------------------------------------------

export async function getProcurementDashboard() {
  const db = getDb();
  const [mrq] = await db
    .select({
      open: sql<number>`count(*) filter (where ${wmsMaterialRequest.status} in ('submitted','sent'))::int`,
      waiting: sql<number>`count(*) filter (where ${wmsMaterialRequest.status} = 'submitted')::int`,
    })
    .from(wmsMaterialRequest);
  const poRows = await db.select({ status: wmsPurchaseOrder.status, n: sql<number>`count(*)::int` }).from(wmsPurchaseOrder).groupBy(wmsPurchaseOrder.status);
  const po = Object.fromEntries(poRows.map((r) => [r.status, Number(r.n)])) as Partial<Record<PoStatus, number>>;
  const { listMaterialShortages } = await import("@/lib/wms-material-request");
  const shortages = await listMaterialShortages(db);
  const [bills] = await db
    .select({
      unpaid: sql<number>`count(*) filter (where ${wmsSupplierBill.status} in ('unpaid','partial'))::int`,
      outstanding: sql<number>`coalesce(sum(${wmsSupplierBill.amount} - ${wmsSupplierBill.paidAmount}) filter (where ${wmsSupplierBill.status} in ('unpaid','partial')), 0)::bigint`,
      overdue: sql<number>`count(*) filter (where ${wmsSupplierBill.status} in ('unpaid','partial') and ${wmsSupplierBill.dueDate} < ${todayKey()})::int`,
    })
    .from(wmsSupplierBill);
  const [pay] = await db
    .select({ pending: sql<number>`count(*) filter (where ${wmsSupplierPayment.status} = 'pending_verification')::int` })
    .from(wmsSupplierPayment);
  return {
    requestsOpen: Number(mrq?.open ?? 0),
    requestsWaiting: Number(mrq?.waiting ?? 0),
    shortages: shortages.length,
    poDraft: po.draft ?? 0,
    poPendingApproval: po.pending_approval ?? 0,
    poReadyToSend: (po.approved ?? 0) + (po.wa_opened ?? 0),
    poAwaitingSupplier: po.sent ?? 0,
    poInDelivery: (po.confirmed ?? 0) + (po.processing ?? 0),
    poPartial: po.partial ?? 0,
    billsUnpaid: Number(bills?.unpaid ?? 0),
    billsOutstanding: Number(bills?.outstanding ?? 0),
    billsOverdue: Number(bills?.overdue ?? 0),
    paymentsPendingVerification: Number(pay?.pending ?? 0),
  };
}

/** Area kategori bahan (untuk label PDF / asal kebutuhan). */
export async function categoryAreaMap(db: Db = getDb()) {
  const rows = await db.select({ name: wmsCategory.name, area: wmsCategory.area }).from(wmsCategory);
  return new Map(rows.map((r) => [r.name, r.area]));
}
