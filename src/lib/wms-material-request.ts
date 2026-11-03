import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  appSettings,
  menuRecipes,
  wmsCategory,
  wmsMaterialRequest,
  wmsMaterialRequestItem,
  wmsProduct,
  wmsStockMovement,
  wmsSupplier,
  wmsWarehouse,
  wmsWarehouseStock,
} from "@/db/schema";
import { createPurchaseOrderInTx, getSupplierPriceHistory } from "@/lib/wms-purchase";
import {
  estimateRunoutAt,
  portionsLeft,
  receiveShortfall,
  suggestRequestQty,
  targetStock,
  usagePerHour,
} from "@/lib/material-request-rules";
import { loadProductUoms } from "@/lib/wms-uom";
import { makeWmsDoc, moveStockBetweenWarehouses, runInTx, writeWmsAudit } from "@/lib/wms-service";

// =============================================================================
// GARAGE WMS — Minta Bahan (owner, Okt 2026). Karyawan Bar/Dapur menyusun daftar
// belanja dari layar produksi → gudang kirim (stok pindah gudang utama area →
// ruang Bar/Dapur, batch & expired ikut) → divisi konfirmasi terima. Tanpa
// approval; manajer dapat notifikasi. Yang tidak tersedia di gudang tercatat
// sebagai kekurangan → PO draft per supplier terakhir (konsep ERPNext Material
// Request → Purchase Order).
// =============================================================================

type Db = ReturnType<typeof getDb>;

export type MaterialDivision = "bar" | "dapur";
export type MaterialRequestStatus = "submitted" | "sent" | "received" | "cancelled";

export const MATERIAL_DIVISION_LABEL: Record<MaterialDivision, string> = { bar: "Bar", dapur: "Dapur" };

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Ruang Bar/Dapur (tujuan) + gudang utama area (sumber). */
async function roomsFor(db: Db, division: MaterialDivision) {
  const whs = await db.select().from(wmsWarehouse);
  const outletType = division === "bar" ? "bar" : "kitchen";
  const room = whs.find((w) => w.type === outletType);
  const source = whs.find((w) => w.type === "main" && w.area === division) ?? whs.find((w) => w.type === "main" && w.isPrimary);
  if (!room) throw new Error(`Ruang ${MATERIAL_DIVISION_LABEL[division]} belum terdaftar di gudang.`);
  return { room, source: source ?? null };
}

async function stockMap(db: Db, warehouseId: string | null | undefined, productIds: string[]) {
  const map = new Map<string, number>();
  if (!warehouseId || !productIds.length) return map;
  const rows = await db
    .select({ productId: wmsWarehouseStock.productId, qty: wmsWarehouseStock.qty })
    .from(wmsWarehouseStock)
    .where(and(eq(wmsWarehouseStock.warehouseId, warehouseId), inArray(wmsWarehouseStock.productId, productIds)));
  for (const r of rows) map.set(r.productId, Number(r.qty));
  return map;
}

/** Pemakaian ruang (mutasi keluar = penjualan/resep): hari ini & 7 hari, per bahan. */
async function usageMap(db: Db, warehouseId: string, productIds: string[], now: Date) {
  const map = new Map<string, { usedToday: number; hoursOpenToday: number; used7d: number }>();
  if (!productIds.length) return map;
  // Awal hari Asia/Jakarta (UTC+7, tanpa DST).
  const jkt = new Date(now.getTime() + 7 * 3_600_000);
  const dayStart = new Date(Date.UTC(jkt.getUTCFullYear(), jkt.getUTCMonth(), jkt.getUTCDate()) - 7 * 3_600_000);
  const weekStart = new Date(now.getTime() - 7 * 24 * 3_600_000);
  const rows = await db
    .select({
      productId: wmsStockMovement.productId,
      used7d: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 then -${wmsStockMovement.qty} else 0 end), 0)`,
      usedToday: sql<number>`coalesce(sum(case when ${wmsStockMovement.qty} < 0 and ${wmsStockMovement.createdAt} >= ${dayStart} then -${wmsStockMovement.qty} else 0 end), 0)`,
      firstToday: sql<string | null>`min(case when ${wmsStockMovement.qty} < 0 and ${wmsStockMovement.createdAt} >= ${dayStart} then ${wmsStockMovement.createdAt} end)`,
    })
    .from(wmsStockMovement)
    .where(
      and(
        eq(wmsStockMovement.warehouseId, warehouseId),
        inArray(wmsStockMovement.productId, productIds),
        eq(wmsStockMovement.type, "out"),
        sql`${wmsStockMovement.createdAt} >= ${weekStart}`,
      ),
    )
    .groupBy(wmsStockMovement.productId);
  for (const r of rows) {
    if (!r.productId) continue;
    const first = r.firstToday ? new Date(r.firstToday).getTime() : null;
    map.set(r.productId, {
      usedToday: Number(r.usedToday),
      hoursOpenToday: first ? Math.max(1, (now.getTime() - first) / 3_600_000) : 0,
      used7d: Number(r.used7d),
    });
  }
  return map;
}

/** Takaran resep per porsi (satuan sama dengan bahan) — rata-rata resep aktif, untuk "cukup ±N porsi". */
async function portionMap(db: Db, products: Array<{ id: string; sku: string; unit: string }>) {
  const map = new Map<string, number>();
  if (!products.length) return map;
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const rows = await db
    .select({ sku: menuRecipes.inventorySku, qty: menuRecipes.qty, unit: menuRecipes.unit })
    .from(menuRecipes)
    .where(and(eq(menuRecipes.status, "active"), inArray(menuRecipes.inventorySku, [...bySku.keys()])));
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const p = r.sku ? bySku.get(r.sku) : undefined;
    if (!p || !(Number(r.qty) > 0) || r.unit.trim().toLowerCase() !== p.unit.trim().toLowerCase()) continue;
    const cur = acc.get(p.id) ?? { sum: 0, n: 0 };
    acc.set(p.id, { sum: cur.sum + Number(r.qty), n: cur.n + 1 });
  }
  for (const [id, v] of acc) map.set(id, v.sum / v.n);
  return map;
}

/** Bahan yang bisa diminta divisi: kategori area divisi + umum, belum diarsip. Stok ruang & gudang utama. */
export async function getMaterialCatalog(division: MaterialDivision) {
  const db = getDb();
  const { room, source } = await roomsFor(db, division);
  const products = await db
    .select({ id: wmsProduct.id, sku: wmsProduct.sku, name: wmsProduct.name, category: wmsProduct.category, unit: wmsProduct.unit, minStock: wmsProduct.minStock, parStock: wmsProduct.parStock })
    .from(wmsProduct)
    .leftJoin(wmsCategory, eq(wmsCategory.name, wmsProduct.category))
    .where(and(isNull(wmsProduct.archivedAt), or(eq(wmsCategory.area, division), eq(wmsCategory.area, "umum"), isNull(wmsCategory.area))))
    .orderBy(wmsProduct.name);
  const ids = products.map((p) => p.id);
  const now = new Date();
  const [roomStock, sourceStock, uoms, usage, perPortion] = await Promise.all([
    stockMap(db, room.id, ids),
    stockMap(db, source?.id, ids),
    loadProductUoms(ids, db),
    usageMap(db, room.id, ids, now),
    portionMap(db, products),
  ]);
  return {
    division,
    room: { id: room.id, name: room.name },
    source: source ? { id: source.id, name: source.name } : null,
    products: products.map((p) => {
      const onHand = roomStock.get(p.id) ?? 0;
      const minStock = Number(p.minStock);
      const parStock = Number(p.parStock);
      const productUoms = uoms.get(p.id) ?? [];
      const use = usage.get(p.id);
      const perHour = use ? usagePerHour(use) : 0;
      const runoutAt = estimateRunoutAt(onHand, perHour, now);
      return {
        ...p,
        uoms: productUoms,
        minStock,
        parStock,
        targetStock: targetStock(minStock, parStock),
        // M1: jumlah usulan (stok target − stok ruang, dibulatkan ke kemasan).
        suggestedQty: suggestRequestQty({ onHand, minStock, parStock, packFactors: productUoms.map((u) => u.factor) }),
        // M2: laju pakai & perkiraan habis.
        usagePerHour: Math.round(perHour * 100) / 100,
        runoutAt: runoutAt?.toISOString() ?? null,
        portionsLeft: portionsLeft(onHand, perPortion.get(p.id)),
        onHand,
        sourceOnHand: sourceStock.get(p.id) ?? 0,
        status: onHand <= 0 ? ("out" as const) : minStock > 0 && onHand <= minStock ? ("low" as const) : ("ok" as const),
      };
    }),
  };
}

export type MaterialRequestInput = {
  division: MaterialDivision;
  items: Array<{ productId: string; qty: number; note?: string }>;
  note?: string;
  urgent?: boolean;
};

export async function createMaterialRequest(input: MaterialRequestInput, actor: { userId: string | null; name: string; outletId: string | null }) {
  const merged = new Map<string, { qty: number; note: string }>();
  for (const it of input.items) {
    if (!(it.qty > 0)) continue;
    const cur = merged.get(it.productId);
    merged.set(it.productId, { qty: round4((cur?.qty ?? 0) + it.qty), note: [cur?.note, it.note?.trim()].filter(Boolean).join("; ") });
  }
  if (!merged.size) throw new Error("Daftar belanja masih kosong.");
  const created = await runInTx(async (tx) => {
    const { room, source } = await roomsFor(tx, input.division);
    const ids = [...merged.keys()];
    const known = await tx.select({ id: wmsProduct.id }).from(wmsProduct).where(and(inArray(wmsProduct.id, ids), isNull(wmsProduct.archivedAt)));
    if (known.length !== ids.length) throw new Error("Ada bahan yang tidak ditemukan / sudah diarsip.");
    const stocks = await stockMap(tx, room.id, ids);
    const [request] = await tx
      .insert(wmsMaterialRequest)
      .values({
        doc: makeWmsDoc("MRQ"),
        division: input.division,
        warehouseId: room.id,
        sourceWarehouseId: source?.id ?? null,
        urgent: !!input.urgent,
        note: input.note?.trim() ?? "",
        requestedBy: actor.userId,
        requestedByName: actor.name,
      })
      .returning();
    await tx.insert(wmsMaterialRequestItem).values(
      [...merged].map(([productId, v]) => ({ requestId: request.id, productId, qty: v.qty, stockAtRequest: stocks.get(productId) ?? 0, note: v.note })),
    );
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: "Permintaan bahan dikirim ke gudang",
      object: request.doc,
      metadata: { division: input.division, items: merged.size, urgent: !!input.urgent },
    });
    return request;
  });
  await notify(actor.outletId, {
    audience: "management",
    severity: created.urgent ? "urgent" : "warning",
    title: `${created.urgent ? "URGENT · " : ""}Minta bahan ${MATERIAL_DIVISION_LABEL[input.division]} (${merged.size} item)`,
    body: `${created.doc} dari ${actor.name}${created.note ? ` — ${created.note}` : ""}`,
    url: "/warehouse/material-requests",
    dedupKey: `mrq:${created.id}`,
  });
  return created;
}

async function notify(
  outletId: string | null,
  input: { audience: "management" | "production" | "bar" | "dapur"; severity: "info" | "warning" | "urgent"; title: string; body: string; url: string; dedupKey: string },
) {
  try {
    const { notifyStaff } = await import("@/lib/staff-notifications");
    await notifyStaff({ outletId, kind: "material_request", ...input });
  } catch {
    // Notifikasi gagal tidak boleh membatalkan permintaan yang sudah tersimpan.
  }
}

export async function listMaterialRequests(filter: { division?: MaterialDivision; status?: MaterialRequestStatus[]; limit?: number } = {}) {
  const db = getDb();
  const requests = await db
    .select({ request: wmsMaterialRequest, roomName: wmsWarehouse.name })
    .from(wmsMaterialRequest)
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsMaterialRequest.warehouseId))
    .where(
      and(
        filter.division ? eq(wmsMaterialRequest.division, filter.division) : undefined,
        filter.status?.length ? inArray(wmsMaterialRequest.status, filter.status) : undefined,
      ),
    )
    .orderBy(sql`case ${wmsMaterialRequest.status} when 'submitted' then 0 when 'sent' then 1 else 2 end`, desc(wmsMaterialRequest.urgent), desc(wmsMaterialRequest.createdAt))
    .limit(filter.limit ?? 60);
  if (!requests.length) return [];
  const items = await db
    .select({ item: wmsMaterialRequestItem, name: wmsProduct.name, sku: wmsProduct.sku, unit: wmsProduct.unit })
    .from(wmsMaterialRequestItem)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsMaterialRequestItem.productId))
    .where(inArray(wmsMaterialRequestItem.requestId, requests.map((r) => r.request.id)))
    .orderBy(wmsProduct.name);
  const sourceIds = [...new Set(requests.map((r) => r.request.sourceWarehouseId).filter((id): id is string => !!id))];
  const productIds = [...new Set(items.map((i) => i.item.productId))];
  const uoms = await loadProductUoms(productIds, db);
  const sourceStock = new Map<string, number>();
  if (sourceIds.length && productIds.length) {
    const rows = await db
      .select({ productId: wmsWarehouseStock.productId, warehouseId: wmsWarehouseStock.warehouseId, qty: wmsWarehouseStock.qty })
      .from(wmsWarehouseStock)
      .where(and(inArray(wmsWarehouseStock.warehouseId, sourceIds), inArray(wmsWarehouseStock.productId, productIds)));
    for (const r of rows) sourceStock.set(`${r.warehouseId}|${r.productId}`, Number(r.qty));
  }
  // Stok yang sudah "dialokasikan": diminta permintaan lain yang belum dikirim dari gudang sumber yang sama.
  const pending = productIds.length
    ? await db
        .select({ requestId: wmsMaterialRequestItem.requestId, productId: wmsMaterialRequestItem.productId, qty: wmsMaterialRequestItem.qty, source: wmsMaterialRequest.sourceWarehouseId })
        .from(wmsMaterialRequestItem)
        .innerJoin(wmsMaterialRequest, eq(wmsMaterialRequest.id, wmsMaterialRequestItem.requestId))
        .where(and(eq(wmsMaterialRequest.status, "submitted"), inArray(wmsMaterialRequestItem.productId, productIds)))
    : [];
  const allocatedElsewhere = (requestId: string, source: string | null, productId: string) =>
    round4(pending.filter((x) => x.requestId !== requestId && x.source === source && x.productId === productId).reduce((sum, x) => sum + Number(x.qty), 0));
  return requests.map(({ request, roomName }) => ({
    ...request,
    roomName,
    items: items
      .filter((i) => i.item.requestId === request.id)
      .map((i) => ({
        id: i.item.id,
        productId: i.item.productId,
        name: i.name,
        sku: i.sku,
        unit: i.unit,
        uoms: uoms.get(i.item.productId) ?? [],
        qty: Number(i.item.qty),
        stockAtRequest: Number(i.item.stockAtRequest),
        sentQty: Number(i.item.sentQty),
        shortQty: Number(i.item.shortQty),
        receivedQty: i.item.receivedQty == null ? null : Number(i.item.receivedQty),
        purchaseOrderId: i.item.purchaseOrderId,
        note: i.item.note,
        sourceOnHand: request.sourceWarehouseId ? (sourceStock.get(`${request.sourceWarehouseId}|${i.item.productId}`) ?? 0) : 0,
        allocatedElsewhere: request.status === "submitted" ? allocatedElsewhere(request.id, request.sourceWarehouseId, i.item.productId) : 0,
      })),
  }));
}

/**
 * Gudang mengirim: tiap baris qty kirim (≤ diminta) dipindah dari gudang utama area
 * ke ruang Bar/Dapur lewat `moveStockBetweenWarehouses` (FEFO, tolak kedaluwarsa,
 * batch ikut). Sisa yang tidak dikirim = kekurangan (perlu dibeli). Sekali kirim.
 */
export async function sendMaterialRequest(
  id: string,
  lines: Array<{ itemId: string; qty: number }>,
  actor: { userId: string | null; outletId: string | null },
) {
  const result = await runInTx(async (tx) => {
    const [request] = await tx.select().from(wmsMaterialRequest).where(eq(wmsMaterialRequest.id, id)).for("update").limit(1);
    if (!request) return null;
    if (request.status !== "submitted") throw new Error("Permintaan ini sudah diproses.");
    if (!request.warehouseId || !request.sourceWarehouseId) throw new Error("Ruang tujuan / gudang sumber belum lengkap.");
    const items = await tx.select().from(wmsMaterialRequestItem).where(eq(wmsMaterialRequestItem.requestId, id));
    const sendBy = new Map(lines.map((l) => [l.itemId, l.qty]));
    let shortCount = 0;
    for (const item of items) {
      const want = Number(item.qty);
      const qty = round4(Math.max(0, Math.min(want, Number(sendBy.get(item.id) ?? 0))));
      if (qty > 0) {
        const [prod] = await tx.select({ hpp: wmsProduct.hpp, name: wmsProduct.name }).from(wmsProduct).where(eq(wmsProduct.id, item.productId)).limit(1);
        try {
          await moveStockBetweenWarehouses(tx, {
            outType: "internal_out",
            productId: item.productId,
            fromWarehouseId: request.sourceWarehouseId,
            toWarehouseId: request.warehouseId,
            qty,
            fallbackHpp: Number(prod?.hpp ?? 0),
            refDoc: request.doc,
            userId: actor.userId,
          });
        } catch (error) {
          throw new Error(`${prod?.name ?? "Bahan"}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const short = round4(want - qty);
      if (short > 0) shortCount += 1;
      await tx.update(wmsMaterialRequestItem).set({ sentQty: qty, shortQty: short }).where(eq(wmsMaterialRequestItem.id, item.id));
    }
    const [updated] = await tx
      .update(wmsMaterialRequest)
      .set({ status: "sent", sentBy: actor.userId, sentAt: new Date() })
      .where(eq(wmsMaterialRequest.id, id))
      .returning();
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: "Permintaan bahan dikirim gudang",
      object: request.doc,
      status: shortCount ? "warning" : "recorded",
      metadata: { lines: items.length, shortLines: shortCount },
    });
    return { request: updated, shortCount };
  });
  if (result) {
    // V2: hanya divisi peminta (Bar tidak menerima kiriman Dapur, dan sebaliknya).
    await notify(actor.outletId, {
      audience: result.request.division === "bar" ? "bar" : "dapur",
      severity: "info",
      title: `Bahan ${MATERIAL_DIVISION_LABEL[result.request.division as MaterialDivision]} dikirim gudang`,
      body: `${result.request.doc} — cek & tekan Terima di Minta Bahan.`,
      url: "/os",
      dedupKey: `mrq-sent:${result.request.id}`,
    });
    if (result.shortCount) {
      await notify(actor.outletId, {
        audience: "management",
        severity: "warning",
        title: `${result.shortCount} bahan kurang di gudang — perlu dibeli`,
        body: `${result.request.doc}: buat PO dari menu Purchase Order → Kekurangan Bar/Dapur.`,
        url: "/warehouse/purchase-orders",
        dedupKey: `mrq-short:${result.request.id}`,
      });
    }
  }
  return result?.request ?? null;
}

/**
 * Divisi konfirmasi diterima (stok sudah pindah saat dikirim). M6: baris yang datang
 * KURANG dari kiriman → selisih dikembalikan ke catatan stok gudang (barang tidak sampai
 * ruang) dan Manajer diberi peringatan untuk cek gudang. Tidak membuat PO otomatis —
 * barangnya mungkin masih di gudang (hindari beli dobel).
 */
export async function receiveMaterialRequest(
  id: string,
  input: { note?: string; lines?: Array<{ itemId: string; receivedQty: number }> },
  actor: { userId: string | null; outletId?: string | null },
) {
  const result = await runInTx(async (tx) => {
    const [request] = await tx.select().from(wmsMaterialRequest).where(eq(wmsMaterialRequest.id, id)).for("update").limit(1);
    if (!request) return null;
    if (request.status !== "sent") throw new Error(request.status === "received" ? "Sudah dikonfirmasi diterima." : "Bahan belum dikirim gudang.");
    const note = input.note?.trim() ?? "";
    const items = await tx.select().from(wmsMaterialRequestItem).where(eq(wmsMaterialRequestItem.requestId, id));
    const receivedBy = new Map((input.lines ?? []).map((l) => [l.itemId, l.receivedQty]));
    const discrepancies: Array<{ name: string; sent: number; received: number }> = [];
    for (const item of items) {
      if (!receivedBy.has(item.id)) continue;
      const sent = Number(item.sentQty);
      const received = round4(Math.max(0, Math.min(sent, Number(receivedBy.get(item.id)))));
      const diff = receiveShortfall(sent, received);
      await tx.update(wmsMaterialRequestItem).set({ receivedQty: received }).where(eq(wmsMaterialRequestItem.id, item.id));
      if (!(diff > 0)) continue;
      const [prod] = await tx.select({ hpp: wmsProduct.hpp, name: wmsProduct.name }).from(wmsProduct).where(eq(wmsProduct.id, item.productId)).limit(1);
      if (!request.warehouseId || !request.sourceWarehouseId) throw new Error("Ruang tujuan / gudang sumber belum lengkap.");
      try {
        await moveStockBetweenWarehouses(tx, {
          outType: "internal_out",
          productId: item.productId,
          fromWarehouseId: request.warehouseId,
          toWarehouseId: request.sourceWarehouseId,
          qty: diff,
          fallbackHpp: Number(prod?.hpp ?? 0),
          refDoc: `${request.doc} SELISIH TERIMA`,
          userId: actor.userId,
        });
      } catch (error) {
        throw new Error(
          `${prod?.name ?? "Bahan"}: stok ruang sudah terpakai sehingga selisih tidak bisa dikembalikan otomatis — koreksi lewat stock opname. (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      discrepancies.push({ name: prod?.name ?? "Bahan", sent, received });
    }
    const [updated] = await tx
      .update(wmsMaterialRequest)
      .set({ status: "received", receivedBy: actor.userId, receivedAt: new Date(), receiveNote: note })
      .where(eq(wmsMaterialRequest.id, id))
      .returning();
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: discrepancies.length ? "Permintaan bahan diterima dengan selisih" : "Permintaan bahan diterima divisi",
      object: request.doc,
      status: note || discrepancies.length ? "warning" : "recorded",
      metadata: { note, discrepancies },
    });
    return { request: updated, discrepancies };
  });
  if (result?.discrepancies.length) {
    await notify(actor.outletId ?? null, {
      audience: "management",
      severity: "warning",
      title: `Selisih terima ${result.request.doc}`,
      body: result.discrepancies.map((d) => `${d.name}: kirim ${d.sent}, terima ${d.received}`).join("; ") + " — cek gudang.",
      url: "/warehouse/material-requests",
      dedupKey: `mrq-diff:${result.request.id}`,
    });
  }
  return result?.request ?? null;
}

/** Batal sebelum dikirim (peminta sendiri atau Owner/Manajer). */
export async function cancelMaterialRequest(id: string, actor: { userId: string | null; elevated: boolean }) {
  return runInTx(async (tx) => {
    const [request] = await tx.select().from(wmsMaterialRequest).where(eq(wmsMaterialRequest.id, id)).for("update").limit(1);
    if (!request) return null;
    if (request.status !== "submitted") throw new Error("Hanya permintaan yang belum dikirim yang bisa dibatalkan.");
    if (!actor.elevated && request.requestedBy !== actor.userId) throw new Error("Hanya peminta atau manajer yang bisa membatalkan.");
    const [updated] = await tx.update(wmsMaterialRequest).set({ status: "cancelled" }).where(eq(wmsMaterialRequest.id, id)).returning();
    await writeWmsAudit(tx, { userId: actor.userId, action: "Permintaan bahan dibatalkan", object: request.doc });
    return updated;
  });
}

/** Kekurangan terbuka (belum dibuatkan PO), dijumlah per bahan. `lock` = kunci baris (klaim). */
export async function listMaterialShortages(db: Db = getDb(), opts: { lock?: boolean } = {}) {
  const query = db
    .select({
      itemId: wmsMaterialRequestItem.id,
      productId: wmsMaterialRequestItem.productId,
      shortQty: wmsMaterialRequestItem.shortQty,
      doc: wmsMaterialRequest.doc,
      division: wmsMaterialRequest.division,
      name: wmsProduct.name,
      unit: wmsProduct.unit,
    })
    .from(wmsMaterialRequestItem)
    .innerJoin(wmsMaterialRequest, eq(wmsMaterialRequest.id, wmsMaterialRequestItem.requestId))
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsMaterialRequestItem.productId))
    .where(and(gt(wmsMaterialRequestItem.shortQty, 0), isNull(wmsMaterialRequestItem.purchaseOrderId), inArray(wmsMaterialRequest.status, ["sent", "received"])));
  const rows = opts.lock ? await query.for("update", { of: wmsMaterialRequestItem }) : await query;
  const byProduct = new Map<string, { productId: string; name: string; unit: string; qty: number; docs: string[]; refs: string[]; itemIds: string[] }>();
  for (const r of rows) {
    const cur = byProduct.get(r.productId) ?? { productId: r.productId, name: r.name, unit: r.unit, qty: 0, docs: [], refs: [], itemIds: [] };
    cur.qty = round4(cur.qty + Number(r.shortQty));
    if (!cur.docs.includes(r.doc)) cur.docs.push(r.doc);
    // Asal kebutuhan per divisi ikut ke baris PO (tidak hilang walau digabung per supplier).
    const ref = `${r.doc} · ${MATERIAL_DIVISION_LABEL[r.division as MaterialDivision] ?? r.division} ${round4(Number(r.shortQty))} ${r.unit}`;
    if (!cur.refs.includes(ref)) cur.refs.push(ref);
    cur.itemIds.push(r.itemId);
    byProduct.set(r.productId, cur);
  }
  const prices = await getSupplierPriceHistory([...byProduct.keys()], db);
  const uoms = await loadProductUoms([...byProduct.keys()], db);
  // Supplier: utama di Master Data (atau link "utama") dulu, baru supplier penerimaan terakhir.
  const { preferredSupplierFor } = await import("@/lib/wms-procurement");
  const preferred = await preferredSupplierFor(db, [...byProduct.keys()]);
  const supplierRows = await db.select({ id: wmsSupplier.id, name: wmsSupplier.name }).from(wmsSupplier);
  const supplierName = new Map(supplierRows.map((x) => [x.id, x.name]));
  return [...byProduct.values()]
    .map((s) => {
      const history = prices.filter((p) => p.productId === s.productId).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
      const pick = preferred.get(s.productId);
      const supplierId = pick?.supplierId ?? history[0]?.supplierId ?? null;
      const sameSupplier = history.find((h) => h.supplierId === supplierId);
      const lastPrice = pick?.refPrice ?? sameSupplier?.lastPrice ?? (pick ? null : (history[0]?.lastPrice ?? null));
      return {
        ...s,
        uoms: uoms.get(s.productId) ?? [],
        supplierId,
        supplier: supplierId ? (supplierName.get(supplierId) ?? history[0]?.supplier ?? null) : null,
        lastPrice,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/**
 * Kekurangan → PO draft per supplier terakhir. Klaim baris (FOR UPDATE) + buat PO +
 * tautkan dalam satu transaksi: klik bersamaan tidak bisa membeli kekurangan yang sama dua kali.
 */
export async function createPurchaseOrdersFromShortages(userId?: string | null) {
  return runInTx(async (tx) => {
    const shortages = await listMaterialShortages(tx, { lock: true });
    const bySupplier = new Map<string, typeof shortages>();
    const skipped: string[] = [];
    for (const s of shortages) {
      if (!s.supplierId) {
        skipped.push(s.name);
        continue;
      }
      bySupplier.set(s.supplierId, [...(bySupplier.get(s.supplierId) ?? []), s]);
    }
    const created = [];
    for (const [supplierId, list] of bySupplier) {
      const po = await createPurchaseOrderInTx(
        tx,
        { supplierId, note: `Kekurangan permintaan Bar/Dapur: ${[...new Set(list.flatMap((s) => s.docs))].join(", ")}`, items: list.map((s) => ({ productId: s.productId, orderedQty: s.qty, unitPrice: s.lastPrice ?? 0, sourceRefs: s.refs })) },
        userId,
      );
      await tx
        .update(wmsMaterialRequestItem)
        .set({ purchaseOrderId: po.id })
        .where(and(inArray(wmsMaterialRequestItem.id, list.flatMap((s) => s.itemIds)), isNull(wmsMaterialRequestItem.purchaseOrderId)));
      created.push(po);
    }
    return { created, skipped };
  });
}

// ---------------------------------------------------------------------------
// M4: paket permintaan rutin ("Buka toko Bar", "Persiapan malam") per outlet.
// Disimpan di app_settings (tanpa tabel baru): { bar: Template[], dapur: Template[] }.
// ---------------------------------------------------------------------------

export type MaterialTemplate = { name: string; items: Array<{ productId: string; qty: number }> };
const TEMPLATE_KEY = "wms:material-templates";
type TemplateStore = Partial<Record<MaterialDivision, MaterialTemplate[]>>;

async function readTemplates(outletId: string | null): Promise<TemplateStore> {
  if (!outletId) return {};
  const [row] = await getDb()
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(and(eq(appSettings.outletId, outletId), eq(appSettings.key, TEMPLATE_KEY)))
    .limit(1);
  return (row?.valueJson as TemplateStore | undefined) ?? {};
}

export async function listMaterialTemplates(division: MaterialDivision, outletId: string | null) {
  return (await readTemplates(outletId))[division] ?? [];
}

/** Simpan / timpa paket bernama sama. Item qty ≤ 0 dibuang; maks. 12 paket per divisi. */
export async function saveMaterialTemplate(
  division: MaterialDivision,
  template: MaterialTemplate,
  actor: { userId: string | null; outletId: string | null },
) {
  if (!actor.outletId) throw new Error("Outlet akun tidak dikenal.");
  const name = template.name.trim().slice(0, 40);
  if (!name) throw new Error("Nama paket wajib diisi.");
  const items = template.items.filter((i) => i.qty > 0).map((i) => ({ productId: i.productId, qty: round4(i.qty) }));
  if (!items.length) throw new Error("Paket harus berisi minimal satu bahan.");
  const store = await readTemplates(actor.outletId);
  const list = (store[division] ?? []).filter((t) => t.name.toLowerCase() !== name.toLowerCase());
  if (list.length >= 12) throw new Error("Maksimal 12 paket per divisi.");
  const next: TemplateStore = { ...store, [division]: [...list, { name, items }] };
  return writeTemplates(next, actor, division);
}

export async function deleteMaterialTemplate(division: MaterialDivision, name: string, actor: { userId: string | null; outletId: string | null }) {
  if (!actor.outletId) throw new Error("Outlet akun tidak dikenal.");
  const store = await readTemplates(actor.outletId);
  const next: TemplateStore = { ...store, [division]: (store[division] ?? []).filter((t) => t.name.toLowerCase() !== name.trim().toLowerCase()) };
  return writeTemplates(next, actor, division);
}

async function writeTemplates(next: TemplateStore, actor: { userId: string | null; outletId: string | null }, division: MaterialDivision) {
  const updatedAt = new Date();
  await getDb()
    .insert(appSettings)
    .values({ outletId: actor.outletId, key: TEMPLATE_KEY, valueJson: next, updatedBy: actor.userId, updatedAt })
    .onConflictDoUpdate({ target: [appSettings.outletId, appSettings.key], set: { valueJson: next, updatedBy: actor.userId, updatedAt } });
  return next[division] ?? [];
}
