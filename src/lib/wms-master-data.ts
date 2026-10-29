import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditLogs,
  inventoryItems,
  menuItems,
  menuRecipes,
  wmsBomItem,
  wmsCategory,
  wmsProduct,
  wmsReceiving,
  wmsReceivingItem,
  wmsRecipe,
  wmsStockMovement,
  wmsSupplier,
  wmsWarehouseStock,
} from "@/db/schema";

// =============================================================================
// GARAGE WMS — pengaman Master Data (bahan, kategori, supplier).
// Hanya butuh DB + skema (tanpa import wms-service) supaya bisa dipakai dari
// wms-service tanpa import melingkar. Aturan:
// - Master TIDAK PERNAH mengubah stok; stok hanya lewat transaksi WMS (ledger).
// - Satuan dasar terkunci setelah bahan punya ledger/stok/resep (cegah salah konversi).
// - Bahan yang dipakai resep aktif tidak boleh diarsipkan; tidak ada hapus permanen.
// - SKU otomatis dibuat di server dengan kunci transaksi (anti SKU ganda).
// - Setiap perubahan master tercatat di audit_logs (before/after).
// =============================================================================

type Db = ReturnType<typeof getDb>;

export class WmsMasterError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "WmsMasterError";
  }
}

/** Siapa yang mengubah + mode ketat (API/UI: kategori wajib sudah terdaftar di master). */
export type MasterActor = { userId?: string | null; name?: string | null; strict?: boolean };

/** Satuan dasar stok yang disarankan untuk bahan baru (stok, HPP, resep). */
export const WMS_BASE_UNITS = ["gram", "ml", "pcs"] as const;
/** Satuan pembelian umum (kemasan supplier). */
export const WMS_PURCHASE_UNITS = ["botol", "pack", "dus", "karton", "kotak", "sachet", "kg", "liter"] as const;

/** Kategori contoh Garage (dipasang hanya bila owner menekan "Pasang kategori standar"). */
export const STANDARD_WMS_CATEGORIES: ReadonlyArray<{ name: string; area: "bar" | "dapur" | "umum" }> = [
  { name: "Kopi", area: "bar" },
  { name: "Susu", area: "bar" },
  { name: "Syrup", area: "bar" },
  { name: "Powder", area: "bar" },
  { name: "Tea", area: "bar" },
  { name: "Topping", area: "bar" },
  { name: "Gula", area: "bar" },
  { name: "Packaging Bar", area: "bar" },
  { name: "Protein", area: "dapur" },
  { name: "Frozen Food", area: "dapur" },
  { name: "Bumbu", area: "dapur" },
  { name: "Saus", area: "dapur" },
  { name: "Minyak", area: "dapur" },
  { name: "Sayuran", area: "dapur" },
  { name: "Beras", area: "dapur" },
  { name: "Packaging Dapur", area: "dapur" },
  { name: "Kebersihan", area: "umum" },
  { name: "Kebutuhan Operasional", area: "umum" },
];

/** Prefix SKU dari nama kategori (3 huruf/angka pertama), sama dengan form lama. */
export function skuPrefixForCategory(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "PRD";
}

/** Nomor urut berikut dari daftar SKU berpola PREFIX-NNN (abaikan pola lain). */
export function nextSkuFrom(prefix: string, skus: string[]): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const s of skus) {
    const m = s.trim().match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/**
 * SKU otomatis unik. Kunci advisory per prefix menahan dua penyimpanan bersamaan
 * sampai transaksi selesai; bahan terarsip & katalog OS ikut dihitung.
 */
export async function generateWmsSku(tx: Db, category: string): Promise<string> {
  const prefix = skuPrefixForCategory(category);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wms_sku:${prefix}`}))`);
  const pattern = `${prefix}-%`;
  const [wms, os] = await Promise.all([
    tx.select({ sku: wmsProduct.sku }).from(wmsProduct).where(sql`upper(${wmsProduct.sku}) like ${pattern}`),
    tx.select({ sku: inventoryItems.sku }).from(inventoryItems).where(sql`upper(${inventoryItems.sku}) like ${pattern}`),
  ]);
  return nextSkuFrom(prefix, [...wms, ...os].map((r) => r.sku));
}

export async function assertSkuFree(tx: Db, sku: string) {
  const [dup] = await tx
    .select({ sku: wmsProduct.sku, archivedAt: wmsProduct.archivedAt })
    .from(wmsProduct)
    .where(sql`lower(${wmsProduct.sku}) = lower(${sku.trim()})`)
    .limit(1);
  if (dup) {
    throw new WmsMasterError(
      "SKU_DUPLICATE",
      dup.archivedAt
        ? `SKU ${dup.sku} sudah dipakai bahan yang diarsipkan. Pulihkan bahan itu atau pakai SKU lain.`
        : `SKU ${dup.sku} sudah dipakai bahan lain.`,
    );
  }
}

export async function assertBarcodeFree(tx: Db, barcode: string | null | undefined, exceptId?: string) {
  const code = barcode?.trim();
  if (!code) return;
  const [dup] = await tx
    .select({ sku: wmsProduct.sku })
    .from(wmsProduct)
    .where(and(eq(wmsProduct.barcode, code), isNull(wmsProduct.archivedAt), exceptId ? ne(wmsProduct.id, exceptId) : sql`true`))
    .limit(1);
  if (dup) throw new WmsMasterError("BARCODE_DUPLICATE", `Barcode ${code} sudah dipakai bahan ${dup.sku}.`);
}

/**
 * Kategori tidak boleh yang diarsipkan. Mode ketat (API/UI) juga mewajibkan kategori sudah
 * terdaftar; jalur internal lama (impor master, sinkron OS, tes) boleh kategori baru → area "umum".
 */
export async function assertCategoryUsable(tx: Db, name: string, strict = true): Promise<{ name: string; area: string }> {
  const [cat] = await tx
    .select({ name: wmsCategory.name, area: wmsCategory.area, archivedAt: wmsCategory.archivedAt })
    .from(wmsCategory)
    .where(sql`lower(${wmsCategory.name}) = lower(${name.trim()})`)
    .limit(1);
  if (!cat) {
    if (!strict) return { name: name.trim(), area: "umum" };
    throw new WmsMasterError("CATEGORY_NOT_FOUND", `Kategori "${name}" belum ada di master.`, 400);
  }
  if (cat.archivedAt) throw new WmsMasterError("CATEGORY_ARCHIVED", `Kategori "${cat.name}" sudah diarsipkan. Pulihkan dulu atau pilih kategori lain.`, 400);
  return { name: cat.name, area: cat.area };
}

export async function assertSupplierUsable(tx: Db, supplierId: string | null | undefined) {
  if (!supplierId) return;
  const [s] = await tx
    .select({ id: wmsSupplier.id, archivedAt: wmsSupplier.archivedAt })
    .from(wmsSupplier)
    .where(eq(wmsSupplier.id, supplierId))
    .limit(1);
  if (!s) throw new WmsMasterError("SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.", 400);
  if (s.archivedAt) throw new WmsMasterError("SUPPLIER_ARCHIVED", "Supplier sudah diarsipkan.", 400);
}

export type ProductUsage = {
  activeMenus: string[];
  publishedRecipes: string[];
  hasLedger: boolean;
  onHand: number;
};

/** Seberapa jauh bahan sudah dipakai: menu/resep aktif, ledger, stok fisik. */
export async function getProductUsage(tx: Db, product: { id: string; sku: string }): Promise<ProductUsage> {
  const [menus, recipes, ledger, stock] = await Promise.all([
    tx
      .selectDistinct({ name: menuItems.name })
      .from(menuRecipes)
      .innerJoin(menuItems, eq(menuItems.id, menuRecipes.menuItemId))
      .where(and(eq(menuRecipes.inventorySku, product.sku), eq(menuRecipes.status, "active"), ne(menuItems.status, "archived")))
      .limit(20),
    tx
      .selectDistinct({ name: wmsRecipe.name })
      .from(wmsBomItem)
      .innerJoin(wmsRecipe, eq(wmsRecipe.id, wmsBomItem.recipeId))
      .where(and(eq(wmsBomItem.productId, product.id), eq(wmsRecipe.recipeStatus, "published")))
      .limit(20),
    tx.select({ id: wmsStockMovement.id }).from(wmsStockMovement).where(eq(wmsStockMovement.productId, product.id)).limit(1),
    tx
      .select({ total: sql<number>`coalesce(sum(${wmsWarehouseStock.qty}), 0)` })
      .from(wmsWarehouseStock)
      .where(eq(wmsWarehouseStock.productId, product.id)),
  ]);
  return {
    activeMenus: menus.map((m) => m.name),
    publishedRecipes: recipes.map((r) => r.name),
    hasLedger: ledger.length > 0,
    onHand: Number(stock[0]?.total ?? 0),
  };
}

function listNames(names: string[]) {
  const shown = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${shown}, dan ${names.length - 5} lainnya` : shown;
}

/** Satuan dasar hanya boleh diganti selama bahan belum punya stok, ledger, atau resep. */
export async function assertUnitChangeAllowed(tx: Db, product: { id: string; sku: string; unit: string }, nextUnit: string) {
  if (nextUnit.trim().toLowerCase() === product.unit.trim().toLowerCase()) return;
  const u = await getProductUsage(tx, product);
  const reasons: string[] = [];
  if (u.hasLedger || u.onHand !== 0) reasons.push("sudah punya riwayat stok");
  if (u.activeMenus.length) reasons.push(`dipakai resep menu ${listNames(u.activeMenus)}`);
  if (u.publishedRecipes.length) reasons.push(`dipakai resep ${listNames(u.publishedRecipes)}`);
  if (reasons.length) {
    throw new WmsMasterError(
      "UNIT_LOCKED",
      `Satuan dasar ${product.sku} tidak bisa diganti dari "${product.unit}" ke "${nextUnit}" karena ${reasons.join(" dan ")}. ` +
        "Atur kemasan (mis. 1 dus = 12 botol) di bagian Satuan & Kemasan, atau buat bahan baru.",
    );
  }
}

/** Arsip ditolak bila bahan masih dipakai resep aktif atau masih ada stok. */
export async function assertArchiveAllowed(tx: Db, product: { id: string; sku: string; unit: string }) {
  const u = await getProductUsage(tx, product);
  if (u.activeMenus.length || u.publishedRecipes.length) {
    const names = [...u.activeMenus, ...u.publishedRecipes];
    throw new WmsMasterError(
      "PRODUCT_IN_RECIPE",
      `${product.sku} masih dipakai resep: ${listNames(names)}. Ganti bahan di resep itu dulu sebelum diarsipkan.`,
    );
  }
  if (Math.abs(u.onHand) > 1e-9) {
    throw new WmsMasterError(
      "PRODUCT_HAS_STOCK",
      `${product.sku} masih punya stok ${u.onHand} ${product.unit}. Habiskan/koreksi lewat Opname atau Waste dulu, lalu arsipkan.`,
    );
  }
}

/** Nomor WhatsApp Indonesia: boleh kosong; 08… / 62… / +62…, 10–15 digit. */
export function normalizeWhatsapp(raw: string | null | undefined): string {
  const cleaned = (raw ?? "").replace(/[\s().-]/g, "");
  if (!cleaned) return "";
  const digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(digits)) throw new WmsMasterError("PHONE_INVALID", "Nomor WhatsApp hanya boleh angka (boleh diawali +62).", 400);
  const local = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
  if (!/^08\d{8,13}$/.test(local)) {
    throw new WmsMasterError("PHONE_INVALID", "Nomor WhatsApp harus diawali 08 atau 62 dan berisi 10–15 digit.", 400);
  }
  return local;
}

/** Bandingkan field sebelum/sesudah untuk audit log (hanya yang berubah). */
export function diffMaster<T extends Record<string, unknown>>(before: T, after: Partial<T>, keys: Array<keyof T>) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = after[k];
    const b = before[k];
    const same = typeof a === "number" || typeof b === "number" ? Math.abs(Number(a) - Number(b)) < 1e-6 : (a ?? null) === (b ?? null);
    if (!same) changes[String(k)] = { before: b ?? null, after: a ?? null };
  }
  return changes;
}

const timeLabel = () =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date());

export async function writeMasterAudit(
  tx: Db,
  input: { actor?: MasterActor; action: string; object: string; metadata?: Record<string, unknown> },
) {
  await tx.insert(auditLogs).values({
    time: timeLabel(),
    actor: input.actor?.name?.trim() || "Gudang",
    action: input.action,
    object: input.object,
    device: "Garage OS · Master Data",
    status: "recorded",
    metadata: { ...(input.metadata ?? {}), module: "wms-master", actorId: input.actor?.userId ?? null },
  });
}

/** Riwayat audit master untuk satu objek (SKU / nama kategori / nama supplier). */
export async function listMasterAudit(object: string, limit = 30) {
  const rows = await getDb()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.object, object), sql`${auditLogs.metadata}->>'module' = 'wms-master'`))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actor: r.actor,
    at: r.createdAt.toISOString(),
    metadata: r.metadata,
  }));
}

/**
 * Detail supplier: bahan yang disuplai (supplier utama + pernah diterima) beserta
 * harga terakhir, dan riwayat harga per penerimaan (harga per satuan dasar).
 */
export async function getWmsSupplierDetail(id: string) {
  const db = getDb();
  const [supplier] = await db.select().from(wmsSupplier).where(eq(wmsSupplier.id, id)).limit(1);
  if (!supplier) return null;

  const history = await db
    .select({
      productId: wmsReceivingItem.productId,
      price: wmsReceivingItem.hpp,
      qty: wmsReceivingItem.receivedQty,
      doc: wmsReceiving.doc,
      at: wmsReceiving.completedAt,
    })
    .from(wmsReceivingItem)
    .innerJoin(wmsReceiving, eq(wmsReceiving.id, wmsReceivingItem.receivingId))
    .where(
      and(
        or(eq(wmsReceiving.supplierId, id), and(isNull(wmsReceiving.supplierId), sql`lower(${wmsReceiving.supplier}) = lower(${supplier.name})`)),
        eq(wmsReceiving.status, "completed"),
        sql`${wmsReceivingItem.qc} <> 'reject'`,
      ),
    )
    .orderBy(desc(wmsReceiving.completedAt))
    .limit(300);

  const productIds = new Set<string>();
  for (const h of history) if (h.productId) productIds.add(h.productId);
  const defaults = await db
    .select({ id: wmsProduct.id })
    .from(wmsProduct)
    .where(and(eq(wmsProduct.defaultSupplierId, id), isNull(wmsProduct.archivedAt)));
  for (const d of defaults) productIds.add(d.id);

  const products = productIds.size
    ? await db
        .select({
          id: wmsProduct.id,
          sku: wmsProduct.sku,
          name: wmsProduct.name,
          unit: wmsProduct.unit,
          hpp: wmsProduct.hpp,
          defaultSupplierId: wmsProduct.defaultSupplierId,
          archivedAt: wmsProduct.archivedAt,
        })
        .from(wmsProduct)
        .where(inArray(wmsProduct.id, [...productIds]))
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const priceRows = history
    .filter((h) => h.productId && byId.has(h.productId))
    .map((h) => ({
      productId: h.productId as string,
      doc: h.doc,
      at: h.at?.toISOString() ?? null,
      price: Number(h.price),
      qty: Number(h.qty),
    }));

  // Perubahan harga = selisih terhadap penerimaan sebelumnya untuk bahan yang sama.
  const chronological = [...priceRows].reverse();
  const lastByProduct = new Map<string, number>();
  const withChange = chronological.map((r) => {
    const prev = lastByProduct.get(r.productId);
    lastByProduct.set(r.productId, r.price);
    return { ...r, previousPrice: prev ?? null, changePct: prev && prev > 0 ? Math.round(((r.price - prev) / prev) * 1000) / 10 : null };
  });

  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    address: supplier.address,
    note: supplier.note,
    bankName: supplier.bankName,
    bankAccountNumber: supplier.bankAccountNumber,
    bankAccountName: supplier.bankAccountName,
    archived: Boolean(supplier.archivedAt),
    products: products
      .map((p) => {
        const rows = priceRows.filter((r) => r.productId === p.id);
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          hpp: Number(p.hpp),
          isDefault: p.defaultSupplierId === id,
          archived: Boolean(p.archivedAt),
          lastPrice: rows[0]?.price ?? null,
          lastAt: rows[0]?.at ?? null,
          receipts: rows.length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "id")),
    priceHistory: withChange.reverse(),
  };
}
