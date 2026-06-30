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
});
