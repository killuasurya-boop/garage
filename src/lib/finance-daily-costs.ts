import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { inventoryItems, menuItems, menuRecipes, orderItems, orders, wmsCategory } from "@/db/schema";
import {
  DEFAULT_VARIABLE_BUDGET,
  addDays,
  jakartaDateKey,
  jakartaDayStart,
  type VariableBudget,
} from "@/lib/finance-control-core";
import { loadDayRaws, loadFinanceConfig } from "@/lib/finance-control";
import { productionStationFor } from "@/lib/garage-production-rules";
import { getWmsProducts, getWmsSmartReorder } from "@/lib/wms-service";

export type CostArea = "bar" | "dapur";

export type BudgetStatus = "kosong" | "di_bawah" | "sesuai" | "melebihi";

export type DailyCosts = {
  date: string;
  fixed: {
    items: Array<{ code: string; name: string; dailyAmount: number; isReserve: boolean }>;
    operational: number;
    reserve: number;
    total: number;
  };
  variable: {
    /** HPP bahan baku terpakai (resep × harga beli per unit) dari order lunas hari ini. */
    areas: Array<{
      area: CostArea;
      label: string;
      actual: number;
      budgetMin: number;
      budgetMax: number;
      status: BudgetStatus;
      /** Baris terjual yang menunya belum punya resep (HPP dihitung 0). */
      linesWithoutRecipe: number;
      /** Pemakaian bahan menurut resep (info) — pembanding belanja. */
      recipeUsage: number;
    }>;
    /** "purchase" = actual = belanja diterima gudang hari ini; "recipe" = HPP terpakai. */
    basis: "purchase" | "recipe";
    total: number;
    budgetMin: number;
    budgetMax: number;
  };
  shopping: {
    areas: Array<{
      area: CostArea | "umum";
      label: string;
      estimatedCost: number;
      items: Array<{
        sku: string;
        name: string;
        unit: string;
        onHand: number;
        minStock: number;
        suggestedQty: number;
        packages: number | null;
        packageLabel: string | null;
        estimatedCost: number;
        urgency: "critical" | "low" | "ok";
        daysCover: number | null;
      }>;
    }>;
    totalEstimatedCost: number;
  };
};

const AREA_LABEL: Record<CostArea | "umum", string> = { bar: "Bar", dapur: "Dapur", umum: "Umum" };

export function budgetStatus(actual: number, min: number, max: number): BudgetStatus {
  if (actual <= 0) return "kosong";
  if (actual > max) return "melebihi";
  if (actual < min) return "di_bawah";
  return "sesuai";
}

/**
 * Biaya harian Owner dalam satu tempat:
 * - biaya tetap dari master Biaya Harian (Pengaturan Keuangan) — satu sumber;
 * - biaya tidak tetap OTOMATIS = HPP bahan baku yang terpakai oleh penjualan
 *   lunas hari ini (resep × harga beli), dipisah Bar/Dapur sesuai stasiun menu;
 * - daftar belanja otomatis dari stok gudang yang habis/menipis (Smart Reorder WMS).
 */
export async function getDailyCosts(dateKey = jakartaDateKey()): Promise<DailyCosts> {
  const db = getDb();
  const config = await loadFinanceConfig();
  const budget: VariableBudget = config.variableBudget ?? DEFAULT_VARIABLE_BUDGET;

  const fixedItems = config.costItems
    .filter((item) => item.active && item.dailyAmount > 0)
    .map((item) => ({
      code: item.code,
      name: item.name,
      dailyAmount: item.dailyAmount,
      isReserve: item.treatment === "reserve",
    }));
  const operational = fixedItems.filter((i) => !i.isReserve).reduce((s, i) => s + i.dailyAmount, 0);
  const reserve = fixedItems.filter((i) => i.isReserve).reduce((s, i) => s + i.dailyAmount, 0);

  const start = jakartaDayStart(dateKey);
  const end = jakartaDayStart(addDays(dateKey, 1));
  const paidToday = and(eq(orders.status, "paid"), gte(orders.createdAt, start), lt(orders.createdAt, end));

  const [cogsRows, lineRows] = await Promise.all([
    db
      .select({
        station: menuItems.station,
        category: menuItems.category,
        cogs: sql<string>`coalesce(sum(${orderItems.qty} * ${menuRecipes.qty} * coalesce(${inventoryItems.unitCost}, 0) * (1 + greatest(${menuRecipes.wastePct}, 0) / 100.0)), 0)::float8`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
      .innerJoin(
        menuRecipes,
        and(
          eq(orderItems.menuItemId, menuRecipes.menuItemId),
          eq(menuRecipes.status, "active"),
          sql`(${menuRecipes.variantId} = ${orderItems.variantId} or ${menuRecipes.variantId} = 'all')`,
        ),
      )
      .leftJoin(inventoryItems, eq(menuRecipes.inventorySku, inventoryItems.sku))
      .where(paidToday)
      .groupBy(menuItems.station, menuItems.category),
    db
      .select({
        station: menuItems.station,
        category: menuItems.category,
        withoutRecipe: sql<string>`count(*) filter (where not exists (
          select 1 from ${menuRecipes}
          where ${menuRecipes.menuItemId} = ${orderItems.menuItemId}
            and ${menuRecipes.status} = 'active'
            and (${menuRecipes.variantId} = ${orderItems.variantId} or ${menuRecipes.variantId} = 'all')
        ))::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
      .where(paidToday)
      .groupBy(menuItems.station, menuItems.category),
  ]);

  const areaOf = (row: { station: string | null; category: string | null }): CostArea =>
    productionStationFor(row) === "Bar" ? "bar" : "dapur";
  const actual: Record<CostArea, number> = { bar: 0, dapur: 0 };
  const noRecipe: Record<CostArea, number> = { bar: 0, dapur: 0 };
  for (const row of cogsRows) actual[areaOf(row)] += Number(row.cogs);
  for (const row of lineRows) noRecipe[areaOf(row)] += Number(row.withoutRecipe);

  // Konsep owner (mode purchase): anggaran dibandingkan dengan belanja yang
  // benar-benar diterima gudang hari ini; pemakaian resep tetap jadi info.
  const basis = config.cogsBasis ?? "purchase";
  const purchases = basis === "purchase" ? ((await loadDayRaws(dateKey, dateKey)).get(dateKey)?.purchases ?? null) : null;

  const areas = (["bar", "dapur"] as const).map((area) => {
    const min = area === "bar" ? budget.barMin : budget.dapurMin;
    const max = area === "bar" ? budget.barMax : budget.dapurMax;
    const recipeUsage = Math.round(actual[area]);
    const value = purchases ? Math.round(purchases[area]) : recipeUsage;
    return {
      area,
      label: AREA_LABEL[area],
      actual: value,
      budgetMin: min,
      budgetMax: max,
      status: budgetStatus(value, min, max),
      linesWithoutRecipe: noRecipe[area],
      recipeUsage,
    };
  });

  // Daftar belanja: stok habis/menipis dari WMS + estimasi biaya (per kemasan bila ada).
  const [reorder, products, categories] = await Promise.all([
    getWmsSmartReorder(),
    getWmsProducts(),
    db.select({ name: wmsCategory.name, area: wmsCategory.area }).from(wmsCategory),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const areaByCategory = new Map(categories.map((c) => [c.name, c.area]));
  const groups = new Map<CostArea | "umum", DailyCosts["shopping"]["areas"][number]>();
  for (const item of reorder.items) {
    if (item.suggestedQty <= 0) continue;
    const product = productById.get(item.id);
    const rawArea = areaByCategory.get(product?.category ?? "") ?? "umum";
    const area: CostArea | "umum" = rawArea === "bar" || rawArea === "dapur" ? rawArea : "umum";
    const packQty = Number(product?.packQty ?? 0);
    const packPrice = Number(product?.packPrice ?? 0);
    const packages = packQty > 0 ? Math.ceil(item.suggestedQty / packQty) : null;
    const estimatedCost = Math.round(
      packages !== null && packPrice > 0 ? packages * packPrice : item.suggestedQty * Number(product?.hpp ?? 0),
    );
    const group = groups.get(area) ?? { area, label: AREA_LABEL[area], estimatedCost: 0, items: [] };
    group.items.push({
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      onHand: item.onHand,
      minStock: item.minStock,
      suggestedQty: item.suggestedQty,
      packages,
      packageLabel: product?.packageLabel ?? null,
      estimatedCost,
      urgency: item.urgency as "critical" | "low" | "ok",
      daysCover: item.daysCover,
    });
    group.estimatedCost += estimatedCost;
    groups.set(area, group);
  }
  const shoppingAreas = (["bar", "dapur", "umum"] as const)
    .map((area) => groups.get(area))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  return {
    date: dateKey,
    fixed: { items: fixedItems, operational, reserve, total: operational + reserve },
    variable: {
      areas,
      basis,
      total: areas.reduce((s, a) => s + a.actual, 0),
      budgetMin: budget.barMin + budget.dapurMin,
      budgetMax: budget.barMax + budget.dapurMax,
    },
    shopping: {
      areas: shoppingAreas,
      totalEstimatedCost: shoppingAreas.reduce((s, a) => s + a.estimatedCost, 0),
    },
  };
}
