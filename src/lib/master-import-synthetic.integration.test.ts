import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { menuItems as seedMenu } from "@/lib/garage-data";
import { seedGarageBasics, setupGarageTestDb, teardownGarageTestDb, type GarageTestDb } from "@/lib/test-helpers/garage-test-db";
import { buildSyntheticMasterWorkbook } from "@/lib/test-helpers/master-workbook-fixture";

// =============================================================================
// Impor master Excel end-to-end dengan workbook SINTETIS (jalan di CI repo publik):
// preview tanpa tulis → apply bahan Dapur + resep draft, POS tidak berubah → idempoten →
// setujui/tolak draft. Versi dengan workbook asli: master-import.integration.test.ts (bila berkas ada).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
let t: GarageTestDb;
let mi: any;
let baseline: any;
let buffer: Buffer;
const ACTOR = { id: "owner-master-sintetis", name: "Owner Master" };

beforeAll(async () => {
  buffer = await buildSyntheticMasterWorkbook();
  t = await setupGarageTestDb();
  await seedGarageBasics(t, { userId: ACTOR.id });
  const d = t.getDb();
  const food = seedMenu.filter((m) => m.category === "Makanan" || m.category === "Cemilan");
  await d.insert(t.schema.menuItems).values(food.map((m) => ({ id: m.id, name: m.name, category: m.category, section: m.section, prep: m.prep })));
  await d.insert(t.schema.menuVariants).values(
    food.flatMap((m) => m.variants.map((v) => ({ itemId: m.id, variantId: v.id, label: v.label, price: v.price }))),
  );
  mi = await import("@/lib/master-import");
  baseline = await import("@/lib/pos-baseline");
}, 60_000);

afterAll(async () => {
  if (t) await teardownGarageTestDb(t);
});

describe("Impor master Excel — workbook sintetis", () => {
  it("preview tidak menulis data operasional", async () => {
    const res = await mi.previewMasterImport({ buffer, fileName: "master-sintetis.xlsx" }, ACTOR);
    expect(res.summary.materialsToCreate).toBe(5);
    expect(res.summary.recipesNewDraft).toBe(2);
    const items = await t.getDb().select().from(t.schema.inventoryItems);
    expect(items.filter((i: any) => i.sku.startsWith("KIT-")).length).toBe(0);
  });

  it("apply: 5 bahan Dapur + 2 resep draft; POS tidak berubah; draft tidak masuk HPP", async () => {
    const before = await baseline.getPosBaseline();
    const res = await mi.applyMasterImport({ buffer, fileName: "master-sintetis.xlsx" }, ACTOR);
    expect(res.materialsCreated).toBe(5);
    expect(res.recipesDrafted).toBe(2);
    expect((await baseline.getPosBaseline()).hash).toBe(before.hash);

    const { eq } = await import("drizzle-orm");
    const d = t.getDb();
    const [egg] = await d.select().from(t.schema.inventoryItems).where(eq(t.schema.inventoryItems.sku, "KIT-027"));
    expect(egg).toMatchObject({ unit: "pcs", packageQty: 30, purchasePrice: 48000 });
    expect(Number(egg.unitCost)).toBe(1600);
    const [wmsSoap] = await d.select().from(t.schema.wmsProduct).where(eq(t.schema.wmsProduct.sku, "KIT-040"));
    expect(wmsSoap.category).toBe("Dapur · Gas & Kebersihan");
    const drafts = await d.select().from(t.schema.menuRecipes).where(eq(t.schema.menuRecipes.status, "draft"));
    expect(new Set(drafts.map((r: any) => r.menuItemId))).toEqual(new Set(["makanan-nasi", "cemilan-nugget"]));
    const [nasiVariant] = await d.select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "makanan-nasi"));
    expect(nasiVariant.baseCost).toBe(0);
  });

  it("apply ulang idempoten (tidak membuat bahan/resep dobel)", async () => {
    const res = await mi.applyMasterImport({ buffer, fileName: "master-sintetis.xlsx" }, ACTOR);
    expect(res.materialsCreated).toBe(0);
    expect(res.recipesDrafted).toBe(0);
  });

  it("setujui draft → aktif & HPP varian terhitung; tolak → arsip dengan alasan", async () => {
    const list = await mi.listDraftRecipes();
    expect(list.find((r: any) => r.menuItemId === "makanan-nasi").referenceHpp).toBe(Math.round(70 * 15.5));
    await mi.approveDraftRecipe("makanan-nasi", ACTOR);
    const { eq } = await import("drizzle-orm");
    const d = t.getDb();
    const [variant] = await d.select().from(t.schema.menuVariants).where(eq(t.schema.menuVariants.itemId, "makanan-nasi"));
    expect(variant.baseCost).toBe(Math.round(70 * 15.5));
    expect(variant.price).toBe(5000);
    await expect(mi.approveDraftRecipe("makanan-nasi", ACTOR)).rejects.toThrow(/Tidak ada resep draft/);
    await expect(mi.rejectDraftRecipe("cemilan-nugget", "x", ACTOR)).rejects.toThrow(/Alasan/);
    await mi.rejectDraftRecipe("cemilan-nugget", "Gramasi belum diuji", ACTOR);
    const nugget = await d.select().from(t.schema.menuRecipes).where(eq(t.schema.menuRecipes.menuItemId, "cemilan-nugget"));
    expect(nugget.every((r: any) => r.status === "archived")).toBe(true);
  });
});
