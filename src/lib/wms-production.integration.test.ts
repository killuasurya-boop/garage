import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  setupGarageTestDb,
  teardownGarageTestDb,
  type GarageTestDb,
} from "@/lib/test-helpers/garage-test-db";

// =============================================================================
// WMS Fase 5 — Production: konsumsi bahan input (FEFO) → hasil produk output.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let svc: any;
let main: any;

beforeAll(async () => {
  t = await setupGarageTestDb();
  svc = await import("@/lib/wms-service");
  await svc.getWmsProducts();
  main = (await svc.listWmsWarehouses()).find((w: any) => w.isPrimary);
}, 60_000);

afterAll(async () => {
  await teardownGarageTestDb(t);
});

async function onHand(sku: string) {
  return (await svc.getWmsProducts({ warehouseId: main.id })).find((p: any) => p.sku === sku)?.onHand ?? 0;
}

describe("runProduction", () => {
  it("olah GULA → Simple Syrup: input berkurang, output bertambah", async () => {
    const prods = await svc.getWmsProducts();
    const sugar = prods.find((p: any) => p.sku === "SUGAR-PALM");
    // Output produk baru (setengah jadi).
    const syrup = await svc.createWmsProduct({ sku: "SYRUP-SIMPLE", name: "Simple Syrup", category: "Bahan Bar", unit: "ml" }, null);

    const recipe = await svc.createProductionRecipe({
      name: "Simple Syrup",
      outputProductId: syrup.id,
      outputQty: 100, // 100 ml per batch
      bom: [{ inputProductId: sugar.id, qty: 50 }], // 50 ml gula/batch
    }, null);

    const sugarBefore = await onHand("SUGAR-PALM");
    const res = await svc.runProduction({ recipeId: recipe.id, batches: 2, warehouseId: main.id }, null);
    expect(res.doc).toMatch(/^PRD-/);
    expect(res.producedQty).toBe(200); // 100 × 2

    expect(await onHand("SUGAR-PALM")).toBe(sugarBefore - 100); // 50 × 2
    expect(await onHand("SYRUP-SIMPLE")).toBe(200);

    // HPP output ter-set dari biaya bahan (> 0).
    const syrupRow = (await svc.getWmsProducts()).find((p: any) => p.sku === "SYRUP-SIMPLE");
    expect(syrupRow.hpp).toBeGreaterThan(0);
  });

  it("tolak produksi bila bahan tidak cukup", async () => {
    const prods = await svc.getWmsProducts();
    const sugar = prods.find((p: any) => p.sku === "SUGAR-PALM");
    const out = await svc.createWmsProduct({ sku: "OUT-BIG", name: "Output Besar", category: "Umum", unit: "pcs" }, null);
    const recipe = await svc.createProductionRecipe({
      name: "Butuh banyak",
      outputProductId: out.id,
      outputQty: 1,
      bom: [{ inputProductId: sugar.id, qty: 9_999_999 }],
    }, null);
    await expect(
      svc.runProduction({ recipeId: recipe.id, batches: 1, warehouseId: main.id }, null),
    ).rejects.toThrow(/tidak cukup/i);
  });
});
