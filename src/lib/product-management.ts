// =============================================================================
// Manajemen Produk (owner, Okt 2026): kategori dinamis, tipe produk, katalog
// dengan KPI/filter/pagination, dan aksi massal. Semua dihitung dari database;
// tidak ada angka tebakan. Kategori tidak pernah dihapus permanen — arsip +
// pindah produk supaya transaksi historis tetap utuh (order_items menyimpan
// snapshot nama/harga).
// =============================================================================
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, menuItems, menuRecipes, menuVariants, orderItems, orders, productCategories } from "@/db/schema";
import {
  CATALOG_KPI_KEYS,
  type CatalogBulkAction,
  type CatalogKpis,
  type CatalogQuery,
  type CatalogRow,
  type CatalogVariant,
  type CategoryKind,
  type CategoryStation,
  type CategoryStatus,
  type HppStatus,
  type PosGroup,
  type ProductCategoryRow,
  type ProductIssue,
  type ProductType,
} from "@/lib/product-catalog-types";
import { rangeBounds, wibKey } from "@/lib/reports/common";
import type { GarageSession } from "@/lib/server-auth";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;
type CategoryRecord = typeof productCategories.$inferSelect;

export class ProductManagementError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function actorLabel(garage: GarageSession) {
  return `${garage.user.name} / ${garage.profile.role}`;
}

function timeLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

async function audit(
  db: DbOrTx,
  garage: GarageSession,
  entry: { action: string; object: string; status: string; metadata: Record<string, unknown> },
) {
  await db.insert(auditLogs).values({
    time: timeLabel(),
    actor: actorLabel(garage),
    action: entry.action,
    object: entry.object,
    device: garage.profile.deviceLabel,
    status: entry.status,
    metadata: entry.metadata,
  });
}

/** Kategori → kelompok POS & section produk. */
export function sectionForCategoryRecord(category: Pick<CategoryRecord, "name" | "station">) {
  if (category.station === "bar") return "Bar";
  if (category.station === "dapur") return "Dapur";
  return category.name;
}

/**
 * Produk lama / hasil seed yang belum punya category_id dihubungkan ke kategori
 * bernama sama; nama kategori yang belum terdaftar didaftarkan (tanpa tebakan
 * atribut lain). Idempoten & murah — dipanggil sebelum membaca katalog.
 */
export async function ensureCategoryLinks(db: DbOrTx = getDb()) {
  const orphans = await db
    .selectDistinct({ category: menuItems.category })
    .from(menuItems)
    .where(isNull(menuItems.categoryId));
  if (!orphans.length) return 0;
  for (const { category } of orphans) {
    const name = category.trim();
    if (!name) continue;
    await db
      .insert(productCategories)
      .values({ name, sortOrder: 900 })
      .onConflictDoNothing();
  }
  const updated = await db
    .update(menuItems)
    .set({
      categoryId: sql`(select pc.id from product_categories pc where lower(pc.name) = lower(menu_items.category) limit 1)`,
    })
    .where(isNull(menuItems.categoryId))
    .returning({ id: menuItems.id });
  return updated.length;
}

function toCategoryRow(record: CategoryRecord, counts?: { active: number; archived: number }): ProductCategoryRow {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    kind: record.kind as CategoryKind,
    defaultProductType: record.defaultProductType as ProductType,
    station: record.station as CategoryStation,
    posGroup: record.posGroup as PosGroup,
    skuPrefix: record.skuPrefix,
    icon: record.icon,
    sortOrder: record.sortOrder,
    status: record.status as CategoryStatus,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    activeProducts: counts?.active ?? 0,
    archivedProducts: counts?.archived ?? 0,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listProductCategories(params?: { includeArchived?: boolean }) {
  const db = getDb();
  await ensureCategoryLinks(db);
  const rows = await db
    .select()
    .from(productCategories)
    .where(params?.includeArchived ? undefined : sql`${productCategories.status} <> 'archived'`)
    .orderBy(productCategories.sortOrder, productCategories.name);
  const counts = await db
    .select({
      categoryId: menuItems.categoryId,
      active: sql<number>`count(*) filter (where ${menuItems.status} = 'active')::int`,
      archived: sql<number>`count(*) filter (where ${menuItems.status} <> 'active')::int`,
    })
    .from(menuItems)
    .groupBy(menuItems.categoryId);
  const byId = new Map(counts.map((row) => [row.categoryId, { active: Number(row.active), archived: Number(row.archived) }]));
  return rows.map((row) => toCategoryRow(row, byId.get(row.id)));
}

/** Map nama kategori (lowercase) → kelompok POS. Dipakai getMenuData untuk POS dinamis. */
export async function categoryPosInfo(db: DbOrTx = getDb()) {
  const rows = await db
    .select({ id: productCategories.id, name: productCategories.name, posGroup: productCategories.posGroup, sortOrder: productCategories.sortOrder })
    .from(productCategories);
  return new Map(rows.map((row) => [row.name.toLowerCase(), row]));
}

async function findCategoryByName(db: DbOrTx, name: string) {
  const [row] = await db
    .select()
    .from(productCategories)
    .where(sql`lower(${productCategories.name}) = lower(${name.trim()})`)
    .limit(1);
  return row ?? null;
}

async function findCategoryById(db: DbOrTx, id: string) {
  const [row] = await db.select().from(productCategories).where(eq(productCategories.id, id)).limit(1);
  return row ?? null;
}

/**
 * Kategori untuk simpan produk: harus terdaftar & AKTIF. Produk lama yang tetap
 * di kategori nonaktifnya sendiri boleh disimpan (keepCategoryId).
 */
export async function resolveCategoryForProduct(
  db: DbOrTx,
  input: { categoryId?: string | null; category?: string | null },
  opts?: { keepCategoryId?: string | null },
) {
  const record = input.categoryId
    ? await findCategoryById(db, input.categoryId)
    : input.category
      ? await findCategoryByName(db, input.category)
      : null;
  if (!record) {
    throw new ProductManagementError(
      "CATEGORY_NOT_FOUND",
      `Kategori "${input.category ?? input.categoryId ?? ""}" belum terdaftar. Tambahkan dulu di Manajemen Kategori.`,
    );
  }
  if (record.status !== "active" && record.id !== opts?.keepCategoryId) {
    throw new ProductManagementError("CATEGORY_INACTIVE", `Kategori "${record.name}" sedang ${record.status === "archived" ? "diarsipkan" : "nonaktif"}.`);
  }
  return record;
}

export type CategoryInput = {
  name: string;
  description?: string | null;
  kind?: CategoryKind;
  defaultProductType?: ProductType;
  station?: CategoryStation;
  posGroup?: PosGroup;
  skuPrefix?: string | null;
  icon?: string | null;
  sortOrder?: number;
  status?: Exclude<CategoryStatus, "archived">;
};

function normalizeSkuPrefix(raw: string | null | undefined) {
  const value = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return value || null;
}

export async function createProductCategory(input: CategoryInput, garage: GarageSession) {
  const db = getDb();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new ProductManagementError("VALIDATION_ERROR", "Nama kategori minimal 2 huruf.");
  return db.transaction(async (tx) => {
    const dup = await findCategoryByName(tx, name);
    if (dup) {
      throw new ProductManagementError(
        "CATEGORY_DUPLICATE",
        dup.status === "archived"
          ? `Kategori "${dup.name}" sudah ada di arsip — pulihkan saja, jangan buat duplikat.`
          : `Kategori "${dup.name}" sudah ada.`,
        409,
      );
    }
    const [maxRow] = await tx.select({ max: sql<number>`coalesce(max(${productCategories.sortOrder}), 0)::int` }).from(productCategories);
    const kind = input.kind ?? "fnb";
    const [created] = await tx
      .insert(productCategories)
      .values({
        name,
        description: input.description?.trim() || null,
        kind,
        defaultProductType: input.defaultProductType ?? (kind === "retail" ? "retail" : "menu"),
        station: input.station ?? (kind === "fnb" ? "dapur" : "none"),
        posGroup: input.posGroup ?? (kind === "fnb" ? "Dapur" : "Lainnya"),
        skuPrefix: normalizeSkuPrefix(input.skuPrefix),
        icon: input.icon?.trim() || null,
        sortOrder: input.sortOrder ?? Number(maxRow?.max ?? 0) + 10,
        status: input.status ?? "active",
      })
      .returning();
    await audit(tx, garage, {
      action: "Product category created",
      object: created.name,
      status: created.status,
      metadata: { categoryId: created.id, after: toCategoryRow(created) },
    });
    return toCategoryRow(created);
  });
}

export async function updateProductCategory(id: string, patch: Partial<CategoryInput>, garage: GarageSession) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(productCategories).where(eq(productCategories.id, id)).for("update").limit(1);
    if (!before) throw new ProductManagementError("NOT_FOUND", "Kategori tidak ditemukan.", 404);
    if (before.status === "archived" && patch.status === undefined) {
      throw new ProductManagementError("CATEGORY_ARCHIVED", "Kategori arsip harus dipulihkan dulu sebelum diedit.");
    }
    const set: Partial<typeof productCategories.$inferInsert> = { updatedAt: new Date() };
    let renamedTo: string | null = null;
    if (patch.name !== undefined) {
      const name = patch.name.trim().replace(/\s+/g, " ");
      if (name.length < 2) throw new ProductManagementError("VALIDATION_ERROR", "Nama kategori minimal 2 huruf.");
      if (name !== before.name) {
        const dup = await findCategoryByName(tx, name);
        if (dup && dup.id !== id) throw new ProductManagementError("CATEGORY_DUPLICATE", `Nama "${dup.name}" sudah dipakai kategori lain.`, 409);
        set.name = name;
        renamedTo = name;
      }
    }
    if (patch.description !== undefined) set.description = patch.description?.trim() || null;
    if (patch.kind !== undefined) set.kind = patch.kind;
    if (patch.defaultProductType !== undefined) set.defaultProductType = patch.defaultProductType;
    if (patch.station !== undefined) set.station = patch.station;
    if (patch.posGroup !== undefined) set.posGroup = patch.posGroup;
    if (patch.skuPrefix !== undefined) set.skuPrefix = normalizeSkuPrefix(patch.skuPrefix);
    if (patch.icon !== undefined) set.icon = patch.icon?.trim() || null;
    if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
    if (patch.status !== undefined) {
      set.status = patch.status;
      set.archivedAt = null;
    }
    const [after] = await tx.update(productCategories).set(set).where(eq(productCategories.id, id)).returning();

    let productsTouched = 0;
    if (renamedTo) {
      // Nama tampilan produk ikut; snapshot order_items lama tidak disentuh.
      const rows = await tx
        .update(menuItems)
        .set({ category: renamedTo, updatedAt: new Date() })
        .where(eq(menuItems.categoryId, id))
        .returning({ id: menuItems.id });
      productsTouched = rows.length;
    }
    if (patch.station !== undefined && patch.station !== before.station) {
      // Produk yang mengikuti routing kategori (station kosong / sama dgn lama) ikut pindah.
      const rows = await tx
        .update(menuItems)
        .set({ station: patch.station, section: sectionForCategoryRecord(after), updatedAt: new Date() })
        .where(and(eq(menuItems.categoryId, id), sql`(${menuItems.station} is null or ${menuItems.station} = ${before.station})`))
        .returning({ id: menuItems.id });
      productsTouched = Math.max(productsTouched, rows.length);
    }
    await audit(tx, garage, {
      action: patch.status === "active" && before.status === "archived" ? "Product category restored" : "Product category updated",
      object: after.name,
      status: after.status,
      metadata: {
        categoryId: id,
        fields: Object.keys(patch),
        before: toCategoryRow(before),
        after: toCategoryRow(after),
        productsTouched,
      },
    });
    return toCategoryRow(after);
  });
}

/**
 * Arsip kategori. Bila masih dipakai produk aktif, wajib pilih kategori tujuan —
 * semua produk (aktif & arsip) dipindah dulu, lalu kategori diarsipkan.
 */
export async function archiveProductCategory(
  id: string,
  input: { moveToCategoryId?: string | null; reason?: string | null },
  garage: GarageSession,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [category] = await tx.select().from(productCategories).where(eq(productCategories.id, id)).for("update").limit(1);
    if (!category) throw new ProductManagementError("NOT_FOUND", "Kategori tidak ditemukan.", 404);
    if (category.status === "archived") return toCategoryRow(category);
    const products = await tx
      .select({ id: menuItems.id, status: menuItems.status })
      .from(menuItems)
      .where(eq(menuItems.categoryId, id));
    const activeCount = products.filter((p) => p.status === "active").length;
    let moved = 0;
    let target: CategoryRecord | null = null;
    if (input.moveToCategoryId) {
      if (input.moveToCategoryId === id) throw new ProductManagementError("VALIDATION_ERROR", "Kategori tujuan harus berbeda.");
      target = await resolveCategoryForProduct(tx, { categoryId: input.moveToCategoryId });
      moved = await moveProductsTx(tx, products.map((p) => p.id), target);
    } else if (activeCount > 0) {
      throw new ProductManagementError(
        "CATEGORY_IN_USE",
        `Masih ada ${activeCount} produk aktif di "${category.name}". Pilih kategori tujuan untuk memindahkan produk sebelum mengarsipkan.`,
        409,
      );
    }
    const [archived] = await tx
      .update(productCategories)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(productCategories.id, id))
      .returning();
    await audit(tx, garage, {
      action: "Product category archived",
      object: category.name,
      status: "archived",
      metadata: {
        categoryId: id,
        reason: input.reason?.trim() || null,
        movedProducts: moved,
        moveTo: target ? { id: target.id, name: target.name } : null,
        before: toCategoryRow(category),
      },
    });
    return toCategoryRow(archived);
  });
}

async function moveProductsTx(tx: Tx, productIds: string[], target: CategoryRecord) {
  if (!productIds.length) return 0;
  const before = await tx
    .select({ id: menuItems.id, category: menuItems.category, station: menuItems.station })
    .from(menuItems)
    .where(inArray(menuItems.id, productIds));
  for (const row of before) {
    await tx
      .update(menuItems)
      .set({
        categoryId: target.id,
        category: target.name,
        section: sectionForCategoryRecord(target),
        station: target.station,
        updatedAt: new Date(),
      })
      .where(eq(menuItems.id, row.id));
  }
  return before.length;
}

export async function moveProductsToCategory(productIds: string[], categoryId: string, garage: GarageSession) {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new ProductManagementError("VALIDATION_ERROR", "Pilih minimal 1 produk.");
  return getDb().transaction(async (tx) => {
    const target = await resolveCategoryForProduct(tx, { categoryId });
    const before = await tx
      .select({ id: menuItems.id, name: menuItems.name, category: menuItems.category })
      .from(menuItems)
      .where(inArray(menuItems.id, ids));
    const moved = await moveProductsTx(tx, ids, target);
    for (const row of before) {
      await audit(tx, garage, {
        action: "Menu product category moved",
        object: row.name,
        status: "updated",
        metadata: { productId: row.id, before: { category: row.category }, after: { category: target.name, categoryId: target.id } },
      });
    }
    return { moved };
  });
}

// ─── Katalog: KPI + filter + sort + pagination ─────────────────────────────

const DEFAULT_RANGE_DAYS = 30;

export function defaultSalesRange(now = new Date()) {
  const to = wibKey(now);
  const from = wibKey(new Date(now.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60_000));
  return { from, to };
}

function hppStatusFor(type: ProductType, variants: CatalogVariant[]): HppStatus {
  if (!variants.length) return "missing";
  const known = variants.filter((v) => v.baseCost > 0);
  if (!known.length) return "missing";
  if (known.length < variants.length) return "partial";
  // Retail: harga modal per unit = biaya valid (tanpa resep). Menu/bundle: HPP
  // dianggap terverifikasi hanya bila dihitung dari resep bahan.
  if (type === "retail") return "complete";
  return variants.every((v) => v.hasRecipe) ? "complete" : "unverified";
}

function issuesFor(row: Omit<CatalogRow, "issues">): ProductIssue[] {
  const issues: ProductIssue[] = [];
  if (!row.categoryId || row.categoryStatus !== "active") issues.push("no_category");
  if (!row.sku) issues.push("no_sku");
  if (row.productType === "retail") {
    if (!row.barcode && !row.variants.some((v) => v.barcode)) issues.push("no_barcode");
    if (row.variants.some((v) => !v.sellUnit)) issues.push("no_sell_unit");
  }
  if (!row.variants.length || row.variants.some((v) => !(v.price > 0))) issues.push("no_price");
  if (row.hppStatus !== "complete") issues.push("hpp_incomplete");
  return issues;
}

/** Semua produk + metrik (tanpa filter) — sumber tunggal untuk katalog & ekspor. */
export async function loadCatalogRows(range: { from: string; to: string }): Promise<CatalogRow[]> {
  const db = getDb();
  await ensureCategoryLinks(db);
  const [items, variants, recipes, categories] = await Promise.all([
    db.select().from(menuItems).orderBy(menuItems.sortOrder, menuItems.name),
    db.select().from(menuVariants).orderBy(menuVariants.sortOrder),
    db
      .select({ itemId: menuRecipes.menuItemId, variantId: menuRecipes.variantId })
      .from(menuRecipes)
      .where(eq(menuRecipes.status, "active")),
    db.select().from(productCategories),
  ]);
  const { start, end } = rangeBounds(range);
  const sales = await db
    .select({
      itemId: orderItems.menuItemId,
      qty: sql<number>`coalesce(sum(${orderItems.qty}), 0)::int`,
      revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)::bigint`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.status, "paid"), gte(orders.createdAt, start), lt(orders.createdAt, end)))
    .groupBy(orderItems.menuItemId);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const salesById = new Map(sales.map((s) => [s.itemId, { qty: Number(s.qty), revenue: Number(s.revenue) }]));
  const recipeKeys = new Set(recipes.map((r) => `${r.itemId}::${r.variantId}`));
  const recipeCount = new Map<string, number>();
  for (const r of recipes) if (r.itemId) recipeCount.set(r.itemId, (recipeCount.get(r.itemId) ?? 0) + 1);
  const variantsByItem = new Map<string, CatalogVariant[]>();
  for (const v of variants) {
    const list = variantsByItem.get(v.itemId) ?? [];
    list.push({
      id: v.variantId,
      label: v.label,
      price: v.price,
      baseCost: v.baseCost,
      sku: v.sku,
      barcode: v.barcode,
      sellUnit: v.sellUnit,
      unitContents: v.unitContents === null ? null : Number(v.unitContents),
      hasRecipe: recipeKeys.has(`${v.itemId}::all`) || recipeKeys.has(`${v.itemId}::${v.variantId}`),
    });
    variantsByItem.set(v.itemId, list);
  }

  return items.map((item) => {
    const category = item.categoryId ? categoryById.get(item.categoryId) ?? null : null;
    const itemVariants = variantsByItem.get(item.id) ?? [];
    const productType = (item.productType as ProductType) ?? "menu";
    const prices = itemVariants.map((v) => v.price);
    const costs = itemVariants.map((v) => v.baseCost);
    const hppStatus = hppStatusFor(productType, itemVariants);
    const margins = hppStatus === "complete" ? itemVariants.filter((v) => v.price > 0).map((v) => ({ profit: v.price - v.baseCost, pct: ((v.price - v.baseCost) / v.price) * 100 })) : [];
    const sale = salesById.get(item.id);
    const base: Omit<CatalogRow, "issues"> = {
      id: item.id,
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      barcode: item.barcode,
      description: item.description,
      categoryId: item.categoryId,
      category: category?.name ?? item.category,
      categoryKind: (category?.kind as CategoryKind | undefined) ?? null,
      categoryStatus: (category?.status as CategoryStatus | undefined) ?? null,
      productType,
      status: item.status === "active" ? "active" : "archived",
      stock: item.stock as CatalogRow["stock"],
      showInDigitalMenu: item.showInDigitalMenu,
      station: item.station,
      sortOrder: item.sortOrder,
      variants: itemVariants,
      variantCount: itemVariants.length,
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
      costMin: costs.length ? Math.min(...costs) : 0,
      costMax: costs.length ? Math.max(...costs) : 0,
      recipeLines: recipeCount.get(item.id) ?? 0,
      hppStatus,
      marginPct: margins.length ? Math.round(Math.min(...margins.map((m) => m.pct)) * 10) / 10 : null,
      grossProfitMin: margins.length ? Math.min(...margins.map((m) => m.profit)) : null,
      salesQty: sale?.qty ?? 0,
      salesRevenue: sale?.revenue ?? 0,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
    return { ...base, issues: issuesFor(base) };
  });
}

export function computeCatalogKpis(rows: CatalogRow[], activeCategoryCount: number): CatalogKpis {
  const kpis = Object.fromEntries(CATALOG_KPI_KEYS.map((key) => [key, 0])) as CatalogKpis;
  kpis.total = rows.length;
  kpis.categories = activeCategoryCount;
  for (const row of rows) {
    const active = row.status === "active";
    if (active) kpis.active++;
    else kpis.archived++;
    kpis.variants += row.variantCount;
    if (row.productType === "menu") kpis.menu++;
    if (row.productType === "retail") kpis.retail++;
    if (row.productType === "bundle") kpis.bundle++;
    // Status stok, kelengkapan: hanya produk aktif (yang benar-benar dijual).
    if (!active) continue;
    if (row.stock === "ready") kpis.ready++;
    if (row.stock === "limited") kpis.limited++;
    if (row.stock === "sold_out") kpis.soldOut++;
    if (row.issues.includes("no_sku")) kpis.noSku++;
    if (row.issues.includes("no_barcode")) kpis.noBarcode++;
    if (row.issues.includes("no_price")) kpis.noPrice++;
    if (row.issues.includes("hpp_incomplete")) kpis.hppIncomplete++;
    if (row.issues.length) kpis.incomplete++;
  }
  return kpis;
}

export function filterCatalogRows(rows: CatalogRow[], query: CatalogQuery) {
  const q = query.q?.trim().toLowerCase();
  return rows.filter((row) => {
    const status = query.status ?? "active";
    if (status !== "all" && row.status !== status) return false;
    if (query.categoryId && row.categoryId !== query.categoryId) return false;
    if (query.productType && row.productType !== query.productType) return false;
    if (query.stock && row.stock !== query.stock) return false;
    if (query.digital === "shown" && !row.showInDigitalMenu) return false;
    if (query.digital === "hidden" && row.showInDigitalMenu) return false;
    if (query.hpp === "has" && row.hppStatus === "missing") return false;
    if (query.hpp === "missing" && row.hppStatus !== "missing") return false;
    if (query.hpp === "complete" && row.hppStatus !== "complete") return false;
    if (query.hpp === "incomplete" && row.hppStatus === "complete") return false;
    if (query.issue === "any" && !row.issues.length) return false;
    if (query.issue && query.issue !== "any" && !row.issues.includes(query.issue)) return false;
    if (q) {
      const haystack = [
        row.name,
        row.id,
        row.sku,
        row.barcode,
        row.brand,
        row.category,
        ...row.variants.flatMap((v) => [v.label, v.sku, v.barcode]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function sortCatalogRows(rows: CatalogRow[], sort: CatalogQuery["sort"] = "name", dir: CatalogQuery["dir"] = "asc") {
  const factor = dir === "desc" ? -1 : 1;
  const nullsLast = (value: number | null) => (value === null ? Number.POSITIVE_INFINITY * factor : value);
  const value = (row: CatalogRow): string | number => {
    switch (sort) {
      case "sku":
        return row.sku ?? "￿";
      case "category":
        return `${row.category}\u0000${row.name}`;
      case "price":
        return row.priceMin;
      case "cost":
        return row.costMin;
      case "margin":
        return nullsLast(row.marginPct);
      case "salesQty":
        return row.salesQty;
      case "updatedAt":
        return row.updatedAt;
      default:
        return row.name;
    }
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "id");
    return cmp * factor || a.name.localeCompare(b.name, "id");
  });
}

export async function getProductCatalog(query: CatalogQuery) {
  const range = query.from && query.to ? { from: query.from, to: query.to } : defaultSalesRange();
  const [rows, categories] = await Promise.all([loadCatalogRows(range), listProductCategories({ includeArchived: true })]);
  const kpis = computeCatalogKpis(rows, categories.filter((c) => c.status === "active").length);
  const filtered = sortCatalogRows(filterCatalogRows(rows, query), query.sort, query.dir);
  const pageSize = Math.min(200, Math.max(5, query.pageSize ?? 25));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, query.page ?? 1));
  return {
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages,
    kpis,
    categories,
    range,
  };
}

// ─── Aksi massal ───────────────────────────────────────────────────────────

export async function bulkProductAction(
  input: { ids: string[]; action: CatalogBulkAction; value?: string | null },
  garage: GarageSession,
) {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new ProductManagementError("VALIDATION_ERROR", "Pilih minimal 1 produk.");
  if (ids.length > 500) throw new ProductManagementError("VALIDATION_ERROR", "Maksimal 500 produk per aksi massal.");
  if (input.action === "move_category") {
    if (!input.value) throw new ProductManagementError("VALIDATION_ERROR", "Pilih kategori tujuan.");
    return moveProductsToCategory(ids, input.value, garage).then((r) => ({ updated: r.moved }));
  }

  let set: Partial<typeof menuItems.$inferInsert>;
  let field: string;
  switch (input.action) {
    case "activate":
      set = { status: "active" };
      field = "status";
      break;
    case "archive":
      set = { status: "archived" };
      field = "status";
      break;
    case "stock":
      if (!["ready", "limited", "sold_out"].includes(input.value ?? "")) {
        throw new ProductManagementError("VALIDATION_ERROR", "Status stok tidak valid.");
      }
      set = { stock: input.value as string };
      field = "stock";
      break;
    case "digital":
      if (input.value !== "shown" && input.value !== "hidden") throw new ProductManagementError("VALIDATION_ERROR", "Nilai menu digital tidak valid.");
      set = { showInDigitalMenu: input.value === "shown" };
      field = "showInDigitalMenu";
      break;
    case "product_type":
      if (!["menu", "retail", "bundle"].includes(input.value ?? "")) throw new ProductManagementError("VALIDATION_ERROR", "Tipe produk tidak valid.");
      set = { productType: input.value as string };
      field = "productType";
      break;
    default:
      throw new ProductManagementError("VALIDATION_ERROR", "Aksi tidak dikenal.");
  }

  return getDb().transaction(async (tx) => {
    const before = await tx.select().from(menuItems).where(inArray(menuItems.id, ids));
    if (input.action === "activate") {
      // Produk tidak boleh diaktifkan ke kategori yang diarsipkan/nonaktif.
      const catIds = [...new Set(before.map((row) => row.categoryId).filter((id): id is string => Boolean(id)))];
      const cats = catIds.length ? await tx.select().from(productCategories).where(inArray(productCategories.id, catIds)) : [];
      const blocked = cats.filter((c) => c.status !== "active");
      if (blocked.length) {
        throw new ProductManagementError(
          "CATEGORY_INACTIVE",
          `Kategori ${blocked.map((c) => `"${c.name}"`).join(", ")} tidak aktif. Pindahkan produk ke kategori aktif dulu.`,
        );
      }
    }
    let updated = 0;
    for (const row of before) {
      const prev = (row as Record<string, unknown>)[field];
      const next = (set as Record<string, unknown>)[field];
      if (prev === next) continue;
      await tx.update(menuItems).set({ ...set, updatedAt: new Date() }).where(eq(menuItems.id, row.id));
      await audit(tx, garage, {
        action: "Menu product bulk updated",
        object: row.name,
        status: String(next),
        metadata: { productId: row.id, bulkAction: input.action, before: { [field]: prev }, after: { [field]: next } },
      });
      updated++;
    }
    return { updated };
  });
}

/**
 * Ubah harga jual SATU varian (M3c, MCP Owner). Hanya kolom `price` — varian,
 * SKU, resep & HPP tidak disentuh (beda dengan updateMenuProduct yang menulis
 * ulang semua varian). `expectedPrice` = harga yang dilihat saat preview; bila
 * sudah berubah → STALE_PRICE. Order lama memakai snapshot harga di order_items.
 */
export async function updateVariantPrice(
  input: { itemId: string; variantId: string; price: number; expectedPrice?: number; reason: string },
  garage: GarageSession,
) {
  if (garage.profile.role !== "Owner" && garage.profile.role !== "Manajer") {
    throw new ProductManagementError("FORBIDDEN", "Hanya Owner atau Manajer yang boleh mengubah harga.", 403);
  }
  if (!Number.isInteger(input.price) || input.price < 0 || input.price > 100_000_000) {
    throw new ProductManagementError("VALIDATION_ERROR", "Harga harus bilangan bulat Rupiah 0–100.000.000.");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new ProductManagementError("REASON_REQUIRED", "Tulis alasan perubahan harga (min. 3 huruf).");

  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ id: menuVariants.id, price: menuVariants.price, label: menuVariants.label, itemName: menuItems.name })
      .from(menuVariants)
      .innerJoin(menuItems, eq(menuItems.id, menuVariants.itemId))
      .where(and(eq(menuVariants.itemId, input.itemId), eq(menuVariants.variantId, input.variantId)))
      .for("update")
      .limit(1);
    if (!row) throw new ProductManagementError("NOT_FOUND", "Varian produk tidak ditemukan.", 404);
    if (input.expectedPrice !== undefined && row.price !== input.expectedPrice) {
      throw new ProductManagementError("STALE_PRICE", `Harga sudah berubah menjadi ${row.price} sejak dilihat. Cek ulang sebelum mengubah.`, 409);
    }
    if (row.price === input.price) return { itemId: input.itemId, variantId: input.variantId, price: row.price, changed: false };
    await tx.update(menuVariants).set({ price: input.price, updatedAt: new Date() }).where(eq(menuVariants.id, row.id));
    await audit(tx, garage, {
      action: "Menu variant price updated",
      object: `${row.itemName} (${row.label})`,
      status: String(input.price),
      metadata: { productId: input.itemId, variantId: input.variantId, before: { price: row.price }, after: { price: input.price }, reason },
    });
    return { itemId: input.itemId, variantId: input.variantId, price: input.price, previousPrice: row.price, changed: true };
  });
}

/** Catat ekspor laporan produk ke audit trail. */
export async function auditProductExport(garage: GarageSession, meta: { type: string; format: string; rows: number; filters: string[] }) {
  await audit(getDb(), garage, {
    action: "Product report exported",
    object: `${meta.type}.${meta.format}`,
    status: "exported",
    metadata: meta,
  });
}
