import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  wmsProduct,
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
