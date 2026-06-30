import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  wmsBatch,
  wmsProduct,
  wmsReceiving,
  wmsReceivingItem,
  wmsStockMovement,
  wmsWarehouse,
  wmsWarehouseStock,
} from "@/db/schema";
import {
  WMS_DEFAULT_WAREHOUSES,
  stockStatus,
  type MoveType,
  type WmsDashboard,
  type WmsProductRow,
  type WmsWarehouse,
} from "@/lib/wms-types";

// =============================================================================
// GARAGE WMS — service layer. Aturan inti: SEMUA mutasi stok lewat
// recordStockMovement() (tulis ledger + update wms_warehouse_stock). HPP/nilai
// dihitung saat query, bukan disimpan turunannya.
// =============================================================================

type Db = ReturnType<typeof getDb>;

/** Mutasi stok terpusat: ledger + upsert stok (anti-minus). deltaQty bertanda. */
export async function recordStockMovement(
  db: Db,
  input: {
    type: MoveType;
    productId: string;
    warehouseId: string;
    deltaQty: number; // + masuk, - keluar
    hpp: number;
    refDoc?: string;
    userId?: string | null;
  },
) {
  await db.insert(wmsStockMovement).values({
    type: input.type,
    productId: input.productId,
    warehouseId: input.warehouseId,
    qty: input.deltaQty,
    valueHpp: Math.abs(input.deltaQty) * input.hpp,
    refDoc: input.refDoc ?? "",
    userId: input.userId ?? null,
  });

  await db
    .insert(wmsWarehouseStock)
    .values({ productId: input.productId, warehouseId: input.warehouseId, qty: Math.max(0, input.deltaQty) })
    .onConflictDoUpdate({
      target: [wmsWarehouseStock.productId, wmsWarehouseStock.warehouseId],
      set: {
        qty: sql`GREATEST(0, ${wmsWarehouseStock.qty} + ${input.deltaQty})`,
        updatedAt: new Date(),
      },
    });
}

/** Self-healing seed: warehouse default + contoh produk + stok awal. */
export async function ensureWmsSeeded() {
  const db = getDb();
  const existingWh = await db.select({ code: wmsWarehouse.code }).from(wmsWarehouse);
  const existingCodes = new Set(existingWh.map((w) => w.code));
  const missingWh = WMS_DEFAULT_WAREHOUSES.filter((w) => !existingCodes.has(w.code));
  if (missingWh.length) {
    await db.insert(wmsWarehouse).values(missingWh).onConflictDoNothing();
  }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(wmsProduct);
  if (Number(n) > 0) return;

  const [main] = await db
    .select()
    .from(wmsWarehouse)
    .where(eq(wmsWarehouse.isPrimary, true))
    .limit(1);
  if (!main) return;

  // Contoh bahan F&B (sku, nama, kategori, unit, min, hpp, stok awal).
  const samples: Array<[string, string, string, string, number, number, number]> = [
    ["BEAN-ARB", "Kopi Arabika", "Bahan Bar", "gram", 2000, 0.12, 8000],
    ["MILK-FC", "Susu Full Cream", "Bahan Bar", "ml", 5000, 0.018, 12000],
    ["SUGAR-PALM", "Gula Aren Cair", "Bahan Bar", "ml", 1000, 0.05, 1500],
    ["CUP-16", "Gelas Plastik 16oz", "Kemasan", "pcs", 300, 650, 240],
    ["RICE", "Beras", "Bahan Dapur", "gram", 10000, 0.013, 25000],
    ["CHICK", "Ayam Fillet", "Bahan Dapur", "gram", 3000, 0.045, 1200],
    ["OIL", "Minyak Goreng", "Bahan Dapur", "ml", 2000, 0.02, 6000],
    ["SYR-CARAMEL", "Sirup Caramel", "Bahan Bar", "ml", 500, 0.09, 300],
  ];

  for (const [sku, name, category, unit, minStock, hpp, initial] of samples) {
    const [prod] = await db
      .insert(wmsProduct)
      .values({ sku, name, category, unit, minStock, hpp })
      .returning();
    if (initial > 0) {
      await recordStockMovement(db, {
        type: "in",
        productId: prod.id,
        warehouseId: main.id,
        deltaQty: initial,
        hpp,
        refDoc: "SEED",
      });
    }
  }
}

export async function listWmsWarehouses(): Promise<WmsWarehouse[]> {
  await ensureWmsSeeded();
  const rows = await getDb().select().from(wmsWarehouse).orderBy(desc(wmsWarehouse.isPrimary), wmsWarehouse.code);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type as WmsWarehouse["type"],
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

export async function getWmsProducts(params?: {
  search?: string;
  category?: string;
  warehouseId?: string;
}): Promise<WmsProductRow[]> {
  await ensureWmsSeeded();
  const db = getDb();
  const whId = params?.warehouseId ?? (await primaryWarehouseId(db));

  const filters = [];
  if (params?.category && params.category !== "all") {
    filters.push(eq(wmsProduct.category, params.category));
  }
  if (params?.search) {
    const s = `%${params.search.trim()}%`;
    filters.push(or(ilike(wmsProduct.sku, s), ilike(wmsProduct.name, s), ilike(wmsProduct.category, s)));
  }

  const rows = await db
    .select({
      id: wmsProduct.id,
      sku: wmsProduct.sku,
      name: wmsProduct.name,
      category: wmsProduct.category,
      unit: wmsProduct.unit,
      minStock: wmsProduct.minStock,
      hpp: wmsProduct.hpp,
      onHand: sql<number>`coalesce(${wmsWarehouseStock.qty}, 0)`,
    })
    .from(wmsProduct)
    .leftJoin(
      wmsWarehouseStock,
      and(
        eq(wmsWarehouseStock.productId, wmsProduct.id),
        whId ? eq(wmsWarehouseStock.warehouseId, whId) : sql`false`,
      ),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(wmsProduct.category, wmsProduct.name);

  return rows.map((r) => ({
    ...r,
    onHand: Number(r.onHand),
    status: stockStatus(Number(r.onHand), r.minStock),
  }));
}

export async function createWmsProduct(
  input: {
    sku: string;
    name: string;
    category: string;
    unit: string;
    minStock?: number;
    hpp?: number;
  },
  userId?: string | null,
) {
  const db = getDb();
  const [prod] = await db
    .insert(wmsProduct)
    .values({
      sku: input.sku.trim(),
      name: input.name.trim(),
      category: input.category.trim(),
      unit: input.unit.trim(),
      minStock: input.minStock ?? 0,
      hpp: input.hpp ?? 0,
    })
    .returning();
  void userId;
  return prod;
}

export async function getWmsDashboard(params?: { warehouseId?: string }): Promise<WmsDashboard> {
  await ensureWmsSeeded();
  const db = getDb();
  const whId = params?.warehouseId ?? (await primaryWarehouseId(db));

  const products = await getWmsProducts({ warehouseId: whId ?? undefined });
  const lowStock = products.filter((p) => p.status === "low").length;
  const outOfStock = products.filter((p) => p.status === "out").length;
  const stockValue = Math.round(products.reduce((s, p) => s + p.onHand * p.hpp, 0));

  // Pergerakan hari ini.
  const [{ today }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(wmsStockMovement)
    .where(sql`${wmsStockMovement.createdAt} >= now() - interval '1 day'`);

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

function makeWmsDoc(prefix: string) {
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
};

export async function createReceiving(
  input: {
    supplier?: string;
    warehouseId?: string;
    items: ReceivingItemInput[];
  },
  userId?: string | null,
) {
  const db = getDb();
  const whId = input.warehouseId ?? (await primaryWarehouseId(db));
  const [rec] = await db
    .insert(wmsReceiving)
    .values({
      doc: makeWmsDoc("RCV"),
      supplier: input.supplier?.trim() ?? "",
      warehouseId: whId,
      status: "draft",
      createdBy: userId ?? null,
    })
    .returning();

  if (input.items.length) {
    await db.insert(wmsReceivingItem).values(
      input.items.map((it) => ({
        receivingId: rec.id,
        productId: it.productId,
        orderedQty: it.orderedQty,
        receivedQty: it.receivedQty,
        hpp: it.hpp,
        qc: it.qc ?? "pass",
        batchNo: it.batchNo ?? null,
        expiredAt: it.expiredAt ? new Date(it.expiredAt) : null,
      })),
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
      sku: wmsProduct.sku,
      unit: wmsProduct.unit,
      orderedQty: wmsReceivingItem.orderedQty,
      receivedQty: wmsReceivingItem.receivedQty,
      hpp: wmsReceivingItem.hpp,
      qc: wmsReceivingItem.qc,
      batchNo: wmsReceivingItem.batchNo,
      expiredAt: wmsReceivingItem.expiredAt,
    })
    .from(wmsReceivingItem)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsReceivingItem.productId))
    .where(eq(wmsReceivingItem.receivingId, id));
  return {
    id: rec.id,
    doc: rec.doc,
    supplier: rec.supplier,
    warehouseId: rec.warehouseId,
    status: rec.status,
    createdAt: rec.createdAt.toISOString(),
    items: items.map((it) => ({
      ...it,
      expiredAt: it.expiredAt ? it.expiredAt.toISOString() : null,
    })),
  };
}

/** Selesaikan receiving: hanya item QC pass yang diterima → +stok +batch +HPP avg. */
export async function completeReceiving(id: string, userId?: string | null) {
  const db = getDb();
  const [rec] = await db.select().from(wmsReceiving).where(eq(wmsReceiving.id, id)).limit(1);
  if (!rec) return null;
  if (rec.status === "completed") return rec; // idempoten
  const whId = rec.warehouseId;
  if (!whId) throw new Error("Receiving tanpa warehouse tidak bisa diselesaikan.");

  const items = await db
    .select()
    .from(wmsReceivingItem)
    .where(eq(wmsReceivingItem.receivingId, id));

  for (const it of items) {
    if (!it.productId) continue;
    if (it.qc === "reject") continue;
    const qty = Number(it.receivedQty);
    if (qty <= 0) continue;

    // HPP rata-rata tertimbang (berdasarkan total stok lama).
    const [prod] = await db.select().from(wmsProduct).where(eq(wmsProduct.id, it.productId)).limit(1);
    if (prod) {
      const oldQty = await totalOnHand(db, it.productId);
      const oldValue = oldQty * Number(prod.hpp);
      const newQty = oldQty + qty;
      const newHpp = newQty > 0 ? (oldValue + qty * Number(it.hpp)) / newQty : Number(it.hpp);
      await db
        .update(wmsProduct)
        .set({ hpp: newHpp, updatedAt: new Date() })
        .where(eq(wmsProduct.id, it.productId));
    }

    // Buat batch (FEFO).
    await db.insert(wmsBatch).values({
      productId: it.productId,
      warehouseId: whId,
      batchNo: it.batchNo ?? makeWmsDoc("BATCH"),
      expiredAt: it.expiredAt ?? null,
      qty,
      hpp: Number(it.hpp),
      location: "",
    });

    // +stok + ledger.
    await recordStockMovement(db, {
      type: "in",
      productId: it.productId,
      warehouseId: whId,
      deltaQty: qty,
      hpp: Number(it.hpp),
      refDoc: rec.doc,
      userId: userId ?? null,
    });
  }

  const [updated] = await db
    .update(wmsReceiving)
    .set({ status: "completed" })
    .where(eq(wmsReceiving.id, id))
    .returning();
  return updated;
}
