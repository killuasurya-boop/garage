import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 4 — Recipe/BOM + HPP: COGS/foodCost/margin dihitung dari product.hpp,
// dan otomatis ikut berubah saat HPP bahan berubah.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

describe("Recipe / HPP", () => {
  it("COGS dihitung dari BOM × product.hpp; margin & food cost benar", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB"); // hpp 0.12
    const milk = prods.find((p: any) => p.sku === "MILK-FC"); // hpp 0.018

    const rec = await svc.createWmsRecipe({
      name: "Kopi Susu Garage",
      category: "Coffee",
      sellPrice: 18000,
      bom: [
        { productId: bean.id, qty: 18 }, // 2.16
        { productId: milk.id, qty: 150 }, // 2.70
      ],
    });

    const detail = await svc.getWmsRecipe(rec.id);
    expect(detail.cogs).toBe(5); // round(4.86)
    expect(detail.margin).toBe(18000 - 5);
    expect(detail.bom.length).toBe(2);
    // kontribusi: milk (2.70) > bean (2.16)
    const milkLine = detail.bom.find((b: any) => b.productName.includes("Susu"));
    expect(milkLine.contribPct).toBeGreaterThan(50);
  });

  it("HPP bahan berubah → COGS resep otomatis ikut (tidak disimpan)", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
    const rec = await svc.createWmsRecipe({
      name: "Espresso",
      sellPrice: 15000,
      bom: [{ productId: bean.id, qty: 18 }],
    });
    const before = await svc.getWmsRecipe(rec.id);
    expect(before.cogs).toBe(2); // round(18*0.12=2.16)

    // ubah HPP bean jadi 0.5
    const { eq } = await import("drizzle-orm");
    await t.getDb().update(t.schema.wmsProduct).set({ hpp: 0.5 }).where(eq(t.schema.wmsProduct.id, bean.id));

    const after = await svc.getWmsRecipe(rec.id);
    expect(after.cogs).toBe(9); // round(18*0.5=9)
  });

  it("finance overview: KPI terisi", async () => {
    const fin = await svc.getWmsFinanceOverview();
    expect(fin.kpis.totalRecipes).toBeGreaterThanOrEqual(2);
    expect(fin.kpis.totalMaterials).toBeGreaterThan(0);
    expect(Array.isArray(fin.materials)).toBe(true);
  });

  it("ingredient library: klasifikasi bahan dari wms_product", async () => {
    const rows = await svc.listWmsIngredientLibrary({ type: "raw" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: { ingredientType: string }) => r.ingredientType === "raw")).toBe(true);
  });

  it("approval workflow: draft → pending_kitchen → published", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
    const rec = await svc.createWmsRecipe({
      name: "Manual Approval Test",
      sellPrice: 12000,
      bom: [{ productId: bean.id, qty: 10 }],
    });
    expect(rec.recipeStatus).toBe("draft");

    const actor = { id: "test-user", name: "Test Owner", role: "Owner / CEO" };
    await svc.submitRecipeForApproval(rec.id, actor);
    let row = await svc.getWmsRecipe(rec.id);
    expect(row.recipeStatus).toBe("pending_kitchen");

    await svc.approveRecipeStep(rec.id, { ...actor, role: "Koki" });
    row = await svc.getWmsRecipe(rec.id);
    expect(row.recipeStatus).toBe("pending_warehouse");

    await svc.approveRecipeStep(rec.id, actor);
    row = await svc.getWmsRecipe(rec.id);
    expect(row.recipeStatus).toBe("pending_manager");

    await svc.approveRecipeStep(rec.id, actor);
    row = await svc.getWmsRecipe(rec.id);
    expect(row.recipeStatus).toBe("pending_owner");

    await svc.approveRecipeStep(rec.id, actor);
    row = await svc.getWmsRecipe(rec.id);
    expect(row.recipeStatus).toBe("published");

    const audit = await svc.getRecipeAuditLog(rec.id);
    expect(audit.length).toBeGreaterThanOrEqual(5);
  });

  it("duplicate & archive resep manual", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
    const rec = await svc.createWmsRecipe({
      name: "Archive Dup Test",
      sellPrice: 8000,
      bom: [{ productId: bean.id, qty: 5 }],
    });
    const copy = await svc.duplicateWmsRecipe(rec.id, { id: "u1", name: "Tester" });
    expect(copy.name).toContain("salinan");
    const copyDetail = await svc.getWmsRecipe(copy.id);
    expect(copyDetail.bom.length).toBe(1);

    const archived = await svc.archiveWmsRecipe(rec.id, { id: "u1", name: "Tester" });
    expect(archived.recipeStatus).toBe("archived");
  });

  it("batch calculator: hitung kebutuhan bahan", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
    const rec = await svc.createWmsRecipe({
      name: "Batch Test",
      sellPrice: 15000,
      bom: [{ productId: bean.id, qty: 18 }],
    });
    const batch = await svc.calculateRecipeBatch(rec.id, 10);
    expect(batch).not.toBeNull();
    expect(batch!.targetQty).toBe(10);
    expect(batch!.lines.length).toBe(1);
    expect(batch!.lines[0].neededQty).toBe(180);
  });

  it("dependency map: shared ingredients antar resep", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
    const a = await svc.createWmsRecipe({
      name: "Dep Map A",
      sellPrice: 10000,
      bom: [{ productId: bean.id, qty: 5 }],
    });
    const b = await svc.createWmsRecipe({
      name: "Dep Map B",
      sellPrice: 12000,
      bom: [{ productId: bean.id, qty: 8 }],
    });
    const map = await svc.getWmsRecipeDependencyMap(a.id);
    expect(map).not.toBeNull();
    expect(map!.upstream.length).toBe(1);
    const shared = map!.sharedRecipes.find((s: { productId: string }) => s.productId === bean.id);
    expect(shared?.recipes.some((r: { recipeId: string }) => r.recipeId === b.id)).toBe(true);
  });

  it("toggle favorite resep", async () => {
    const rec = await svc.createWmsRecipe({ name: "Fav Test", sellPrice: 5000, bom: [] });
    const on = await svc.toggleWmsRecipeFavorite(rec.id);
    expect(on.isFavorite).toBe(true);
    const off = await svc.toggleWmsRecipeFavorite(rec.id);
    expect(off.isFavorite).toBe(false);
  });

  it("SOP production steps pada resep manual", async () => {
    const rec = await svc.createWmsRecipe({ name: "SOP Test", sellPrice: 9000, bom: [] });
    const updated = await svc.updateWmsRecipeSop(
      rec.id,
      [
        { order: 1, title: "Timbang bahan", durationMin: 3, notes: "Timbang espresso" },
        { order: 2, title: "Sajikan", durationMin: 1, notes: "" },
      ],
      { id: "", name: "Tester" },
    );
    expect(updated.sopSteps.length).toBe(2);
    const detail = await svc.getWmsRecipe(rec.id);
    expect(detail.sopSteps[0].title).toBe("Timbang bahan");
    expect(detail.recipeStatus).toBe("draft");
  });

  it("import resep dari bundle JSON", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: any) => p.sku === "BEAN-ARB");
    const preview = await svc.importWmsRecipesFromBundle(
      {
        recipes: [
          {
            name: "Import Test Coffee",
            sellPrice: 15000,
            sopSteps: [{ order: 1, title: "Seduh", durationMin: 2, notes: "" }],
            bom: [{ sku: bean.sku, qty: 18, lineType: "ingredient" }],
          },
        ],
      },
      { dryRun: true },
    );
    expect(preview.preview.length).toBe(1);
    const done = await svc.importWmsRecipesFromBundle(
      {
        recipes: [
          {
            name: "Import Test Coffee",
            sellPrice: 15000,
            bom: [{ sku: bean.sku, qty: 18 }],
          },
        ],
      },
      { dryRun: false },
    );
    expect(done.created).toBe(1);
  });

  it("version history: snapshot, compare, restore", async () => {
    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: { sku: string }) => p.sku === "BEAN-ARB");
    const rec = await svc.createWmsRecipe({
      name: "Version History Test",
      sellPrice: 18000,
      bom: [{ productId: bean!.id, qty: 12 }],
    });
    expect(rec).toBeTruthy();

    const initialVersions = await svc.listWmsRecipeVersions(rec.id);
    expect(initialVersions.length).toBeGreaterThanOrEqual(1);

    await svc.updateWmsRecipeSop(
      rec.id,
      [{ order: 1, title: "Seduh", durationMin: 2, notes: "" }],
      { id: "test-user", name: "Tester" },
    );

    const afterSop = await svc.listWmsRecipeVersions(rec.id);
    expect(afterSop.length).toBeGreaterThan(initialVersions.length);

    const target = afterSop.find((v: { label: string }) => v.label.includes("Sebelum update SOP")) ?? afterSop[0];
    const detail = await svc.getWmsRecipeVersionDetail(target.id);
    expect(detail).not.toBeNull();
    expect(detail!.compareToCurrent).not.toBeNull();

    const restored = await svc.restoreWmsRecipeVersion(rec.id, target.id, { id: "u1", name: "Tester" });
    expect(restored).not.toBeNull();
    expect(restored!.recipeStatus).toBe("draft");
  });

  it("recipe insights: rule-based health score", async () => {
    const rec = await svc.createWmsRecipe({ name: "Insight Empty BOM", sellPrice: 10000, bom: [] });
    const empty = await svc.getWmsRecipeInsights(rec.id);
    expect(empty.score).toBeLessThan(100);
    expect(empty.insights.some((i: { code: string }) => i.code === "bom_empty")).toBe(true);

    const prods = await svc.getWmsProducts();
    const bean = prods.find((p: { sku: string }) => p.sku === "BEAN-ARB");
    const withBom = await svc.createWmsRecipe({
      name: "Insight Healthy",
      sellPrice: 25000,
      bom: [{ productId: bean!.id, qty: 5 }],
    });
    const healthy = await svc.getWmsRecipeInsights(withBom.id);
    expect(healthy.insights.length).toBeGreaterThan(0);
    expect(healthy.score).toBeGreaterThan(0);
  });
});
