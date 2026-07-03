import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  wmsBatch,
  wmsBomItem,
  wmsColdChainReading,
  wmsInternalOrder,
  wmsInternalOrderItem,
  wmsOpnameLine,
  wmsProduct,
  wmsReceiving,
  wmsReceivingItem,
  wmsRecipe,
  wmsStockMovement,
  wmsStockOpname,
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
// Transaksi Drizzle memakai API query yang sama dengan koneksi utama; kita cukup
// menerima keduanya lewat tipe Db supaya fungsi mutasi bisa dijalankan atomik.
type Tx = Db;

/** Jalankan fn dalam transaksi (atomic). Semua mutasi stok wajib lewat sini. */
export function runInTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (getDb() as Db).transaction(fn as never) as Promise<T>;
}

/** Konsumsi qty dari batch FEFO (expired terdekat dulu) → kembalikan biaya aktual. */
async function consumeBatchesFefo(
  tx: Tx,
  productId: string,
  warehouseId: string,
  qty: number,
  fallbackHpp: number,
): Promise<number> {
  const batches = await tx
    .select()
    .from(wmsBatch)
    .where(
      and(
        eq(wmsBatch.productId, productId),
        eq(wmsBatch.warehouseId, warehouseId),
        sql`${wmsBatch.qty} > 0`,
      ),
    )
    .orderBy(sql`${wmsBatch.expiredAt} ASC NULLS LAST`, wmsBatch.receivedAt);

  let remaining = qty;
  let cost = 0;
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(Number(b.qty), remaining);
    if (take <= 0) continue;
    cost += take * Number(b.hpp);
    remaining -= take;
    await tx
      .update(wmsBatch)
      .set({ qty: Number(b.qty) - take })
      .where(eq(wmsBatch.id, b.id));
  }
  // Batch kurang dari permintaan (mis. stok awal tanpa batch) → sisanya pakai HPP produk.
  if (remaining > 0) cost += remaining * fallbackHpp;
  return cost;
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
    expiredAt?: Date | null;
  },
): Promise<{ cost: number }> {
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
  const next = current + delta;
  if (next < 0) {
    throw new Error(`Stok tidak cukup (tersedia ${current}, diminta ${-delta}).`);
  }

  let cost: number;
  if (delta < 0) {
    cost = await consumeBatchesFefo(tx, input.productId, input.warehouseId, -delta, input.hpp);
  } else {
    cost = delta * input.hpp;
    if (delta > 0) {
      await tx.insert(wmsBatch).values({
        productId: input.productId,
        warehouseId: input.warehouseId,
        batchNo: input.batchNo ?? makeWmsDoc("BATCH"),
        expiredAt: input.expiredAt ?? null,
        qty: delta,
        hpp: input.hpp,
        location: "",
      });
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
  return { cost };
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

async function doEnsureWmsSeeded() {
  const db = getDb();
  const existingWh = await db.select({ code: wmsWarehouse.code }).from(wmsWarehouse);
  const existingCodes = new Set(existingWh.map((w) => w.code));
  const missingWh = WMS_DEFAULT_WAREHOUSES.filter((w) => !existingCodes.has(w.code));
  if (missingWh.length) {
    await db.insert(wmsWarehouse).values(missingWh).onConflictDoNothing();
  }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(wmsProduct);
  if (Number(n) > 0) return;

  // Contoh produk hanya untuk dev/test/demo — JANGAN cemari gudang produksi.
  const allowSampleData =
    process.env.NODE_ENV !== "production" || process.env.GARAGE_SEED_DEMO === "true";
  if (!allowSampleData) return;

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
      // recordStockMovement kini membuat batch awal sendiri (FEFO) — atomik.
      await runInTx((tx) =>
        recordStockMovement(tx, {
          type: "in",
          productId: prod.id,
          warehouseId: main.id,
          deltaQty: initial,
          hpp,
          refDoc: "SEED",
          batchNo: `SEED-${sku}`,
        }),
      );
    }
  }
}

export async function listWmsWarehouses(opts?: {
  allowedTypes?: WmsWarehouse["type"][] | "all";
}): Promise<WmsWarehouse[]> {
  await ensureWmsSeeded();
  const rows = await getDb().select().from(wmsWarehouse).orderBy(desc(wmsWarehouse.isPrimary), wmsWarehouse.code);
  const allowed = opts?.allowedTypes;
  return rows
    .filter((r) => !allowed || allowed === "all" || allowed.includes(r.type as WmsWarehouse["type"]))
    .map((r) => ({
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
  archived?: "active" | "archived";
}): Promise<WmsProductRow[]> {
  await ensureWmsSeeded();
  const db = getDb();
  const whId = params?.warehouseId ?? (await primaryWarehouseId(db));

  // Default hanya produk aktif; "archived" menampilkan yang terarsip (untuk restore).
  const filters = [
    params?.archived === "archived"
      ? sql`${wmsProduct.archivedAt} is not null`
      : sql`${wmsProduct.archivedAt} is null`,
  ];
  if (params?.category && params.category !== "all") {
    filters.push(eq(wmsProduct.category, params.category));
  }
  if (params?.search) {
    const s = `%${params.search.trim()}%`;
    filters.push(
      or(
        ilike(wmsProduct.sku, s),
        ilike(wmsProduct.name, s),
        ilike(wmsProduct.category, s),
        ilike(wmsProduct.barcode, s),
      )!,
    );
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
      imageUrl: wmsProduct.imageUrl,
      barcode: wmsProduct.barcode,
      createdAt: wmsProduct.createdAt,
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
    .where(and(...filters))
    .orderBy(wmsProduct.category, wmsProduct.name);

  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    unit: r.unit,
    minStock: Number(r.minStock),
    hpp: Number(r.hpp),
    onHand: Number(r.onHand),
    status: stockStatus(Number(r.onHand), Number(r.minStock)),
    imageUrl: r.imageUrl ?? null,
    barcode: r.barcode ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Update field produk (nama/kategori/satuan/min/hpp/gambar/barcode/restore). */
export async function updateWmsProduct(
  id: string,
  patch: {
    name?: string;
    category?: string;
    unit?: string;
    minStock?: number;
    hpp?: number;
    imageUrl?: string | null;
    barcode?: string | null;
    archivedAt?: Date | null; // set null = restore dari arsip
  },
) {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.category !== undefined) set.category = patch.category.trim();
  if (patch.unit !== undefined) set.unit = patch.unit.trim();
  if (patch.minStock !== undefined) set.minStock = patch.minStock;
  if (patch.hpp !== undefined) set.hpp = patch.hpp;
  if (patch.imageUrl !== undefined) set.imageUrl = patch.imageUrl;
  if (patch.barcode !== undefined) set.barcode = patch.barcode ? patch.barcode.trim() : null;
  if (patch.archivedAt !== undefined) set.archivedAt = patch.archivedAt;
  const [row] = await db.update(wmsProduct).set(set).where(eq(wmsProduct.id, id)).returning();
  return row ?? null;
}

/** Soft-delete (arsip): produk hilang dari daftar tapi riwayat ledger tetap ada. */
export async function archiveWmsProduct(id: string) {
  const db = getDb();
  const [row] = await db
    .update(wmsProduct)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(wmsProduct.id, id))
    .returning();
  return row ?? null;
}

export async function createWmsProduct(
  input: {
    sku: string;
    name: string;
    category: string;
    unit: string;
    minStock?: number;
    hpp?: number;
    barcode?: string | null;
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
      barcode: input.barcode?.trim() || null,
      createdBy: userId ?? null,
    })
    .returning();
  return prod;
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
] as const;

export async function exportWmsProductsWorkbook(opts?: { template?: boolean }): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produk");
  ws.columns = WMS_EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };

  if (opts?.template) {
    ws.addRow({ sku: "BAR-001", name: "Contoh: Kopi Arabika", category: "Bahan Bar", unit: "gram", minStock: 2000, hpp: 0.12, onHand: 0, barcode: "" });
  } else {
    for (const p of await getWmsProducts()) {
      ws.addRow({ sku: p.sku, name: p.name, category: p.category, unit: p.unit, minStock: p.minStock, hpp: p.hpp, onHand: p.onHand, barcode: p.barcode ?? "" });
    }
  }
  // Catatan: kolom "Stok" hanya informasi — diabaikan saat import (stok lewat Receiving/Adjustment).
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type WmsImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  dryRun: boolean;
};

function headerKey(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("sku")) return "sku";
  if (s.includes("nama") || s === "name") return "name";
  if (s.includes("kategori") || s.includes("category")) return "category";
  if (s.includes("satuan") || s.includes("unit")) return "unit";
  if (s.includes("min")) return "minStock";
  if (s === "hpp" || s.includes("hpp") || s.includes("modal")) return "hpp";
  if (s.includes("barcode")) return "barcode";
  if (s.includes("stok") || s.includes("stock")) return "onHand"; // diabaikan
  return null;
}

function cellNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(typeof v === "object" && v !== null && "result" in v ? (v as { result: unknown }).result : v);
  return Number.isFinite(n) ? n : undefined;
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "").trim();
  return String(v).trim();
}

/** Parse workbook → upsert by SKU (dryRun hanya menghitung, tak menulis). */
export async function importWmsProductsFromBuffer(
  buffer: Buffer,
  opts: { dryRun: boolean },
  userId?: string | null,
): Promise<WmsImportResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File Excel tidak punya sheet.");

  // Peta kolom dari baris header (baris 1).
  const colMap: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const key = headerKey(cell.value);
    if (key) colMap[key] = col;
  });
  if (colMap.sku === undefined) throw new Error("Kolom 'SKU' wajib ada di header.");

  // Produk existing (termasuk arsip — SKU unik global).
  const db = getDb();
  const existing = new Map<string, { id: string; archived: boolean }>();
  for (const r of await db
    .select({ id: wmsProduct.id, sku: wmsProduct.sku, archivedAt: wmsProduct.archivedAt })
    .from(wmsProduct)) {
    existing.set(r.sku.trim().toLowerCase(), { id: r.id, archived: !!r.archivedAt });
  }

  const result: WmsImportResult = { created: 0, updated: 0, skipped: 0, errors: [], dryRun: opts.dryRun };

  const rows: Array<{ rowNo: number; sku: string; name: string; category: string; unit: string; minStock?: number; hpp?: number; barcode: string }> = [];
  ws.eachRow((row, rowNo) => {
    if (rowNo === 1) return; // header
    const sku = cellStr(row.getCell(colMap.sku).value);
    if (!sku) return; // baris kosong → lewati diam-diam
    rows.push({
      rowNo,
      sku,
      name: colMap.name ? cellStr(row.getCell(colMap.name).value) : "",
      category: colMap.category ? cellStr(row.getCell(colMap.category).value) : "",
      unit: colMap.unit ? cellStr(row.getCell(colMap.unit).value) : "",
      minStock: colMap.minStock ? cellNum(row.getCell(colMap.minStock).value) : undefined,
      hpp: colMap.hpp ? cellNum(row.getCell(colMap.hpp).value) : undefined,
      barcode: colMap.barcode ? cellStr(row.getCell(colMap.barcode).value) : "",
    });
  });

  for (const r of rows) {
    const key = r.sku.toLowerCase();
    const hit = existing.get(key);
    if (hit) {
      // Update master (tanpa mengubah stok). Un-arsip bila sebelumnya diarsipkan.
      if (!opts.dryRun) {
        await updateWmsProduct(hit.id, {
          name: r.name || undefined,
          category: r.category || undefined,
          unit: r.unit || undefined,
          minStock: r.minStock,
          hpp: r.hpp,
          barcode: r.barcode || null,
          ...(hit.archived ? { archivedAt: null } : {}),
        });
      }
      result.updated++;
    } else {
      // Buat baru — butuh minimal nama & kategori.
      if (!r.name || !r.category) {
        result.skipped++;
        result.errors.push({ row: r.rowNo, message: `SKU ${r.sku}: Nama & Kategori wajib untuk produk baru.` });
        continue;
      }
      if (!opts.dryRun) {
        await createWmsProduct(
          {
            sku: r.sku,
            name: r.name,
            category: r.category,
            unit: r.unit || "pcs",
            minStock: r.minStock ?? 0,
            hpp: r.hpp ?? 0,
            barcode: r.barcode || null,
          },
          userId,
        );
      }
      result.created++;
    }
  }

  return result;
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
  return runInTx(async (tx) => {
    // Kunci dokumen receiving agar tidak diselesaikan dua kali secara paralel.
    const [rec] = await tx
      .select()
      .from(wmsReceiving)
      .where(eq(wmsReceiving.id, id))
      .for("update")
      .limit(1);
    if (!rec) return null;
    if (rec.status === "completed") return rec; // idempoten
    const whId = rec.warehouseId;
    if (!whId) throw new Error("Receiving tanpa warehouse tidak bisa diselesaikan.");

    const items = await tx
      .select()
      .from(wmsReceivingItem)
      .where(eq(wmsReceivingItem.receivingId, id));

    for (const it of items) {
      if (!it.productId) continue;
      if (it.qc === "reject") continue;
      const qty = Number(it.receivedQty);
      if (qty <= 0) continue;

      // HPP rata-rata tertimbang (berdasarkan total stok lama) — dihitung sebelum mutasi.
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, it.productId)).limit(1);
      if (prod) {
        const oldQty = await totalOnHand(tx, it.productId);
        const oldValue = oldQty * Number(prod.hpp);
        const newQty = oldQty + qty;
        const newHpp = newQty > 0 ? (oldValue + qty * Number(it.hpp)) / newQty : Number(it.hpp);
        await tx
          .update(wmsProduct)
          .set({ hpp: newHpp, updatedAt: new Date() })
          .where(eq(wmsProduct.id, it.productId));
      }

      // +stok + batch (FEFO) + ledger, atomik.
      await recordStockMovement(tx, {
        type: "in",
        productId: it.productId,
        warehouseId: whId,
        deltaQty: qty,
        hpp: Number(it.hpp),
        refDoc: rec.doc,
        userId: userId ?? null,
        batchNo: it.batchNo ?? undefined,
        expiredAt: it.expiredAt ?? null,
      });
    }

    const [updated] = await tx
      .update(wmsReceiving)
      .set({ status: "completed" })
      .where(eq(wmsReceiving.id, id))
      .returning();
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

export async function createInternalOrder(
  input: { outletWarehouseId: string; items: InternalOrderItemInput[]; sourceRef?: string | null },
  userId?: string | null,
) {
  return runInTx(async (tx) => {
    const source = await primaryWarehouseId(tx);
    if (!source) throw new Error("Gudang utama belum ada.");
    if (input.outletWarehouseId === source) {
      throw new Error("Outlet tujuan tidak boleh gudang utama.");
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
      // Potong stok gudang utama (internal_out, FEFO) → biaya aktual dari batch.
      const { cost } = await recordStockMovement(tx, {
        type: "internal_out",
        productId: ln.productId,
        warehouseId: source,
        deltaQty: -ln.qty,
        hpp: ln.fallbackHpp,
        refDoc: order.doc,
        userId: userId ?? null,
      });
      const unit = ln.qty > 0 ? cost / ln.qty : 0;
      // Tambah stok outlet (in) dengan HPP = biaya rata-rata batch yang dipakai.
      await recordStockMovement(tx, {
        type: "in",
        productId: ln.productId,
        warehouseId: input.outletWarehouseId,
        deltaQty: ln.qty,
        hpp: unit,
        refDoc: order.doc,
        userId: userId ?? null,
      });

      await tx.insert(wmsInternalOrderItem).values({
        orderId: order.id,
        productId: ln.productId,
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
      const { cost } = await recordStockMovement(tx, {
        type: "transfer",
        productId: ln.productId,
        warehouseId: input.fromWarehouseId,
        deltaQty: -ln.qty,
        hpp: ln.fallbackHpp,
        refDoc: doc,
        userId: userId ?? null,
      });
      const unit = ln.qty > 0 ? cost / ln.qty : 0;
      await recordStockMovement(tx, {
        type: "in",
        productId: ln.productId,
        warehouseId: input.toWarehouseId,
        deltaQty: ln.qty,
        hpp: unit,
        refDoc: doc,
        userId: userId ?? null,
      });
      total += cost;
    }
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
// FASE 4 — Recipe/BOM + Keuangan/HPP. COGS/foodCost/margin DIHITUNG saat query
// dari product.hpp → otomatis ikut saat HPP bahan berubah (receiving). Tidak disimpan.
// =============================================================================

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
    })
    .returning();
  if (input.bom.length) {
    await db.insert(wmsBomItem).values(
      input.bom.map((b) => ({ recipeId: rec.id, productId: b.productId, qty: b.qty })),
    );
  }
  return rec;
}

export async function deleteWmsRecipe(id: string) {
  const db = getDb();
  const [row] = await db.delete(wmsRecipe).where(eq(wmsRecipe.id, id)).returning();
  return row ?? null;
}

/** Recipe + COGS/foodCost/margin (dihitung dari product.hpp saat query). */
export async function listWmsRecipes() {
  const db = getDb();
  const recipes = await db.select().from(wmsRecipe).orderBy(desc(wmsRecipe.createdAt));
  const costRows = await db
    .select({
      recipeId: wmsBomItem.recipeId,
      cogs: sql<number>`coalesce(sum(${wmsBomItem.qty} * ${wmsProduct.hpp}), 0)`,
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
      category: r.category,
      yieldQty: r.yieldQty,
      sellPrice: sell,
      cogs: Math.round(cogs),
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      margin: Math.round(sell - cogs),
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
      productName: wmsProduct.name,
      unit: wmsProduct.unit,
      hpp: wmsProduct.hpp,
      qty: wmsBomItem.qty,
    })
    .from(wmsBomItem)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsBomItem.productId))
    .where(eq(wmsBomItem.recipeId, id));

  const lines = bom.map((b) => ({ ...b, lineCost: Number(b.qty) * Number(b.hpp ?? 0) }));
  const cogs = lines.reduce((s, l) => s + l.lineCost, 0);
  const sell = Number(rec.sellPrice);
  return {
    id: rec.id,
    name: rec.name,
    category: rec.category,
    yieldQty: rec.yieldQty,
    sellPrice: sell,
    cogs: Math.round(cogs),
    foodCostPct: sell > 0 ? Math.round((cogs / sell) * 1000) / 10 : 0,
    margin: Math.round(sell - cogs),
    bom: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productName ?? "-",
      unit: l.unit ?? "",
      qty: Number(l.qty),
      hpp: Number(l.hpp ?? 0),
      lineCost: Math.round(l.lineCost),
      contribPct: cogs > 0 ? Math.round((l.lineCost / cogs) * 1000) / 10 : 0,
    })),
  };
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
  if (params?.from) filters.push(sql`${wmsStockMovement.createdAt} >= ${new Date(params.from)}`);
  if (params?.to) filters.push(sql`${wmsStockMovement.createdAt} <= ${new Date(params.to)}`);
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
    return { ok: true };
  });
}

export async function createWmsOpname(warehouseId: string, userId?: string | null) {
  const db = getDb();
  const [op] = await db
    .insert(wmsStockOpname)
    .values({ doc: makeWmsDoc("OPN"), warehouseId, status: "draft", createdBy: userId ?? null })
    .returning();

  const stocks = await db
    .select({ productId: wmsWarehouseStock.productId, qty: wmsWarehouseStock.qty })
    .from(wmsWarehouseStock)
    .where(eq(wmsWarehouseStock.warehouseId, warehouseId));
  if (stocks.length) {
    await db.insert(wmsOpnameLine).values(
      stocks.map((s) => ({
        opnameId: op.id,
        productId: s.productId,
        systemQty: Number(s.qty),
        physicalQty: Number(s.qty),
      })),
    );
  }
  return op;
}

export async function getWmsOpname(id: string) {
  const db = getDb();
  const [op] = await db.select().from(wmsStockOpname).where(eq(wmsStockOpname.id, id)).limit(1);
  if (!op) return null;
  const lines = await db
    .select({
      id: wmsOpnameLine.id,
      productId: wmsOpnameLine.productId,
      productName: wmsProduct.name,
      unit: wmsProduct.unit,
      systemQty: wmsOpnameLine.systemQty,
      physicalQty: wmsOpnameLine.physicalQty,
    })
    .from(wmsOpnameLine)
    .leftJoin(wmsProduct, eq(wmsProduct.id, wmsOpnameLine.productId))
    .where(eq(wmsOpnameLine.opnameId, id));
  return {
    id: op.id,
    doc: op.doc,
    warehouseId: op.warehouseId,
    status: op.status,
    createdAt: op.createdAt.toISOString(),
    lines: lines.map((l) => ({
      ...l,
      systemQty: Number(l.systemQty),
      physicalQty: Number(l.physicalQty),
      variance: Number(l.physicalQty) - Number(l.systemQty),
    })),
  };
}

export async function listWmsOpnames() {
  const db = getDb();
  const rows = await db
    .select({
      id: wmsStockOpname.id,
      doc: wmsStockOpname.doc,
      status: wmsStockOpname.status,
      createdAt: wmsStockOpname.createdAt,
      warehouseName: wmsWarehouse.name,
      lines: sql<number>`count(${wmsOpnameLine.id})::int`,
    })
    .from(wmsStockOpname)
    .leftJoin(wmsWarehouse, eq(wmsWarehouse.id, wmsStockOpname.warehouseId))
    .leftJoin(wmsOpnameLine, eq(wmsOpnameLine.opnameId, wmsStockOpname.id))
    .groupBy(wmsStockOpname.id, wmsWarehouse.name)
    .orderBy(desc(wmsStockOpname.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    doc: r.doc,
    status: r.status,
    warehouse: r.warehouseName ?? "-",
    lines: Number(r.lines),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function saveWmsOpnameLine(lineId: string, physicalQty: number) {
  const db = getDb();
  const [row] = await db
    .update(wmsOpnameLine)
    .set({ physicalQty })
    .where(eq(wmsOpnameLine.id, lineId))
    .returning();
  return row ?? null;
}

/**
 * Finalize: setel stok ke hasil hitung fisik. Variance dihitung terhadap stok
 * LIVE saat finalize (bukan snapshot systemQty yang bisa basi bila ada mutasi
 * selama penghitungan), di dalam transaksi + kunci dokumen (anti double-finalize).
 */
export async function finalizeWmsOpname(id: string, userId?: string | null) {
  return runInTx(async (tx) => {
    const [op] = await tx
      .select()
      .from(wmsStockOpname)
      .where(eq(wmsStockOpname.id, id))
      .for("update")
      .limit(1);
    if (!op) return null;
    if (op.status === "completed") return op;
    if (!op.warehouseId) throw new Error("Opname tanpa warehouse.");

    const lines = await tx.select().from(wmsOpnameLine).where(eq(wmsOpnameLine.opnameId, id));
    for (const l of lines) {
      if (!l.productId) continue;
      // Variance vs stok LIVE — recordStockMovement mengunci baris stok, jadi
      // nilai yang dibaca di sini konsisten dengan mutasi lain.
      const liveQty = await warehouseOnHand(tx, l.productId, op.warehouseId);
      const variance = Number(l.physicalQty) - liveQty;
      // Simpan systemQty final = stok live saat rekonsiliasi (jejak audit akurat).
      await tx
        .update(wmsOpnameLine)
        .set({ systemQty: liveQty })
        .where(eq(wmsOpnameLine.id, l.id));
      if (variance === 0) continue;
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, l.productId)).limit(1);
      await recordStockMovement(tx, {
        type: "adjustment",
        productId: l.productId,
        warehouseId: op.warehouseId,
        deltaQty: variance,
        hpp: Number(prod?.hpp ?? 0),
        refDoc: `${op.doc} · opname`,
        userId: userId ?? null,
      });
    }
    const [updated] = await tx
      .update(wmsStockOpname)
      .set({ status: "completed" })
      .where(eq(wmsStockOpname.id, id))
      .returning();
    return updated;
  });
}

// =============================================================================
// FASE 6 — Smart 2026: Smart Reorder (forecast) + Cold Chain + Owner Analytics.
// =============================================================================

/** Saran reorder dari rata-rata konsumsi (out/internal_out) 30 hari terakhir. */
export async function getWmsSmartReorder() {
  const db = getDb();
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
    // Target: cukup 14 hari + buffer minStock. Saran = target - onHand (>=0).
    const target = Math.max(p.minStock, Math.ceil(avgDaily * 14));
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
          tempC: Math.round((base + (Math.random() * 2 - 1)) * 10) / 10,
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

export async function processPosSale(
  input: { items: Array<{ name: string; qty: number }>; ref?: string | null },
  userId?: string | null,
) {
  const db = getDb();
  const processed: Array<{ menu: string; io: string }> = [];
  const skipped: Array<{ menu: string; reason: string }> = [];

  // Muat semua resep sekali; cocokkan di memori (persis dulu, lalu ternormalisasi).
  const recipes = await db.select().from(wmsRecipe);
  const norm = new Map<string, typeof recipes>();
  for (const r of recipes) {
    const key = normalizeMenuName(r.name);
    const arr = norm.get(key) ?? [];
    arr.push(r);
    norm.set(key, arr);
  }

  for (const it of input.items) {
    const soldQty = Number(it.qty);
    if (soldQty <= 0) continue;

    const exact = recipes.find((r) => r.name.trim().toLowerCase() === it.name.trim().toLowerCase());
    const candidates = exact ? [exact] : (norm.get(normalizeMenuName(it.name)) ?? []);
    if (candidates.length === 0) {
      skipped.push({ menu: it.name, reason: "tanpa resep WMS" });
      continue;
    }
    if (candidates.length > 1) {
      skipped.push({ menu: it.name, reason: "resep ganda (ambigu) — tidak dipotong" });
      continue;
    }
    const rec = candidates[0];
    const bom = await db.select().from(wmsBomItem).where(eq(wmsBomItem.recipeId, rec.id));
    const items = bom
      .filter((b) => b.productId)
      .map((b) => ({ productId: b.productId as string, qty: Number(b.qty) * soldQty }));
    if (items.length === 0) {
      skipped.push({ menu: it.name, reason: "resep tanpa bahan" });
      continue;
    }

    // Outlet berdasarkan kategori resep (minuman → bar, lainnya → dapur).
    const outletType = /coffee|non.?coffee|kopi|minum|bar|drink/i.test(rec.category) ? "bar" : "kitchen";
    let [outlet] = await db.select().from(wmsWarehouse).where(eq(wmsWarehouse.type, outletType)).limit(1);
    if (!outlet) [outlet] = await db.select().from(wmsWarehouse).where(eq(wmsWarehouse.type, "bar")).limit(1);
    if (!outlet) {
      skipped.push({ menu: it.name, reason: "outlet tidak ada" });
      continue;
    }

    try {
      // Idempotensi: kunci unik per (sale, resep) → retry webhook tak dobel potong.
      const sourceRef = input.ref ? `sale:${input.ref}:${rec.id}` : null;
      const io = await createInternalOrder(
        { outletWarehouseId: outlet.id, items, sourceRef },
        userId,
      );
      processed.push({ menu: it.name, io: io.doc });
    } catch (e) {
      skipped.push({ menu: it.name, reason: e instanceof Error ? e.message : "gagal potong stok" });
    }
  }

  return { processed, skipped };
}
