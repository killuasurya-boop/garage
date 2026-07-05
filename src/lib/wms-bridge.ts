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

/** Sinkron menu_recipes → wms_recipe + BOM (nama resep = nama menu POS). */
export async function syncOsRecipesToWms(): Promise<Pick<WmsBridgeSyncResult, "recipes">> {
  await ensureBridgeWarehouses();
  const db = getDb();

  const menus = await db.select().from(menuItems).where(eq(menuItems.status, "active"));
  const allRecipes = await db
    .select()
    .from(menuRecipes)
    .where(eq(menuRecipes.status, "active"));
  const variants = await db.select().from(menuVariants);
  const priceByItem = new Map<string, number>();
  for (const v of variants) {
    const cur = priceByItem.get(v.itemId) ?? Infinity;
    priceByItem.set(v.itemId, Math.min(cur, Number(v.price)));
  }

  const skuToProduct = new Map(
    (await db.select({ id: wmsProduct.id, sku: wmsProduct.sku }).from(wmsProduct)).map((p) => [
      p.sku,
      p.id,
    ]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const menu of menus) {
    const lines = allRecipes.filter((r) => r.menuItemId === menu.id && r.variantId === "all");
    const recipeLines =
      lines.length > 0
        ? lines
        : allRecipes.filter((r) => r.menuItemId === menu.id);

    const bomMap = new Map<string, number>();
    for (const line of recipeLines) {
      if (!line.inventorySku) continue;
      const productId = skuToProduct.get(line.inventorySku);
      if (!productId) continue;
      const eff = Number(line.qty) * (1 + Number(line.wastePct) / 100);
      bomMap.set(productId, (bomMap.get(productId) ?? 0) + eff);
    }
    if (bomMap.size === 0) {
      skipped++;
      continue;
    }

    const sellPrice = priceByItem.get(menu.id) ?? 0;
    const [existing] = await db
      .select()
      .from(wmsRecipe)
      .where(sql`lower(trim(${wmsRecipe.name})) = lower(trim(${menu.name}))`)
      .limit(1);

    let recipeId: string;
    if (existing) {
      recipeId = existing.id;
      await db
        .update(wmsRecipe)
        .set({
          category: menu.category,
          sellPrice: sellPrice > 0 ? sellPrice : existing.sellPrice,
          updatedAt: new Date(),
        })
        .where(eq(wmsRecipe.id, existing.id));
      await db.delete(wmsBomItem).where(eq(wmsBomItem.recipeId, existing.id));
      updated++;
    } else {
      const [rec] = await db
        .insert(wmsRecipe)
        .values({
          name: menu.name.trim(),
          category: menu.category,
          sellPrice: Math.round(sellPrice),
          yieldQty: "1",
          version: "os-sync",
        })
        .returning();
      recipeId = rec.id;
      created++;
    }

    await db.insert(wmsBomItem).values(
      [...bomMap.entries()].map(([productId, qty]) => ({
        recipeId,
        productId,
        qty,
      })),
    );
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
  const trimmed = menuName.trim();
  const norm = normalizeMenuName(trimmed);

  const menus = await db.select().from(menuItems).where(eq(menuItems.status, "active"));
  let menu =
    menus.find((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase()) ??
    menus.find((m) => normalizeMenuName(m.name) === norm) ??
    null;
  if (!menu) return null;

  const recipes = await db
    .select()
    .from(menuRecipes)
    .where(and(eq(menuRecipes.menuItemId, menu.id), eq(menuRecipes.status, "active")));
  const base = recipes.filter((r) => r.variantId === "all");
  const recipeLines = base.length > 0 ? base : recipes;

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

  const [priceRow] = await db
    .select({ price: sql<number>`min(${menuVariants.price})::int` })
    .from(menuVariants)
    .where(eq(menuVariants.itemId, menu.id));

  return {
    menuItemId: menu.id,
    name: menu.name,
    category: menu.category,
    sellPrice: Number(priceRow?.price ?? 0),
    lines: [...bomMap.entries()].map(([productId, v]) => ({
      productId,
      qty: v.qty,
      area: v.area,
    })),
  };
}
