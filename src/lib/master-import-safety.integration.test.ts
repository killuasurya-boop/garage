import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";

import * as planner from "@/lib/master-import-plan";
import {
  seedGarageBasics,
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// Exercise real planning, transactions, approval, and database constraints. Only
// replace workbook decoding: small fixtures make the failure cases explicit and
// avoid depending on a binary workbook for transaction-safety regressions.
let t: GarageTestDb;
let service: typeof import("@/lib/master-import");
let parseWorkbook: MockInstance<typeof planner.parseMasterWorkbook>;
const actor = { id: "owner-master-safety", name: "Owner Master Safety" };
let sequence = 100;

beforeAll(async () => {
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: actor.id });
  parseWorkbook = vi.spyOn(planner, "parseMasterWorkbook");
  service = await import("@/lib/master-import");
}, 60_000);

afterAll(async () => {
  parseWorkbook?.mockRestore();
  await teardownGarageTestDb(t);
});

async function fixture() {
  const suffix = String(++sequence);
  const menuItemId = `master-safety-${suffix}`;
  const menuName = `Menu Safety ${suffix}`;
  const sku = `KIT-${suffix}`;
  await t.getDb().insert(t.schema.menuItems).values({
    id: menuItemId, name: menuName, category: "Makanan", section: "Makanan", prep: "5m",
  });
  await t.getDb().insert(t.schema.menuVariants).values({
    itemId: menuItemId, variantId: "reg", label: "Regular", price: 20_000,
  });
  const data: planner.MasterWorkbookData = {
    sheetNames: ["Master Bahan", "Recipe Detail", "POS Menu Register"],
    warnings: [],
    materials: [{
      key: sku, station: "Dapur", name: `Bahan Safety ${suffix}`, baseUnit: "gr",
      packQty: 1000, packPriceModel: 10_000, unitCost: 10,
      confidence: "HIGH", note: "Valid fixture", sourceUnit: "gr", row: 2,
    }],
    recipeLines: [{
      recipeId: `KT-${suffix}`, menu: menuName, station: "Dapur", materialKey: sku,
      qty: 50, unit: "gr", confidence: "HIGH", row: 2,
    }],
    posRegister: [{
      posSku: `POS-${suffix}`, name: menuName, station: "Dapur", variant: "Regular",
      price: 20_000, recipeLink: `KT-${suffix}`, row: 2,
    }],
  };
  parseWorkbook.mockReturnValue(data);
  return {
    menuItemId, sku, recipeId: `KT-${suffix}`,
    input: { buffer: Buffer.from(`master-safety-${suffix}`), fileName: `safety-${suffix}.xlsx` },
  };
}

async function recipesFor(menuItemId: string) {
  return t.getDb().select().from(t.schema.menuRecipes)
    .where(eq(t.schema.menuRecipes.menuItemId, menuItemId));
}

async function assertStillDraft(menuItemId: string) {
  const rows = await recipesFor(menuItemId);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r: { status: string }) => r.status === "draft")).toBe(true);
  const [variant] = await t.getDb().select().from(t.schema.menuVariants)
    .where(eq(t.schema.menuVariants.itemId, menuItemId));
  expect(Number(variant.baseCost)).toBe(0);
}

describe("Master import safety", () => {
  it("preserves a rejected recipe on reimport without reporting a phantom draft", async () => {
    const f = await fixture();
    const first = await service.applyMasterImport(f.input, actor);
    expect(first.recipesDrafted).toBe(1);
    await service.rejectDraftRecipe(f.menuItemId, "Gramasi belum lolos uji batch", actor);

    const repeat = await service.applyMasterImport(f.input, actor);
    expect(repeat.materialsCreated).toBe(0);
    expect(repeat.recipesDrafted).toBe(0);
    const rows = await recipesFor(f.menuItemId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("archived");
    const [crosswalk] = await t.getDb().select().from(t.schema.masterCrosswalk)
      .where(and(eq(t.schema.masterCrosswalk.kind, "recipe"), eq(t.schema.masterCrosswalk.sourceKey, f.recipeId)));
    expect(crosswalk.status).toBe("skipped");
    expect(crosswalk.note).toBe("Ditolak: Gramasi belum lolos uji batch");
    expect((await service.listDraftRecipes()).some((r) => r.menuItemId === f.menuItemId)).toBe(false);
  });

  it("applies concurrent copies once and returns a successful idempotent result for both", async () => {
    const f = await fixture();
    const results = await Promise.all([
      service.applyMasterImport(f.input, actor),
      service.applyMasterImport(f.input, actor),
    ]);
    expect(results.reduce((sum, r) => sum + r.materialsCreated, 0)).toBe(1);
    expect(results.reduce((sum, r) => sum + r.recipesDrafted, 0)).toBe(1);
    expect(await recipesFor(f.menuItemId)).toHaveLength(1);
    const ingredients = await t.getDb().select().from(t.schema.inventoryItems)
      .where(eq(t.schema.inventoryItems.sku, f.sku));
    expect(ingredients).toHaveLength(1);
  });

  it.each([0, -5])("refuses to activate a draft with nonpositive quantity %s", async (qty) => {
    const f = await fixture();
    await service.applyMasterImport(f.input, actor);
    await t.getDb().update(t.schema.menuRecipes).set({ qty })
      .where(eq(t.schema.menuRecipes.menuItemId, f.menuItemId));

    await expect(service.approveDraftRecipe(f.menuItemId, actor)).rejects.toThrow();
    await assertStillDraft(f.menuItemId);
  });

  it("refuses to activate a draft whose recipe and ingredient units have different dimensions", async () => {
    const f = await fixture();
    await service.applyMasterImport(f.input, actor);
    await t.getDb().update(t.schema.menuRecipes).set({ unit: "ml" })
      .where(eq(t.schema.menuRecipes.menuItemId, f.menuItemId));

    await expect(service.approveDraftRecipe(f.menuItemId, actor)).rejects.toThrow();
    await assertStillDraft(f.menuItemId);
  });
  it("rolls activation and HPP back when the WMS BOM sync fails", async () => {
    const f = await fixture();
    await service.applyMasterImport(f.input, actor);
    const bridge = await import("@/lib/wms-bridge");
    const failSync = vi.spyOn(bridge, "syncOsRecipesToWms").mockRejectedValueOnce(new Error("BOM unavailable"));
    try {
      await expect(service.approveDraftRecipe(f.menuItemId, actor)).rejects.toThrow("BOM unavailable");
      await assertStillDraft(f.menuItemId);
    } finally { failSync.mockRestore(); }
  });

});
