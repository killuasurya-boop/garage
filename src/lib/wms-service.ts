import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  appSettings,
  approvals,
  inventoryItems,
  wmsBatch,
  wmsBomItem,
  wmsCategory,
  wmsChecklistRun,
  wmsChecklistRunItem,
  wmsColdChainReading,
  wmsSupplier,
  wmsInternalOrder,
  wmsInternalOrderItem,
  wmsOpnameLine,
  wmsProduct,
  wmsProductionBom,
  wmsProductionRecipe,
  wmsReceiving,
  wmsReceivingItem,
  wmsRecipe,
  wmsRecipeAuditLog,
  wmsRecipeVersion,
  wmsStockMovement,
  wmsStockOpname,
  wmsWarehouse,
  wmsWarehouseStock,
  user,
} from "@/db/schema";
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
    location?: string;
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
        location: input.location?.trim() || "",
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

/** Stok sebuah produk di SETIAP gudang/ruang (untuk panel Kelola Stok). */
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
  return warehouses.map((w) => ({
    warehouseId: w.id,
    code: w.code,
    name: w.name,
    type: w.type as WmsWarehouse["type"],
    area: w.area as WmsWarehouse["area"],
    onHand: byWh.get(w.id) ?? 0,
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
    initialStock?: number; // stok awal (opsional) → masuk ruang sesuai area kategori
    initialWarehouseId?: string | null;
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

  // Stok awal: catat masuk ke ruang gudang utama sesuai area kategori (atau dipilih).
  const initial = Number(input.initialStock ?? 0);
  if (initial > 0) {
    let target = input.initialWarehouseId ?? null;
    if (!target) {
      const [cat] = await db
        .select({ area: wmsCategory.area })
        .from(wmsCategory)
        .where(eq(wmsCategory.name, input.category.trim()))
        .limit(1);
      target = await mainWarehouseForArea(db, cat?.area ?? "umum");
    }
    if (target) {
      await runInTx((tx) =>
        recordStockMovement(tx, {
          type: "in",
          productId: prod.id,
          warehouseId: target as string,
          deltaQty: initial,
          hpp: input.hpp ?? 0,
          refDoc: "STOK-AWAL",
          userId: userId ?? null,
          batchNo: `INIT-${prod.sku.trim()}`,
        }),
      );
    }
  }
  return prod;
}

// =============================================================================
// Master data: Kategori (ber-area bar/dapur/umum) + Supplier. Owner bebas tambah.
// =============================================================================

export type WmsArea = "bar" | "dapur" | "umum";

export async function listWmsCategories() {
  await ensureWmsSeeded();
  const rows = await getDb().select().from(wmsCategory).orderBy(wmsCategory.area, wmsCategory.name);
  return rows.map((r) => ({ id: r.id, name: r.name, area: r.area as WmsArea }));
}

export async function createWmsCategory(input: { name: string; area?: WmsArea }) {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Nama kategori wajib.");
  const area = input.area && ["bar", "dapur", "umum"].includes(input.area) ? input.area : "umum";
  const [row] = await db
    .insert(wmsCategory)
    .values({ name, area })
    .onConflictDoUpdate({ target: wmsCategory.name, set: { area } })
    .returning();
  return { id: row.id, name: row.name, area: row.area as WmsArea };
}

export async function listWmsSuppliers() {
  const rows = await getDb()
    .select()
    .from(wmsSupplier)
    .where(sql`${wmsSupplier.archivedAt} is null`)
    .orderBy(wmsSupplier.name);
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, note: r.note }));
}

export async function createWmsSupplier(input: { name: string; phone?: string; note?: string }) {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Nama supplier wajib.");
  const [row] = await db
    .insert(wmsSupplier)
    .values({ name, phone: input.phone?.trim() ?? "", note: input.note?.trim() ?? "" })
    .onConflictDoUpdate({
      target: wmsSupplier.name,
      set: { phone: input.phone?.trim() ?? "", note: input.note?.trim() ?? "", archivedAt: null },
    })
    .returning();
  return { id: row.id, name: row.name, phone: row.phone, note: row.note };
}

export async function updateWmsCategory(id: string, patch: { name?: string; area?: WmsArea }) {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim();
  if (patch.area !== undefined && ["bar", "dapur", "umum"].includes(patch.area)) set.area = patch.area;
  if (Object.keys(set).length === 0) return null;
  const [row] = await db.update(wmsCategory).set(set).where(eq(wmsCategory.id, id)).returning();
  return row ? { id: row.id, name: row.name, area: row.area as WmsArea } : null;
}

export async function deleteWmsCategory(id: string) {
  const db = getDb();
  const [cat] = await db.select().from(wmsCategory).where(eq(wmsCategory.id, id)).limit(1);
  if (!cat) return { ok: false, reason: "not_found" as const };
  // Tolak hapus bila masih dipakai produk aktif — arahkan owner ganti kategori dulu.
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wmsProduct)
    .where(and(eq(wmsProduct.category, cat.name), sql`${wmsProduct.archivedAt} is null`));
  if (Number(n) > 0) return { ok: false, reason: "in_use" as const, count: Number(n) };
  await db.delete(wmsCategory).where(eq(wmsCategory.id, id));
  return { ok: true as const };
}

export async function updateWmsSupplier(id: string, patch: { name?: string; phone?: string; note?: string }) {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim();
  if (patch.phone !== undefined) set.phone = patch.phone.trim();
  if (patch.note !== undefined) set.note = patch.note.trim();
  if (Object.keys(set).length === 0) return null;
  const [row] = await db.update(wmsSupplier).set(set).where(eq(wmsSupplier.id, id)).returning();
  return row ? { id: row.id, name: row.name, phone: row.phone, note: row.note } : null;
}

export async function archiveWmsSupplier(id: string) {
  const db = getDb();
  const [row] = await db
    .update(wmsSupplier)
    .set({ archivedAt: new Date() })
    .where(eq(wmsSupplier.id, id))
    .returning();
  return row ? { ok: true as const } : { ok: false as const };
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
  buyQty?: number | null; // qty kemasan beli (mis. 5 dus)
  packSize?: number | null; // isi per kemasan (mis. 24 pcs/dus)
  buyUnit?: string | null; // satuan beli (dus/karton)
  discrepancyNote?: string;
  putAwayLocation?: string;
};

export async function createReceiving(
  input: {
    supplier?: string;
    poNumber?: string;
    additionalCost?: number;
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
      poNumber: input.poNumber?.trim() ?? "",
      additionalCost: input.additionalCost ?? 0,
      warehouseId: whId,
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
      poNumber: input.poNumber?.trim() ?? rec.poNumber,
      additionalCost: input.additionalCost ?? rec.additionalCost,
      warehouseId: input.warehouseId ?? rec.warehouseId,
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
export async function completeReceiving(
  id: string,
  userId?: string | null,
  opts?: { forceApprove?: boolean; actorName?: string },
) {
  return runInTx(async (tx) => {
    const [rec] = await tx
      .select()
      .from(wmsReceiving)
      .where(eq(wmsReceiving.id, id))
      .for("update")
      .limit(1);
    if (!rec) return null;
    if (rec.status === "completed") return rec;
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

    const needsApproval = items.some(
      (x) =>
        x.row.productId &&
        needsDiscrepancyApproval(Number(x.row.orderedQty), Number(x.row.receivedQty), x.row.qc),
    );
    if (needsApproval && !opts?.forceApprove) {
      const approvalId = `APP-RCV-${rec.doc}`;
      await tx
        .update(wmsReceiving)
        .set({ status: "pending_approval" })
        .where(eq(wmsReceiving.id, id));
      await tx
        .insert(approvals)
        .values({
          id: approvalId,
          type: "Selisih Receiving WMS",
          requester: opts?.actorName ?? "Staff Gudang",
          requesterPhone: null,
          amount: rec.doc,
          reason: `Selisih qty >10% pada ${rec.doc} — perlu review manager.`,
          risk: "medium",
          age: "baru saja",
          status: "pending",
        })
        .onConflictDoNothing();
      throw new Error("Selisih >10% — menunggu approval manager.");
    }

    const catRows = await tx.select({ name: wmsCategory.name, area: wmsCategory.area }).from(wmsCategory);
    const areaByCat = new Map(catRows.map((c) => [c.name.trim().toLowerCase(), c.area]));

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
        const oldQty = await totalOnHand(tx, it.productId);
        const oldValue = oldQty * Number(prod.hpp);
        const newQty = oldQty + qty;
        const newHpp = newQty > 0 ? (oldValue + qty * effHpp) / newQty : effHpp;
        await tx
          .update(wmsProduct)
          .set({ hpp: newHpp, updatedAt: new Date() })
          .where(eq(wmsProduct.id, it.productId));
      }

      const area = areaByCat.get((prod?.category ?? category ?? "").trim().toLowerCase()) ?? "umum";
      const target = area === "umum" ? whId : ((await mainWarehouseForArea(tx, area)) ?? whId);

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
    if (!source) {
      const [outlet] = await tx
        .select({ area: wmsWarehouse.area })
        .from(wmsWarehouse)
        .where(eq(wmsWarehouse.id, input.outletWarehouseId))
        .limit(1);
      source = await mainWarehouseForArea(tx, outlet?.area ?? "bar");
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
// Production — olah bahan mentah → produk jadi. Konsumsi input FEFO (type out) +
// hasil output (type in, HPP = biaya input / hasil). HPP output di-weighted-average.
// =============================================================================

export type ProductionRecipeInput = {
  name: string;
  outputProductId: string;
  outputQty: number;
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
    for (const b of bom) {
      if (!b.inputProductId) continue;
      const need = Number(b.qty) * batches;
      const [prod] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, b.inputProductId)).limit(1);
      const { cost } = await recordStockMovement(tx, {
        type: "out",
        productId: b.inputProductId,
        warehouseId: input.warehouseId,
        deltaQty: -need,
        hpp: Number(prod?.hpp ?? 0),
        refDoc: doc,
        userId: userId ?? null,
      });
      totalCost += cost;
    }

    const producedQty = Number(rec.outputQty) * batches;
    const unitCost = producedQty > 0 ? totalCost / producedQty : 0;

    // Update HPP rata-rata tertimbang produk output (seperti receiving).
    const [outProd] = await tx.select().from(wmsProduct).where(eq(wmsProduct.id, rec.outputProductId)).limit(1);
    if (outProd) {
      const oldQty = await totalOnHand(tx, rec.outputProductId);
      const oldValue = oldQty * Number(outProd.hpp);
      const newQty = oldQty + producedQty;
      const newHpp = newQty > 0 ? (oldValue + totalCost) / newQty : unitCost;
      await tx.update(wmsProduct).set({ hpp: newHpp, updatedAt: new Date() }).where(eq(wmsProduct.id, rec.outputProductId));
    }

    await recordStockMovement(tx, {
      type: "in",
      productId: rec.outputProductId,
      warehouseId: input.warehouseId,
      deltaQty: producedQty,
      hpp: unitCost,
      refDoc: doc,
      userId: userId ?? null,
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

export async function deleteWmsRecipe(id: string) {
  const db = getDb();
  const [row] = await db.delete(wmsRecipe).where(eq(wmsRecipe.id, id)).returning();
  return row ?? null;
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
    roles: ["Owner / CEO", "Admin", "Manager Operasional", "Koki", "Asisten Koki", "Barista", "Kitchen / Barista"],
  },
  pending_kitchen: {
    next: "pending_warehouse",
    roles: ["Koki", "Asisten Koki", "Barista", "Kitchen / Barista", "Owner / CEO", "Admin", "Manager Operasional"],
  },
  pending_warehouse: {
    next: "pending_manager",
    roles: ["Gudang", "Owner / CEO", "Admin", "Manager Operasional"],
  },
  pending_manager: {
    next: "pending_owner",
    roles: ["Manager Operasional", "Owner / CEO", "Admin"],
  },
  pending_owner: { next: "published", roles: ["Owner / CEO", "Admin"] },
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
      sku: wmsProduct.sku,
      barcode: wmsProduct.barcode,
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

  // Peta kategori → area (bar/dapur/umum) untuk routing per bahan.
  const cats = await listWmsCategories();
  const areaByCat = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.area]));
  const areaOf = (category: string | null): WmsArea =>
    areaByCat.get((category ?? "").trim().toLowerCase()) ?? "umum";

  // Gudang outlet per tipe (dimuat sekali).
  const [barWh] = await db.select().from(wmsWarehouse).where(eq(wmsWarehouse.type, "bar")).limit(1);
  const [kitWh] = await db.select().from(wmsWarehouse).where(eq(wmsWarehouse.type, "kitchen")).limit(1);
  const outletFor = (type: "bar" | "kitchen") =>
    type === "bar" ? (barWh ?? kitWh) : (kitWh ?? barWh);

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

    // Outlet utama menu = area mayoritas bahan non-umum; semua umum → fallback regex resep.
    const barCount = lines.filter((l) => l.area === "bar").length;
    const kitCount = lines.filter((l) => l.area === "dapur").length;
    const primaryType: "bar" | "kitchen" =
      barCount === 0 && kitCount === 0
        ? /coffee|non.?coffee|kopi|minum|bar|drink/i.test(recCategory) ? "bar" : "kitchen"
        : barCount >= kitCount ? "bar" : "kitchen";

    // Kelompokkan bahan per outlet: bar→bar, dapur→kitchen, umum→outlet utama.
    const groups: Record<"bar" | "kitchen", Array<{ productId: string; qty: number }>> = { bar: [], kitchen: [] };
    for (const l of lines) {
      const target = l.area === "bar" ? "bar" : l.area === "dapur" ? "kitchen" : primaryType;
      groups[target].push({ productId: l.productId, qty: l.qty });
    }

    // Buat 1 Internal Order per kelompok outlet (idempotensi per sale+resep+outlet).
    const docs: string[] = [];
    let failReason: string | null = null;
    for (const type of ["bar", "kitchen"] as const) {
      if (groups[type].length === 0) continue;
      const outlet = outletFor(type);
      if (!outlet) { failReason = "outlet tidak ada"; break; }
      try {
        const sourceRef = input.ref ? `sale:${input.ref}:${recId}:${type}` : null;
        const io = await createInternalOrder({ outletWarehouseId: outlet.id, items: groups[type], sourceRef }, userId);
        docs.push(io.doc);
      } catch (e) {
        failReason = e instanceof Error ? e.message : "gagal potong stok";
        break;
      }
    }
    if (failReason) skipped.push({ menu: it.name, reason: failReason });
    else processed.push({ menu: it.name, io: docs.join(", ") });
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
    for (const p of low.slice(0, 5)) {
      notes.push({
        id: `low-${p.id}`,
        level: p.status === "out" ? "critical" : "warning",
        title: p.status === "out" ? "Out of Stock" : "Low Stock",
        text: `${p.name} (${p.onHand} ${p.unit})`,
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
