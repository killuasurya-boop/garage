import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Bridge — sync inventory_items + menu_recipes → WMS
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let bridge: any;
let svc: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  const d = t.getDb();
  const { schema } = t;

  await d.insert(schema.inventoryItems).values({
    sku: "INV-BRIDGE-01",
    name: "Kopi Bubuk Bridge",
    alternativeName: "",
    category: "Bahan Bar",
    usageArea: "bar",
    unit: "gram",
    packageSize: "1 kg",
    unitCost: 120,
    onHand: 500,
    min: 100,
    status: "safe",
    stage: "active",
    movement: "",
  });

  await d.insert(schema.menuItems).values({
    id: "menu-bridge-latte",
    name: "Latte Bridge Test",
    category: "Coffee",
    section: "Coffee",
    prep: "5m",
    status: "active",
  });
  await d.insert(schema.menuVariants).values({
    itemId: "menu-bridge-latte",
    variantId: "all",
    label: "Regular",
    price: 25_000,
  });
  await d.insert(schema.menuRecipes).values({
    menuItemId: "menu-bridge-latte",
    variantId: "all",
    inventorySku: "INV-BRIDGE-01",
    qty: 18,
    unit: "gram",
    wastePct: 0,
    status: "active",
  });

  bridge = await import("@/lib/wms-bridge");
  svc = await import("@/lib/wms-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("WMS OS bridge", () => {
  it("syncOsToWms membuat wms_product dari inventory_items", async () => {
    const res = await bridge.syncOsToWms({ bootstrapStock: true });
    expect(res.products.created + res.products.updated).toBeGreaterThan(0);

    const prods = await svc.getWmsProducts();
    const hit = prods.find((p: any) => p.sku === "INV-BRIDGE-01");
    expect(hit).toBeTruthy();
    expect(hit.name).toBe("Kopi Bubuk Bridge");
    expect(hit.onHand).toBeGreaterThan(0);
  });

  it("syncOsRecipesToWms membuat wms_recipe dari menu_recipes", async () => {
    const res = await bridge.syncOsRecipesToWms();
    expect(res.recipes.created + res.recipes.updated).toBeGreaterThan(0);

    const recipes = await svc.listWmsRecipes();
    const hit = recipes.find((r: any) => r.name === "Latte Bridge Test");
    expect(hit).toBeTruthy();
  });

  it("processPosSale fallback menu OS bila wms_recipe belum manual", async () => {
    const d = t.getDb();
    await d.delete(t.schema.wmsRecipe).where(eq(t.schema.wmsRecipe.name, "Latte Bridge Test"));

    const before = (await svc.getWmsProducts()).find((p: any) => p.sku === "INV-BRIDGE-01").onHand;
    const res = await svc.processPosSale({ items: [{ name: "Latte Bridge Test", qty: 2 }] });
    expect(res.processed.length).toBe(1);
    const after = (await svc.getWmsProducts()).find((p: any) => p.sku === "INV-BRIDGE-01").onHand;
    expect(after).toBe(before - 36);
  });

  it("getWmsRecipeCoverage melaporkan cakupan resep tersinkron", async () => {
    await bridge.syncOsRecipesToWms(); // pastikan resep OS tersinkron ke WMS
    const cov = await bridge.getWmsRecipeCoverage();
    expect(cov.totalProducts).toBeGreaterThan(0);
    expect(cov.syncedToWms).toBeGreaterThan(0);
    expect(cov.coveragePct).toBeGreaterThan(0);
    expect(Array.isArray(cov.missingMenuRecipes)).toBe(true);
  });
});
