import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { wmsBatch, wmsProduct, wmsWarehouse, wmsWarehouseStock, wmsWaste } from "@/db/schema";
import { makeWmsDoc, recordStockMovement, runInTx, writeWmsAudit } from "@/lib/wms-service";

// =============================================================================
// GARAGE WMS — Waste / write-off (ala ERPNext Stock Entry "Material Issue").
// Bahan rusak, kedaluwarsa, tumpah, atau susut prep keluar dari stok dengan alasan
// tercatat. Staf outlet boleh mencatat; nilai ≥ ambang menunggu Owner/Manajer
// (status pending_approval, stok belum berubah). Hanya "recorded" memotong stok.
// Biaya bahan sudah diakui saat belanja (cogsBasis purchase) → waste tidak membuat
// expense baru; nilainya tampil di laporan sebagai kerugian bahan.
// =============================================================================

export const WMS_WASTE_REASONS = {
  expired: "Kedaluwarsa",
  damaged: "Rusak / basi",
  spill: "Tumpah / jatuh",
  prep_loss: "Susut persiapan",
  other: "Lainnya",
} as const;

export type WmsWasteReason = keyof typeof WMS_WASTE_REASONS;

/** Nilai waste staf non-manajer ≥ ini butuh approval. */
export const WMS_WASTE_APPROVAL_THRESHOLD = 50_000;

export type WmsWasteRow = typeof wmsWaste.$inferSelect & {
  productName: string | null;
  sku: string | null;
  warehouseName: string | null;
  batchNo: string | null;
};

async function estimateValue(tx: ReturnType<typeof getDb>, productId: string, qty: number, batchId?: string | null) {
  if (batchId) {
    const [batch] = await tx.select({ hpp: wmsBatch.hpp }).from(wmsBatch).where(eq(wmsBatch.id, batchId)).limit(1);
    if (batch) return qty * Number(batch.hpp);
  }
  const [prod] = await tx.select({ hpp: wmsProduct.hpp }).from(wmsProduct).where(eq(wmsProduct.id, productId)).limit(1);
  return qty * Number(prod?.hpp ?? 0);
}

async function postWaste(tx: ReturnType<typeof getDb>, row: typeof wmsWaste.$inferSelect, userId: string | null) {
  if (!row.productId || !row.warehouseId) throw new Error("Bahan / ruang waste tidak lengkap.");
  const [prod] = await tx.select({ hpp: wmsProduct.hpp }).from(wmsProduct).where(eq(wmsProduct.id, row.productId)).limit(1);
  const { cost } = await recordStockMovement(tx, {
    type: "waste",
    productId: row.productId,
    warehouseId: row.warehouseId,
    deltaQty: -Number(row.qty),
    hpp: Number(prod?.hpp ?? 0),
    refDoc: row.doc,
    userId,
    batchId: row.batchId ?? undefined,
    pick: "expired_first",
  });
  return Math.round(cost * 100) / 100;
}

export async function recordWmsWaste(
  input: {
    warehouseId: string;
    productId: string;
    qty: number;
    reason: WmsWasteReason;
    note?: string;
    batchId?: string | null;
  },
  actor: { userId: string | null; name: string; elevated: boolean },
) {
  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error("Jumlah waste harus lebih dari 0.");
  if (!(input.reason in WMS_WASTE_REASONS)) throw new Error("Alasan waste tidak dikenal.");
  const note = input.note?.trim() ?? "";
  if (input.reason === "other" && note.length < 3) throw new Error("Alasan 'Lainnya' wajib diberi keterangan.");
  return runInTx(async (tx) => {
    const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, input.productId)).limit(1);
    if (!prod) throw new Error("Bahan tidak ditemukan.");
    const [wh] = await tx.select({ id: wmsWarehouse.id }).from(wmsWarehouse).where(eq(wmsWarehouse.id, input.warehouseId)).limit(1);
    if (!wh) throw new Error("Ruang gudang tidak ditemukan.");
    if (input.batchId) {
      const [batch] = await tx
        .select({ productId: wmsBatch.productId, warehouseId: wmsBatch.warehouseId })
        .from(wmsBatch)
        .where(eq(wmsBatch.id, input.batchId))
        .limit(1);
      if (!batch || batch.productId !== input.productId || batch.warehouseId !== input.warehouseId) {
        throw new Error("Batch tidak cocok dengan bahan/ruang.");
      }
    }
    const [stock] = await tx
      .select({ qty: wmsWarehouseStock.qty })
      .from(wmsWarehouseStock)
      .where(and(eq(wmsWarehouseStock.productId, input.productId), eq(wmsWarehouseStock.warehouseId, input.warehouseId)))
      .limit(1);
    if (qty > Number(stock?.qty ?? 0)) throw new Error(`Stok ${prod.name} di ruang ini hanya ${Number(stock?.qty ?? 0)} ${prod.unit}.`);

    const estimatedValue = Math.round((await estimateValue(tx, input.productId, qty, input.batchId)) * 100) / 100;
    const needsApproval = !actor.elevated && estimatedValue >= WMS_WASTE_APPROVAL_THRESHOLD;
    const [row] = await tx
      .insert(wmsWaste)
      .values({
        doc: makeWmsDoc("WST"),
        warehouseId: input.warehouseId,
        productId: input.productId,
        batchId: input.batchId ?? null,
        qty,
        unit: prod.unit,
        reason: input.reason,
        note,
        estimatedValue,
        status: needsApproval ? "pending_approval" : "recorded",
        requestedBy: actor.userId,
        requestedByName: actor.name,
      })
      .returning();
    let saved = row;
    if (!needsApproval) {
      const value = await postWaste(tx, row, actor.userId);
      [saved] = await tx.update(wmsWaste).set({ value }).where(eq(wmsWaste.id, row.id)).returning();
    }
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: needsApproval ? "Waste diajukan" : "Waste dicatat",
      object: row.doc,
      status: "warning",
      metadata: { sku: prod.sku, qty, unit: prod.unit, reason: input.reason, note, estimatedValue, value: saved.value },
    });
    return saved;
  });
}

export async function decideWmsWaste(
  id: string,
  input: { approve: boolean; note?: string },
  actor: { userId: string | null },
) {
  const note = input.note?.trim() ?? "";
  if (!input.approve && note.length < 3) throw new Error("Alasan penolakan wajib diisi.");
  return runInTx(async (tx) => {
    const [row] = await tx.select().from(wmsWaste).where(eq(wmsWaste.id, id)).for("update").limit(1);
    if (!row) return null;
    if (row.status !== "pending_approval") throw new Error("Waste ini sudah diputuskan.");
    const value = input.approve ? await postWaste(tx, row, actor.userId) : 0;
    const [updated] = await tx
      .update(wmsWaste)
      .set({
        status: input.approve ? "recorded" : "rejected",
        value,
        decidedBy: actor.userId,
        decidedAt: new Date(),
        decisionNote: note,
      })
      .where(eq(wmsWaste.id, id))
      .returning();
    await writeWmsAudit(tx, {
      userId: actor.userId,
      action: input.approve ? "Waste disetujui" : "Waste ditolak",
      object: row.doc,
      status: input.approve ? "warning" : "recorded",
      metadata: { qty: Number(row.qty), value, note },
    });
    return updated;
  });
}

export async function listWmsWaste(filter: { from?: Date; to?: Date; status?: string; limit?: number } = {}): Promise<WmsWasteRow[]> {
  const rows = await getDb()
    .select({ waste: wmsWaste, productName: wmsProduct.name, sku: wmsProduct.sku, warehouseName: wmsWarehouse.name, batchNo: wmsBatch.batchNo })
    .from(wmsWaste)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsWaste.productId))
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsWaste.warehouseId))
    .leftJoin(wmsBatch, eq(wmsBatch.id, wmsWaste.batchId))
    .where(
      and(
        filter.from ? gte(wmsWaste.createdAt, filter.from) : undefined,
        filter.to ? lte(wmsWaste.createdAt, filter.to) : undefined,
        filter.status ? eq(wmsWaste.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(wmsWaste.createdAt))
    .limit(filter.limit ?? 200);
  return rows.map((r) => ({
    ...r.waste,
    qty: Number(r.waste.qty),
    value: Number(r.waste.value),
    estimatedValue: Number(r.waste.estimatedValue),
    productName: r.productName,
    sku: r.sku,
    warehouseName: r.warehouseName,
    batchNo: r.batchNo,
  }));
}

/** Ringkasan waste tercatat per alasan (nilai biaya aktual) untuk laporan. */
export async function summarizeWmsWaste(from: Date, to: Date) {
  const rows = await getDb()
    .select({ reason: wmsWaste.reason, count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${wmsWaste.value}),0)` })
    .from(wmsWaste)
    .where(and(eq(wmsWaste.status, "recorded"), gte(wmsWaste.createdAt, from), lte(wmsWaste.createdAt, to)))
    .groupBy(wmsWaste.reason);
  const byReason = rows.map((r) => ({
    reason: r.reason as WmsWasteReason,
    label: WMS_WASTE_REASONS[r.reason as WmsWasteReason] ?? r.reason,
    count: Number(r.count),
    value: Math.round(Number(r.value)),
  }));
  return { total: byReason.reduce((sum, r) => sum + r.value, 0), byReason };
}

/** Batch yang sudah / hampir kedaluwarsa (≤ days hari) dan masih ada stoknya. */
export async function listExpiringWmsBatches(days = 3) {
  const limit = new Date(Date.now() + days * 86_400_000);
  const rows = await getDb()
    .select({
      batchId: wmsBatch.id,
      batchNo: wmsBatch.batchNo,
      expiredAt: wmsBatch.expiredAt,
      qty: wmsBatch.qty,
      hpp: wmsBatch.hpp,
      productId: wmsProduct.id,
      productName: wmsProduct.name,
      sku: wmsProduct.sku,
      unit: wmsProduct.unit,
      warehouseId: wmsWarehouse.id,
      warehouseName: wmsWarehouse.name,
    })
    .from(wmsBatch)
    .innerJoin(wmsProduct, eq(wmsProduct.id, wmsBatch.productId))
    .innerJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsBatch.warehouseId))
    .where(and(sql`${wmsBatch.qty} > 0`, sql`${wmsBatch.expiredAt} is not null`, lte(wmsBatch.expiredAt, limit)))
    .orderBy(wmsBatch.expiredAt);
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    qty: Number(r.qty),
    value: Math.round(Number(r.qty) * Number(r.hpp)),
    expired: !!r.expiredAt && r.expiredAt.getTime() < now,
  }));
}
