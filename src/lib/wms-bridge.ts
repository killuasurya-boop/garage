import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryItems,
  inventoryLocationStocks,
  menuItems,
  menuRecipes,
  menuVariants,
  wmsBomItem,
  wmsCategory,
  wmsProduct,
  wmsRecipe,
  wmsWarehouse,
  wmsWarehouseStock,
} from "@/db/schema";
import { recordStockMovement, runInTx } from "@/lib/wms-service";
import { WMS_DEFAULT_WAREHOUSES, type WhArea } from "@/lib/wms-types";

// =============================================================================
// GARAGE WMS Bridge — sinkron Garage OS (inventory_items, menu_recipes) → WMS.
// Fase A: produk + stok awal. Fase B: resep POS → wms_recipe. Idempoten & aman
// re-run: metadata selalu di-upsert; stok hanya di-bootstrap bila WMS masih 0.
// =============================================================================

export type WmsBridgeSyncResult = {
  products: { created: number; updated: number; skipped: number };
  stockBootstrapped: number;
  recipes: { created: number; updated: number; skipped: number };
  syncedAt: string;
};

/** Normalisasi nama menu (sama dengan processPosSale). */
export function normalizeMenuName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\((?:hot|cold|ice|panas|dingin|sedang|pedas|barbeque|balado|campur)\)/gi, "")
    .replace(/\b(hot|cold|ice|panas|dingin|sedang|pedas|barbeque|balado|campur)\b/gi, "")
    .replace(/[-–—|].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse nama baris POS → nama menu dasar + label varian (Hot/Cold/dll). */
export function parsePosMenuName(name: string): { base: string; variantLabel: string | null } {
  const trimmed = name.trim();
  const paren = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/i);
  if (paren) {
    return { base: paren[1].trim(), variantLabel: paren[2].trim() };
  }
  const tail = trimmed.match(
    /^(.+?)\s+(Hot|Cold|Ice|Panas|Dingin|Sedang|Pedas|Barbeque|Balado|Campur)\s*$/i,
  );
  if (tail) {
    return { base: tail[1].trim(), variantLabel: tail[2].trim() };
  }
  return { base: trimmed, variantLabel: null };
}

function variantLabelToId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function recipeDisplayName(menuName: string, variantLabel: string, multiVariant: boolean): string {
  const base = menuName.trim();
  if (!multiVariant || variantLabel.toLowerCase() === "regular" || variantLabel === "all") {
    return base;
  }
  return `${base} ${variantLabel}`;
}

type BomLineMeta = { qty: number; wastePct: number; lineType: string };

function isPackagingSku(category: string): boolean {
  return /kemasan|packaging|cup|lid|straw|box|bag|label|sleeve/i.test(category);
}

function buildBomMap(
  lines: Array<{ inventorySku: string | null; qty: number; wastePct: number; unit: string }>,
  skuToProduct: Map<string, string>,
  skuToCategory: Map<string, string>,
): Map<string, BomLineMeta> {
  const bomMap = new Map<string, BomLineMeta>();
  for (const line of lines) {
    if (!line.inventorySku) continue;
    const productId = skuToProduct.get(line.inventorySku);
    if (!productId) continue;
    const cat = skuToCategory.get(line.inventorySku) ?? "";
    const lineType = isPackagingSku(cat) || isPackagingSku(line.unit) ? "packaging" : "ingredient";
    const prev = bomMap.get(productId);
    const qty = Number(line.qty) + (prev?.qty ?? 0);
    bomMap.set(productId, {
      qty,
      wastePct: Number(line.wastePct) || prev?.wastePct || 0,
      lineType: prev?.lineType === "packaging" || lineType === "packaging" ? "packaging" : "ingredient",
    });
  }
  return bomMap;
}

async function upsertOsRecipe(
  db: ReturnType<typeof getDb>,
  opts: {
    menuId: string;
    variantId: string;
    name: string;
    category: string;
    subCategory: string;
    productionArea: string;
    recipeSku: string;
    sellPrice: number;
    bomMap: Map<string, BomLineMeta>;
  },
): Promise<"created" | "updated" | "skipped"> {
  if (opts.bomMap.size === 0) return "skipped";

  const versionKey = `os:${opts.menuId}:${opts.variantId}`;
  const [existing] = await db.select().from(wmsRecipe).where(eq(wmsRecipe.version, versionKey)).limit(1);

  let recipeId: string;
  if (existing) {
    recipeId = existing.id;
    await db
      .update(wmsRecipe)
      .set({
        name: opts.name,
        recipeSku: opts.recipeSku,
        category: opts.category,
        subCategory: opts.subCategory,
        productionArea: opts.productionArea,
        sellPrice: opts.sellPrice > 0 ? opts.sellPrice : existing.sellPrice,
        recipeStatus: "published",
        updatedAt: new Date(),
      })
      .where(eq(wmsRecipe.id, existing.id));
    await db.delete(wmsBomItem).where(eq(wmsBomItem.recipeId, existing.id));
  } else {
    const [rec] = await db
      .insert(wmsRecipe)
      .values({
        name: opts.name,
        recipeSku: opts.recipeSku,
        recipeCode: opts.recipeSku || opts.menuId,
        category: opts.category,
        subCategory: opts.subCategory,
        productionArea: opts.productionArea,
        sellPrice: Math.round(opts.sellPrice),
        yieldQty: "1",
        yieldUnit: "porsi",
        recipeStatus: "published",
        version: versionKey,
      })
      .returning();
    recipeId = rec.id;
  }

  await db.insert(wmsBomItem).values(
    [...opts.bomMap.entries()].map(([productId, meta]) => ({
      recipeId,
      productId,
      qty: meta.qty,
      wastePct: meta.wastePct,
      lineType: meta.lineType,
    })),
  );
  return existing ? "updated" : "created";
}

function usageToArea(usageArea: string): WhArea {
  if (usageArea === "bar") return "bar";
  if (usageArea === "dapur") return "dapur";
  return "umum";
}

function categoryForItem(category: string, usageArea: string): string {
  const area = usageToArea(usageArea);
  if (area === "bar") return category.trim() || "Bahan Bar";
  if (area === "dapur") return category.trim() || "Bahan Dapur";
  return category.trim() || "Umum / Lainnya";
}

async function ensureCategory(db: ReturnType<typeof getDb>, name: string, area: WhArea) {
  await db
    .insert(wmsCategory)
    .values({ name, area })
    .onConflictDoNothing();
}

async function warehouseMap(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(wmsWarehouse);
  const byTypeArea = new Map<string, string>();
  for (const w of rows) {
    byTypeArea.set(`${w.type}:${w.area}`, w.id);
  }
  const primary = rows.find((w) => w.isPrimary)?.id ?? rows[0]?.id ?? null;
  return {
    primary,
    mainForArea: (area: WhArea) =>
      byTypeArea.get(`main:${area}`) ?? byTypeArea.get("main:bar") ?? primary,
    barOutlet: byTypeArea.get("bar:bar") ?? null,
    kitchenOutlet: byTypeArea.get("kitchen:dapur") ?? null,
  };
}

async function ensureBridgeWarehouses() {
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

/** Sinkron SKU inventory_items → wms_product (+ bootstrap stok bila WMS masih 0). */
export async function syncOsInventoryToWms(opts?: { bootstrapStock?: boolean }): Promise<
  Pick<WmsBridgeSyncResult, "products" | "stockBootstrapped">
> {
  await ensureBridgeWarehouses();
  const db = getDb();
  const bootstrapStock = opts?.bootstrapStock !== false;
  const wh = await warehouseMap(db);

  const items = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.stage, "active"));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let stockBootstrapped = 0;

  const locStocks = await db.select().from(inventoryLocationStocks);
  const locBySku = new Map(locStocks.map((s) => [`${s.itemSku}:${s.locationType}:${s.locationKey}`, s]));

  for (const item of items) {
    const area = usageToArea(item.usageArea);
    const catName = categoryForItem(item.category, item.usageArea);
    await ensureCategory(db, catName, area);

    // unitCost OS = HPP per unit inventory (rupiah); dipetakan langsung ke wms_product.hpp.
    const hppValue = Number(item.unitCost) || 0;

    const existing = await db.select().from(wmsProduct).where(eq(wmsProduct.sku, item.sku)).limit(1);
    if (existing.length === 0) {
      await db.insert(wmsProduct).values({
        sku: item.sku,
        name: item.name,
        category: catName,
        unit: item.unit,
        minStock: Number(item.min) || 0,
        hpp: hppValue,
      });
      created++;
    } else {
      await db
        .update(wmsProduct)
        .set({
          name: item.name,
          category: catName,
          unit: item.unit,
          minStock: Number(item.min) || 0,
          hpp: hppValue > 0 ? hppValue : existing[0].hpp,
          updatedAt: new Date(),
        })
        .where(eq(wmsProduct.sku, item.sku));
      updated++;
    }

    if (!bootstrapStock) continue;

    const [prod] = await db.select().from(wmsProduct).where(eq(wmsProduct.sku, item.sku)).limit(1);
    if (!prod) {
      skipped++;
      continue;
    }

    const targets: Array<{ warehouseId: string; qty: number }> = [];

    const whStock = locBySku.get(`${item.sku}:warehouse:warehouse`);
    const whQty = whStock ? Number(whStock.onHand) : Number(item.onHand);
    const mainId = wh.mainForArea(area);
    if (mainId && whQty > 0) targets.push({ warehouseId: mainId, qty: whQty });

    for (const loc of locStocks.filter((s) => s.itemSku === item.sku && s.locationType === "outlet")) {
      const outletId =
        area === "bar" ? wh.barOutlet : area === "dapur" ? wh.kitchenOutlet : wh.kitchenOutlet;
      if (outletId && Number(loc.onHand) > 0) {
        targets.push({ warehouseId: outletId, qty: Number(loc.onHand) });
      }
    }

    for (const t of targets) {
      const [cur] = await db
        .select({ qty: wmsWarehouseStock.qty })
        .from(wmsWarehouseStock)
        .where(and(eq(wmsWarehouseStock.productId, prod.id), eq(wmsWarehouseStock.warehouseId, t.warehouseId)))
        .limit(1);
      if (cur && Number(cur.qty) > 0) continue;

      await runInTx((tx) =>
        recordStockMovement(tx, {
          type: "in",
          productId: prod.id,
          warehouseId: t.warehouseId,
          deltaQty: t.qty,
          hpp: hppValue,
          refDoc: "OS-SYNC",
          batchNo: `SYNC-${item.sku}`,
        }),
      );
      stockBootstrapped++;
    }
  }

  return { products: { created, updated, skipped }, stockBootstrapped };
}

/** Sinkron menu_recipes → wms_recipe + BOM (1 resep per varian bila perlu). */
export async function syncOsRecipesToWms(): Promise<Pick<WmsBridgeSyncResult, "recipes">> {
  await ensureBridgeWarehouses();
  const db = getDb();

  const menus = await db.select().from(menuItems).where(eq(menuItems.status, "active"));
  const allRecipes = await db
    .select()
    .from(menuRecipes)
    .where(eq(menuRecipes.status, "active"));
  const variants = await db.select().from(menuVariants);

  const skuToProduct = new Map(
    (await db.select({ id: wmsProduct.id, sku: wmsProduct.sku, category: wmsProduct.category }).from(wmsProduct)).map(
      (p) => [p.sku, p.id],
    ),
  );
  const skuToCategory = new Map(
    (await db.select({ sku: wmsProduct.sku, category: wmsProduct.category }).from(wmsProduct)).map((p) => [
      p.sku,
      p.category,
    ]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const menu of menus) {
    const menuVariants = variants.filter((v) => v.itemId === menu.id);
    const itemRecipes = allRecipes.filter((r) => r.menuItemId === menu.id);
    if (itemRecipes.length === 0) {
      skipped++;
      continue;
    }

    const multiVariant =
      menuVariants.length > 1 ||
      menuVariants.some((v) => v.variantId !== "all" && v.label.toLowerCase() !== "regular");

    const variantIdsInLines = [...new Set(itemRecipes.map((r) => r.variantId))];
    const specificIds = variantIdsInLines.filter((id) => id !== "all");
    const syncVariantIds = multiVariant && specificIds.length > 0 ? specificIds : ["all"];

    let menuSynced = false;
    for (const variantId of syncVariantIds) {
      const lines = itemRecipes.filter((r) => r.variantId === variantId || r.variantId === "all");
      const bomMap = buildBomMap(lines, skuToProduct, skuToCategory);
      if (bomMap.size === 0) continue;

      const variantRow = menuVariants.find((v) => v.variantId === variantId);
      const variantLabel = variantRow?.label ?? (variantId === "all" ? "Regular" : variantId);
      const sellPrice = variantRow ? Number(variantRow.price) : Math.min(...menuVariants.map((v) => Number(v.price)));
      const productionArea = /bar|coffee|minum|drink/i.test(menu.section) ? "bar" : "dapur";

      const result = await upsertOsRecipe(db, {
        menuId: menu.id,
        variantId,
        name: recipeDisplayName(menu.name, variantLabel, multiVariant),
        category: menu.category,
        subCategory: menu.section,
        productionArea,
        recipeSku: menu.sku ? `${menu.sku}${variantId !== "all" ? `-${variantId}` : ""}` : menu.id,
        sellPrice: Number.isFinite(sellPrice) ? sellPrice : 0,
        bomMap,
      });
      if (result === "created") {
        created++;
        menuSynced = true;
      } else if (result === "updated") {
        updated++;
        menuSynced = true;
      }
    }
    if (!menuSynced) skipped++;
  }

  return { recipes: { created, updated, skipped } };
}

/** Jalankan sinkron penuh OS → WMS. */
export async function syncOsToWms(opts?: { bootstrapStock?: boolean }): Promise<WmsBridgeSyncResult> {
  const inv = await syncOsInventoryToWms(opts);
  const rec = await syncOsRecipesToWms();
  return {
    ...inv,
    ...rec,
    syncedAt: new Date().toISOString(),
  };
}

export type ResolvedMenuBom = {
  menuItemId: string;
  name: string;
  category: string;
  sellPrice: number;
  lines: Array<{ productId: string; qty: number; area: WhArea }>;
};

/** Resolve BOM dari menu OS (fallback bila wms_recipe belum ada / belum sync). */
export async function resolveMenuBom(menuName: string): Promise<ResolvedMenuBom | null> {
  const db = getDb();
  const parsed = parsePosMenuName(menuName);
  const trimmed = parsed.base.trim();
  const norm = normalizeMenuName(menuName);

  const menus = await db.select().from(menuItems).where(eq(menuItems.status, "active"));
  const menu =
    menus.find((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase()) ??
    menus.find((m) => normalizeMenuName(m.name) === norm) ??
    null;
  if (!menu) return null;

  const variantRows = await db.select().from(menuVariants).where(eq(menuVariants.itemId, menu.id));
  const variantIdHint = parsed.variantLabel
    ? variantRows.find(
        (v) =>
          v.label.trim().toLowerCase() === parsed.variantLabel!.trim().toLowerCase() ||
          v.variantId === variantLabelToId(parsed.variantLabel!),
      )?.variantId
    : null;

  const recipes = await db
    .select()
    .from(menuRecipes)
    .where(and(eq(menuRecipes.menuItemId, menu.id), eq(menuRecipes.status, "active")));

  let recipeLines = recipes;
  if (variantIdHint) {
    const specific = recipes.filter((r) => r.variantId === variantIdHint);
    const shared = recipes.filter((r) => r.variantId === "all");
    recipeLines = specific.length > 0 ? [...specific, ...shared] : recipes.filter((r) => r.variantId === "all");
  } else {
    const base = recipes.filter((r) => r.variantId === "all");
    recipeLines = base.length > 0 ? base : recipes;
  }

  const cats = await db.select().from(wmsCategory);
  const areaByCat = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.area as WhArea]));

  const invRows = await db
    .select({ sku: inventoryItems.sku, category: inventoryItems.category, usageArea: inventoryItems.usageArea })
    .from(inventoryItems);
  const areaBySku = new Map(
    invRows.map((i) => [
      i.sku,
      usageToArea(i.usageArea),
    ]),
  );

  const skuToProduct = new Map(
    (await db.select({ id: wmsProduct.id, sku: wmsProduct.sku, category: wmsProduct.category }).from(wmsProduct)).map(
      (p) => [p.sku, p],
    ),
  );

  const bomMap = new Map<string, { qty: number; area: WhArea }>();
  for (const line of recipeLines) {
    if (!line.inventorySku) continue;
    const prod = skuToProduct.get(line.inventorySku);
    if (!prod) continue;
    const eff = Number(line.qty) * (1 + Number(line.wastePct) / 100);
    const area =
      areaBySku.get(line.inventorySku) ??
      areaByCat.get((prod.category ?? "").trim().toLowerCase()) ??
      "umum";
    const prev = bomMap.get(prod.id);
    bomMap.set(prod.id, { qty: (prev?.qty ?? 0) + eff, area });
  }
  if (bomMap.size === 0) return null;

  const sellPrice = variantIdHint
    ? Number(variantRows.find((v) => v.variantId === variantIdHint)?.price ?? 0)
    : Number(
        variantRows.length > 0
          ? Math.min(...variantRows.map((v) => Number(v.price)))
          : 0,
      );

  return {
    menuItemId: menu.id,
    name: parsed.variantLabel ? recipeDisplayName(menu.name, parsed.variantLabel, true) : menu.name,
    category: menu.category,
    sellPrice,
    lines: [...bomMap.entries()].map(([productId, v]) => ({
      productId,
      qty: v.qty,
      area: v.area,
    })),
  };
}

export type WmsRecipeCoverage = {
  totalProducts: number;
  withMenuRecipes: number;
  syncedToWms: number;
  coveragePct: number;
  missingMenuRecipes: Array<{ id: string; name: string; category: string }>;
  pendingSync: Array<{ id: string; name: string; category: string }>;
};

/** Laporan cakupan BOM: produk OS vs menu_recipes vs wms_recipe. */
export async function getWmsRecipeCoverage(): Promise<WmsRecipeCoverage> {
  const db = getDb();
  const menus = await db
    .select({ id: menuItems.id, name: menuItems.name, category: menuItems.category })
    .from(menuItems)
    .where(eq(menuItems.status, "active"));

  const recipeRows = await db
    .select({ menuItemId: menuRecipes.menuItemId })
    .from(menuRecipes)
    .where(eq(menuRecipes.status, "active"));
  const menusWithRecipes = new Set(recipeRows.map((r) => r.menuItemId).filter(Boolean) as string[]);

  const syncedRows = await db
    .select({ version: wmsRecipe.version })
    .from(wmsRecipe)
    .where(sql`${wmsRecipe.version} like 'os:%'`);
  const syncedMenuIds = new Set(
    syncedRows
      .map((r) => r.version?.split(":")[1])
      .filter((id): id is string => Boolean(id)),
  );

  const missingMenuRecipes = menus.filter((m) => !menusWithRecipes.has(m.id));
  const pendingSync = menus.filter((m) => menusWithRecipes.has(m.id) && !syncedMenuIds.has(m.id));
  const withMenuRecipes = menus.length - missingMenuRecipes.length;
  const syncedToWms = syncedMenuIds.size;
  const coveragePct = menus.length > 0 ? Math.round((syncedToWms / menus.length) * 1000) / 10 : 100;

  return {
    totalProducts: menus.length,
    withMenuRecipes,
    syncedToWms,
    coveragePct,
    missingMenuRecipes: missingMenuRecipes.map((m) => ({ id: m.id, name: m.name, category: m.category })),
    pendingSync: pendingSync.map((m) => ({ id: m.id, name: m.name, category: m.category })),
  };
}
